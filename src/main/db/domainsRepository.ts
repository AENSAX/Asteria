import type { DomainRecord, FileDomain } from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import { createPlaceholders, normalizeFileIds } from "./queryUtils.js";

export const FILE_DOMAIN_PENDING: FileDomain = "pending";
export const FILE_DOMAIN_LIBRARY: FileDomain = "library";
export const FILE_DOMAIN_TRASH: FileDomain = "trash";

export function listDomains(): DomainRecord[] {
  const db = getDatabaseConnection();
  const rows = db
    .prepare(
      `SELECT
        SUM(CASE WHEN deleted_at IS NULL AND domain = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
        SUM(CASE WHEN deleted_at IS NULL AND domain = 'library' THEN 1 ELSE 0 END) AS libraryCount,
        SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashCount
       FROM files`,
    )
    .get() as
    | {
        pendingCount: number | null;
        libraryCount: number | null;
        trashCount: number | null;
      }
    | undefined;

  return [
    {
      id: FILE_DOMAIN_PENDING,
      name: FILE_DOMAIN_PENDING,
      displayName: "待入库",
      fileCount: rows?.pendingCount ?? 0,
    },
    {
      id: FILE_DOMAIN_LIBRARY,
      name: FILE_DOMAIN_LIBRARY,
      displayName: "已在库中",
      fileCount: rows?.libraryCount ?? 0,
    },
    {
      id: FILE_DOMAIN_TRASH,
      name: FILE_DOMAIN_TRASH,
      displayName: "回收站",
      fileCount: rows?.trashCount ?? 0,
    },
  ];
}

export function setFilesDomain(fileIds: number[], domain: FileDomain): void {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  if (domain !== FILE_DOMAIN_PENDING && domain !== FILE_DOMAIN_LIBRARY) {
    throw new Error("文件域无效");
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  db.prepare(
    `UPDATE files
     SET domain = ?,
         deleted_at = NULL,
         updated_at = datetime('now')
     WHERE id IN (${placeholders})`,
  ).run(domain, ...normalizedFileIds);
}

export function getDomainSearchAliases(domain: FileDomain): string[] {
  if (domain === FILE_DOMAIN_LIBRARY) {
    return ["domain:library", "已在库中", "in library", "library"];
  }

  if (domain === FILE_DOMAIN_TRASH) {
    return ["domain:trash", "回收站", "recycle bin", "trash"];
  }

  return ["domain:pending", "待入库", "pending"];
}

export function createDomainPseudoTagId(domain: FileDomain): number {
  if (domain === FILE_DOMAIN_PENDING) {
    return -1;
  }

  if (domain === FILE_DOMAIN_LIBRARY) {
    return -2;
  }

  return -3;
}
