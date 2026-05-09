import { app } from "electron";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  getApiServiceAvailability as getApiServiceConfigAvailability,
  getApiFileByIdentifier,
  getDatabaseStatus,
  listApiFileIdentifiers,
  listApiServices,
  updateApiFileMetadata,
} from "./database.js";
import type {
  ApiServiceAvailability,
  ApiServiceRecord,
} from "../shared/ipc.js";
import {
  handleBatchUploadRequest,
  handleFileDuplicateLookup,
  handleSingleFileUpload,
  normalizeApiTags,
  normalizeApiUrls,
  readJsonBody,
} from "./apiUploadService.js";

interface RunningApiService {
  service: ApiServiceRecord;
  server: Server;
  signature: string;
  listening: boolean;
  error: string | null;
}

const runningApiServices = new Map<number, RunningApiService>();
let syncQueue = Promise.resolve();
let filesChangedHandler: (() => void) | null = null;

export function setApiFilesChangedHandler(handler: () => void): void {
  filesChangedHandler = handler;
}

export function syncApiServers(): Promise<void> {
  syncQueue = syncQueue.then(syncApiServersNow, syncApiServersNow);
  return syncQueue;
}

export async function stopApiServers(): Promise<void> {
  const runtimes = [...runningApiServices.values()];
  runningApiServices.clear();

  await Promise.all(runtimes.map((runtime) => closeServer(runtime.server)));
}

export function getApiServiceRuntimeAvailability(
  serviceId: number,
): ApiServiceAvailability {
  const availability = getApiServiceConfigAvailability(serviceId);
  const runtime = runningApiServices.get(serviceId);

  if (!availability.available) {
    return availability;
  }

  if (runtime?.listening) {
    return {
      ...availability,
      reason: "运行中",
    };
  }

  if (runtime?.error) {
    return {
      ...availability,
      available: false,
      reason: runtime.error,
    };
  }

  return {
    ...availability,
    available: false,
    reason: "未监听",
  };
}

async function syncApiServersNow(): Promise<void> {
  const services = listApiServices();
  const servicesById = new Map(
    services.map((service) => [service.id, service]),
  );

  for (const [serviceId, runtime] of runningApiServices) {
    const service = servicesById.get(serviceId);

    if (
      !service ||
      runtime.error ||
      !shouldRunApiService(service) ||
      createServiceSignature(service) !== runtime.signature
    ) {
      runningApiServices.delete(serviceId);
      await closeServer(runtime.server);
    }
  }

  for (const service of services) {
    if (!shouldRunApiService(service) || runningApiServices.has(service.id)) {
      continue;
    }

    await startApiServer(service);
  }
}

function shouldRunApiService(service: ApiServiceRecord): boolean {
  return getApiServiceConfigAvailability(service.id).available;
}

async function startApiServer(service: ApiServiceRecord): Promise<void> {
  const signature = createServiceSignature(service);
  const server = createServer((request, response) => {
    void handleApiRequest(service, request, response).catch((error) => {
      writeJson(response, 500, {
        error: "internal_error",
        message: error instanceof Error ? error.message : "未知 API 错误",
      });
    });
  });
  const runtime: RunningApiService = {
    service,
    server,
    signature,
    listening: false,
    error: null,
  };

  runningApiServices.set(service.id, runtime);

  await new Promise<void>((resolve) => {
    let settled = false;

    server.on("error", (error) => {
      runtime.error = `监听失败: ${error.message}`;
      runtime.listening = false;

      if (!settled) {
        settled = true;
        resolve();
      }
    });

    server.listen(service.port, service.address, () => {
      if (!settled) {
        runtime.listening = true;
        settled = true;
        resolve();
      }
    });
  });
}

