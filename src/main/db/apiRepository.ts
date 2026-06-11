import type {
  ApiPermissionRecord,
  ApiServiceAvailability,
  ApiServiceDraft,
  ApiServiceRecord,
} from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";

const apiPermissions: ApiPermissionRecord[] = [
  { id: "status.read", name: "读取状态", description: "GET /api/status" },
  {
    id: "files.read",
    name: "读取文件",
    description:
      "GET /api/files, GET /api/files/:identifier, POST /api/files/duplicates",
  },
  {
    id: "files.write",
    name: "写入文件信息",
    description: "PUT /api/files/:identifier/metadata",
  },
  {
    id: "files.upload",
    name: "上传文件",
    description: "POST /api/upload/file, POST /api/upload/batch/*",
  },
];

export function listApiPermissions(): ApiPermissionRecord[] {
  return apiPermissions;
}

export function listApiServices(): ApiServiceRecord[] {
  const db = getDatabaseConnection();
  const rows = db
    .prepare(
      `SELECT
        id,
        name,
        address,
        port,
        token,
        enabled,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM api_services
       ORDER BY id ASC`,
    )
    .all() as Array<
    Omit<ApiServiceRecord, "enabled" | "permissions"> & { enabled: number }
  >;
  const permissionsByServiceId = readApiPermissionsByServiceId(
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    enabled: row.enabled === 1,
    permissions: permissionsByServiceId.get(row.id) ?? [],
  }));
}

export function createApiService(name: string): ApiServiceRecord[] {
  const db = getDatabaseConnection();
  const normalizedName = normalizeApiServiceName(name);

  db.prepare(
    `INSERT INTO api_services (name, address, port, token, enabled)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(normalizedName, "127.0.0.1", 17321, "", 0);

  return listApiServices();
}

export function updateApiService(
  serviceId: number,
  draft: ApiServiceDraft,
): ApiServiceRecord[] {
  const db = getDatabaseConnection();
  const normalizedDraft = normalizeApiServiceDraft(draft);

  db.transaction(() => {
    db.prepare(
      `UPDATE api_services
       SET name = ?,
           address = ?,
           port = ?,
           token = ?,
           enabled = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      normalizedDraft.name,
      normalizedDraft.address,
      normalizedDraft.port,
      normalizedDraft.token,
      normalizedDraft.enabled ? 1 : 0,
      serviceId,
    );

    db.prepare("DELETE FROM api_service_permissions WHERE service_id = ?").run(
      serviceId,
    );

    for (const permissionId of normalizedDraft.permissions) {
      db.prepare(
        `INSERT INTO api_service_permissions (service_id, permission_id)
         VALUES (?, ?)`,
      ).run(serviceId, permissionId);
    }
  })();

  return listApiServices();
}

export function deleteApiService(serviceId: number): ApiServiceRecord[] {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM api_services WHERE id = ?").run(serviceId);
  return listApiServices();
}

export function getApiServiceAvailability(
  serviceId: number,
): ApiServiceAvailability {
  const services = listApiServices();
  const service = services.find((item) => item.id === serviceId);

  if (!service) {
    return {
      serviceId,
      available: false,
      reason: "服务不存在",
      enabled: false,
      address: "",
      port: 0,
      permissionCount: 0,
    };
  }

  if (!service.enabled) {
    return createApiServiceAvailability(service, false, "未启用");
  }

  if (!service.address.trim()) {
    return createApiServiceAvailability(service, false, "地址为空");
  }

  if (
    !Number.isInteger(service.port) ||
    service.port <= 0 ||
    service.port > 65535
  ) {
    return createApiServiceAvailability(service, false, "端口无效");
  }

  if (!service.token.trim()) {
    return createApiServiceAvailability(service, false, "校验 token 为空");
  }

  if (service.permissions.length === 0) {
    return createApiServiceAvailability(service, false, "未勾选权限");
  }

  const hasPortConflict = services.some(
    (item) =>
      item.id !== service.id &&
      item.enabled &&
      item.address.trim().toLowerCase() ===
        service.address.trim().toLowerCase() &&
      item.port === service.port,
  );

  if (hasPortConflict) {
    return createApiServiceAvailability(
      service,
      false,
      "地址和端口已被其他启用 API 使用",
    );
  }

  return createApiServiceAvailability(service, true, "可用");
}

function readApiPermissionsByServiceId(
  serviceIds: number[],
): Map<number, string[]> {
  if (serviceIds.length === 0) {
    return new Map();
  }

  const db = getDatabaseConnection();
  const placeholders = createPlaceholders(serviceIds.length);
  const rows = db
    .prepare(
      `SELECT service_id AS serviceId, permission_id AS permissionId
       FROM api_service_permissions
       WHERE service_id IN (${placeholders})
       ORDER BY permission_id ASC`,
    )
    .all(...serviceIds) as Array<{ serviceId: number; permissionId: string }>;
  const permissionsByServiceId = new Map<number, string[]>();
  const allowedPermissions = new Set(
    apiPermissions.map((permission) => permission.id),
  );

  for (const row of rows) {
    if (!allowedPermissions.has(row.permissionId)) {
      continue;
    }

    const permissions = permissionsByServiceId.get(row.serviceId) ?? [];
    permissions.push(row.permissionId);
    permissionsByServiceId.set(row.serviceId, permissions);
  }

  return permissionsByServiceId;
}

function normalizeApiServiceName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  return (
    normalizedName ||
    `API 服务 ${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
}

function normalizeApiServiceDraft(draft: ApiServiceDraft): ApiServiceDraft {
  const allowedPermissions = new Set(
    apiPermissions.map((permission) => permission.id),
  );
  const permissions = [
    ...new Set(
      (Array.isArray(draft.permissions) ? draft.permissions : []).filter(
        (permissionId) => allowedPermissions.has(permissionId),
      ),
    ),
  ];

  return {
    name: normalizeApiServiceName(draft.name),
    address:
      typeof draft.address === "string" && draft.address.trim()
        ? draft.address.trim()
        : "127.0.0.1",
    port: Number.isInteger(draft.port)
      ? Math.min(65535, Math.max(1, draft.port))
      : 17321,
    token: typeof draft.token === "string" ? draft.token.trim() : "",
    enabled: draft.enabled === true,
    permissions,
  };
}

function createApiServiceAvailability(
  service: ApiServiceRecord,
  available: boolean,
  reason: string,
): ApiServiceAvailability {
  return {
    serviceId: service.id,
    available,
    reason,
    enabled: service.enabled,
    address: service.address,
    port: service.port,
    permissionCount: service.permissions.length,
  };
}

function createPlaceholders(length: number): string {
  return Array.from({ length }, () => "?").join(", ");
}
