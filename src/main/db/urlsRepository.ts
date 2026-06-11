import type Database from "better-sqlite3";
import type { FileUrlRecord } from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import { normalizeUrl } from "./urlText.js";

export function listFileUrls(fileIds: number[]): FileUrlRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  if (normalizedFileIds.length === 1) {
    return db
      .prepare(
        `SELECT
          id,
          file_id AS fileId,
          url,
          normalized_url AS normalizedUrl,
          source,
          created_at AS createdAt,
          updated_at AS updatedAt,
          1 AS fileCount
         FROM file_urls
         WHERE file_id = ?
         ORDER BY lower(url) ASC, id ASC`,
      )
      .all(normalizedFileIds[0]) as FileUrlRecord[];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);

  return db
    .prepare(
      `SELECT
        MIN(id) AS id,
        0 AS fileId,
        url,
        MIN(normalized_url) AS normalizedUrl,
        MIN(source) AS source,
        MIN(created_at) AS createdAt,
        MAX(updated_at) AS updatedAt,
        COUNT(DISTINCT file_id) AS fileCount
       FROM file_urls
       WHERE file_id IN (${placeholders})
       GROUP BY url
       HAVING COUNT(DISTINCT file_id) = ?
       ORDER BY lower(url) ASC`,
    )
    .all(...normalizedFileIds, normalizedFileIds.length) as FileUrlRecord[];
}

export function addFileUrl(fileIds: number[], url: string): FileUrlRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedUrl = normalizeUrl(url);

  if (normalizedFileIds.length === 0 || !normalizedUrl) {
    return listFileUrls(normalizedFileIds);
  }

  db.transaction(() => {
    ensureFilesExist(db, normalizedFileIds);

    for (const fileId of normalizedFileIds) {
      db.prepare(
        `INSERT OR IGNORE INTO file_urls (file_id, url, normalized_url, source)
         VALUES (?, ?, ?, ?)`,
      ).run(fileId, normalizedUrl, normalizedUrl, null);
    }
  })();

  return listFileUrls(normalizedFileIds);
}

export function updateFileUrl(
  fileIds: number[],
  urlId: number,
  previousUrl: string,
  nextUrl: string,
): FileUrlRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedPreviousUrl = normalizeUrl(previousUrl);
  const normalizedNextUrl = normalizeUrl(nextUrl);

  if (normalizedFileIds.length === 0 || !normalizedNextUrl) {
    return listFileUrls(normalizedFileIds);
  }

  db.transaction(() => {
    ensureFilesExist(db, normalizedFileIds);

    if (
      normalizedFileIds.length === 1 &&
      Number.isInteger(urlId) &&
      urlId > 0
    ) {
      db.prepare(
        `UPDATE file_urls
         SET url = ?,
             normalized_url = ?,
             updated_at = datetime('now')
         WHERE id = ?
           AND file_id = ?`,
      ).run(normalizedNextUrl, normalizedNextUrl, urlId, normalizedFileIds[0]);
      return;
    }

    if (!normalizedPreviousUrl) {
      return;
    }

    const placeholders = createPlaceholders(normalizedFileIds.length);
    db.prepare(
      `DELETE FROM file_urls
       WHERE file_id IN (${placeholders})
         AND url = ?`,
    ).run(...normalizedFileIds, normalizedPreviousUrl);

    for (const fileId of normalizedFileIds) {
      db.prepare(
        `INSERT OR IGNORE INTO file_urls (file_id, url, normalized_url, source)
         VALUES (?, ?, ?, ?)`,
      ).run(fileId, normalizedNextUrl, normalizedNextUrl, null);
    }
  })();

  return listFileUrls(normalizedFileIds);
}

export function removeFileUrl(
  fileIds: number[],
  urlId: number,
  url: string,
): FileUrlRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedUrl = normalizeUrl(url);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  db.transaction(() => {
    if (
      normalizedFileIds.length === 1 &&
      Number.isInteger(urlId) &&
      urlId > 0
    ) {
      db.prepare("DELETE FROM file_urls WHERE id = ? AND file_id = ?").run(
        urlId,
        normalizedFileIds[0],
      );
      return;
    }

    if (!normalizedUrl) {
      return;
    }

    const placeholders = createPlaceholders(normalizedFileIds.length);
    db.prepare(
      `DELETE FROM file_urls
       WHERE file_id IN (${placeholders})
         AND url = ?`,
    ).run(...normalizedFileIds, normalizedUrl);
  })();

  return listFileUrls(normalizedFileIds);
}

function normalizeFileIds(fileIds: number[]): number[] {
  const seen = new Set<number>();
  const normalizedFileIds: number[] = [];

  for (const fileId of fileIds) {
    if (!Number.isInteger(fileId) || fileId <= 0 || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    normalizedFileIds.push(fileId);
  }

  return normalizedFileIds;
}

function ensureFilesExist(db: Database.Database, fileIds: number[]): void {
  if (fileIds.length === 0) {
    return;
  }

  const placeholders = createPlaceholders(fileIds.length);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM files WHERE id IN (${placeholders})`,
    )
    .get(...fileIds) as { count: number } | undefined;

  if ((row?.count ?? 0) !== fileIds.length) {
    throw new Error("文件不存在");
  }
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