async function handleApiRequest(
  service: ApiServiceRecord,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method === "OPTIONS") {
    writeNoContent(response);
    return;
  }

  if (!isAuthorized(service, request)) {
    writeJson(response, 401, {
      error: "unauthorized",
      message: "需要有效的 Bearer token",
    });
    return;
  }

  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? `${service.address}:${service.port}`}`,
  );

  if (url.pathname === "/api/status") {
    handleStatusRequest(service, request, response);
    return;
  }

  if (
    url.pathname === "/api/upload/file" ||
    url.pathname.startsWith("/api/upload/batch/")
  ) {
    await handleUploadRequest(service, request, response, url);
    return;
  }

  if (url.pathname === "/api/files" || url.pathname.startsWith("/api/files/")) {
    await handleFilesRequest(service, request, response, url);
    return;
  }

  writeJson(response, 404, {
    error: "not_found",
    message: "接口不存在",
  });
}

async function handleUploadRequest(
  service: ApiServiceRecord,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  if (!service.permissions.includes("files.upload")) {
    writeJson(response, 403, {
      error: "forbidden",
      message: "当前 API 服务未启用上传文件权限",
    });
    return;
  }

  if (url.pathname === "/api/upload/file") {
    if (request.method !== "POST") {
      writeJson(response, 405, {
        error: "method_not_allowed",
        message: "仅支持 POST",
      });
      return;
    }

    const result = await handleSingleFileUpload(request);
    writeJson(response, result.statusCode, result.body);
    notifyFilesChangedForSuccessfulResult(result);
    return;
  }

  const result = await handleBatchUploadRequest(
    request,
    url.pathname.split("/").filter(Boolean),
  );
  writeJson(response, result.statusCode, result.body);
  notifyFilesChangedForSuccessfulResult(result);
}

async function handleFilesRequest(
  service: ApiServiceRecord,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  if (url.pathname === "/api/files/duplicates") {
    await handleFileDuplicateLookupRequest(service, request, response);
    return;
  }

  const metadataMatch = /^\/api\/files\/([^/]+)\/metadata$/.exec(url.pathname);

  if (metadataMatch) {
    await handleFileMetadataUpdateRequest(
      service,
      request,
      response,
      decodeURIComponent(metadataMatch[1]),
    );
    return;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: "仅支持 GET",
    });
    return;
  }

  if (!hasReadFilesPermission(service, response)) {
    return;
  }

  if (url.pathname === "/api/files") {
    const identifiers = listApiFileIdentifiers();

    writeJson(response, 200, {
      ok: true,
      identifiers,
      total: identifiers.length,
    });
    return;
  }

  const match = /^\/api\/files\/([^/]+)$/.exec(url.pathname);

  if (!match) {
    writeJson(response, 404, {
      error: "not_found",
      message: "接口不存在",
    });
    return;
  }

  const apiIdentifier = decodeURIComponent(match[1]);
  const file = getApiFileByIdentifier(apiIdentifier);

  if (!file) {
    writeJson(response, 404, {
      error: "not_found",
      message: "文件对象不存在",
    });
    return;
  }

  writeJson(response, 200, {
    ok: true,
    file,
  });
  filesChangedHandler?.();
}

function notifyFilesChangedForSuccessfulResult(result: {
  statusCode: number;
  body: unknown;
}): void {
  const body = result.body as { ok?: unknown } | null;

  if (
    result.statusCode >= 200 &&
    result.statusCode < 300 &&
    body?.ok === true
  ) {
    filesChangedHandler?.();
  }
}

async function handleFileDuplicateLookupRequest(
  service: ApiServiceRecord,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: "仅支持 POST",
    });
    return;
  }

  if (!hasReadFilesPermission(service, response)) {
    return;
  }

  const result = await handleFileDuplicateLookup(request);
  writeJson(response, result.statusCode, result.body);
}

async function handleFileMetadataUpdateRequest(
  service: ApiServiceRecord,
  request: IncomingMessage,
  response: ServerResponse,
  apiIdentifier: string,
): Promise<void> {
  if (request.method !== "PUT") {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: "仅支持 PUT",
    });
    return;
  }

  if (!service.permissions.includes("files.write")) {
    writeJson(response, 403, {
      error: "forbidden",
      message: "当前 API 服务未启用写入文件信息权限",
    });
    return;
  }

  const rawBody = await readJsonBody(request);
  const body =
    rawBody && typeof rawBody === "object"
      ? (rawBody as Record<string, unknown>)
      : {};
  const update = {
    tags: Object.prototype.hasOwnProperty.call(body, "tags")
      ? normalizeApiTags(body.tags)
      : undefined,
    tagStyleName:
      typeof body.tagStyle === "string" && body.tagStyle.trim()
        ? body.tagStyle.trim()
        : null,
    urls: Object.prototype.hasOwnProperty.call(body, "urls")
      ? normalizeApiUrls(body.urls)
      : Object.prototype.hasOwnProperty.call(body, "url")
        ? normalizeApiUrls(body.url)
        : undefined,
  };

  if (!Array.isArray(update.tags) && !Array.isArray(update.urls)) {
    writeJson(response, 400, {
      error: "bad_request",
      message: "必须提供 tags 或 urls",
    });
    return;
  }

  const file = updateApiFileMetadata(apiIdentifier, update);

  if (!file) {
    writeJson(response, 404, {
      error: "not_found",
      message: "文件对象不存在",
    });
    return;
  }

  writeJson(response, 200, {
    ok: true,
    file,
  });
}

function hasReadFilesPermission(
  service: ApiServiceRecord,
  response: ServerResponse,
): boolean {
  if (service.permissions.includes("files.read")) {
    return true;
  }

  writeJson(response, 403, {
    error: "forbidden",
    message: "当前 API 服务未启用读取文件权限",
  });
  return false;
}

function handleStatusRequest(
  service: ApiServiceRecord,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.method !== "GET") {
    writeJson(response, 405, {
      error: "method_not_allowed",
      message: "仅支持 GET",
    });
    return;
  }

  if (!service.permissions.includes("status.read")) {
    writeJson(response, 403, {
      error: "forbidden",
      message: "当前 API 服务未启用读取状态权限",
    });
    return;
  }

  const databaseStatus = getDatabaseStatus();

  writeJson(response, 200, {
    ok: true,
    app: {
      name: "Asteria",
      version: app.getVersion(),
    },
    service: {
      id: service.id,
      name: service.name,
      address: service.address,
      port: service.port,
      permissions: service.permissions,
    },
    database: {
      schemaVersion: databaseStatus.schemaVersion,
      fileCount: databaseStatus.fileCount,
      importBatchCount: databaseStatus.importBatchCount,
      tagCount: databaseStatus.tagCount,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    currentTime: new Date().toISOString(),
  });
}

function isAuthorized(
  service: ApiServiceRecord,
  request: IncomingMessage,
): boolean {
  const authorization = request.headers.authorization ?? "";
  const expectedAuthorization = `Bearer ${service.token}`;

  return authorization === expectedAuthorization;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function writeNoContent(response: ServerResponse): void {
  response.writeHead(204, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": "*",
  });
  response.end();
}

function createServiceSignature(service: ApiServiceRecord): string {
  return JSON.stringify({
    address: service.address.trim().toLowerCase(),
    port: service.port,
    token: service.token,
    permissions: [...service.permissions].sort(),
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}
