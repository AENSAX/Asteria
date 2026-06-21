import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ApiFileRecord, TagDraft } from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import { FILE_DOMAIN_PENDING } from "./domainsRepository.js";
import { listFileTags } from "./fileTagsRepository.js";
import { listFileRatingsForExport } from "./filesRepository.js";
import { ensureTag, ensureTagNamespace, readTagId } from "./tagsRepository.js";
import {
  ensureTagStyleByName,
  getDefaultTagStyleId,
} from "./tagStylesRepository.js";
import { syncRatingsFromTagsForFiles } from "./systemTagsRepository.js";
import {
  expandTagDraftsWithTranslation,
  normalizeTagDrafts,
} from "./tagTranslation.js";
import { normalizeUrl } from "./urlText.js";
import { listFileUrls } from "./urlsRepository.js";

export function createApiFileIdentifier(): string {
  return randomUUID();
}

export function listApiFileIdentifiers(): string[] {
  const db = getDatabaseConnection();
  const rows = db
    .prepare(
      `SELECT api_identifier AS apiIdentifier
       FROM files
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as Array<{ apiIdentifier: string }>;

  return rows.map((row) => row.apiIdentifier);
}

export function listApiFileIdentifiersBySha256(sha256: string): string[] {
  const db = getDatabaseConnection();
  const normalizedSha256 = sha256.trim().toLowerCase();

  if (!normalizedSha256) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT api_identifier AS apiIdentifier
       FROM files
       WHERE lower(sha256) = ?
       ORDER BY imported_at DESC, id DESC`,
    )
    .all(normalizedSha256) as Array<{ apiIdentifier: string }>;

  return rows.map((row) => row.apiIdentifier);
}

export function getApiFileByIdentifier(
  apiIdentifier: string,
): ApiFileRecord | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare(
      `SELECT
        id AS internalId,
        api_identifier AS apiIdentifier,
        sha256,
        extension,
        size_bytes AS sizeBytes,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt,
        is_favorite AS isFavorite,
        CASE
          WHEN deleted_at IS NOT NULL THEN 'trash'
          ELSE domain
        END AS domain,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
       END AS domainName
       FROM files
       WHERE api_identifier = ?`,
    )
    .get(apiIdentifier) as
    | (Omit<ApiFileRecord, "urls" | "tags" | "ratings"> & {
        internalId: number;
      })
    | undefined;

  if (!row) {
    return null;
  }

  const { internalId, ...file } = row;

  return {
    ...file,
    isFavorite: Boolean(file.isFavorite),
    urls: listFileUrls([internalId]).map((url) => ({
      url: url.url,
      normalizedUrl: url.normalizedUrl,
      source: url.source,
      createdAt: url.createdAt,
      updatedAt: url.updatedAt,
    })),
    tags: listFileTags(internalId).map((tag) => ({
      styleName: tag.styleName,
      namespace: tag.namespace,
      name: tag.name,
      displayName: tag.displayName,
      createdAt: tag.createdAt,
    })),
    ratings: listFileRatingsForExport(db, internalId).map((rating) => ({
      groupName: rating.groupName,
      label: rating.label,
      color: rating.color,
    })),
  };
}

export function getInternalFileIdByApiIdentifier(
  apiIdentifier: string,
): number | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT id FROM files WHERE api_identifier = ?")
    .get(apiIdentifier) as { id: number } | undefined;

  return row?.id ?? null;
}

export function findStoredFileForApiUpload(sha256: string): {
  fileName: string;
  extension: string | null;
  storagePath: string | null;
} | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare(
      `SELECT
        file_name AS fileName,
        extension,
        storage_path AS storagePath
       FROM files
       WHERE sha256 = ?
         AND storage_path IS NOT NULL
       ORDER BY deleted_at IS NULL DESC, imported_at ASC, id ASC
       LIMIT 1`,
    )
    .get(sha256) as
    | {
        fileName: string;
        extension: string | null;
        storagePath: string | null;
      }
    | undefined;

  return row ?? null;
}

export interface ApiFileMetadataUpdateInput {
  tags?: TagDraft[];
  tagStyleName?: string | null;
  urls?: string[];
}

export function updateApiFileMetadata(
  apiIdentifier: string,
  input: ApiFileMetadataUpdateInput,
): ApiFileRecord | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT id FROM files WHERE api_identifier = ?")
    .get(apiIdentifier) as { id: number } | undefined;

  if (!row) {
    return null;
  }

  const shouldUpdateTags = Array.isArray(input.tags);
  const shouldUpdateUrls = Array.isArray(input.urls);

  db.transaction(() => {
    if (shouldUpdateTags) {
      replaceApiFileTags(db, row.id, input.tags ?? [], input.tagStyleName);
    }

    if (shouldUpdateUrls) {
      replaceApiFileUrls(db, row.id, input.urls ?? []);
    }

    if (shouldUpdateTags || shouldUpdateUrls) {
      db.prepare(
        "UPDATE files SET updated_at = datetime('now') WHERE id = ?",
      ).run(row.id);
    }
  })();

  return getApiFileByIdentifier(apiIdentifier);
}

export interface ApiUploadedFileRecordInput {
  sha256: string;
  originalPath: string;
  storagePath: string | null;
  fileName: string;
  extension: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  tags: TagDraft[];
  tagStyleName: string | null;
  urls: string[];
}

export function createApiUploadedFileRecord(
  input: ApiUploadedFileRecordInput,
): ApiFileRecord {
  const db = getDatabaseConnection();
  const apiIdentifier = createApiFileIdentifier();

  db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO files
          (api_identifier, sha256, original_path, storage_path, file_name, extension, mime_type, size_bytes, width, height, domain)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        apiIdentifier,
        input.sha256,
        input.originalPath,
        input.storagePath,
        input.fileName,
        input.extension,
        null,
        input.sizeBytes,
        input.width,
        input.height,
        FILE_DOMAIN_PENDING,
      );
    const fileId = Number(result.lastInsertRowid);

    if (input.tags.length > 0) {
      replaceApiFileTags(db, fileId, input.tags, input.tagStyleName);
    }

    replaceApiFileUrls(db, fileId, input.urls);
  })();

  const file = getApiFileByIdentifier(apiIdentifier);

  if (!file) {
    throw new Error("上传文件入库失败");
  }

  return file;
}

function replaceApiFileTags(
  db: Database.Database,
  fileId: number,
  tags: TagDraft[],
  tagStyleName?: string | null,
): void {
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );
  const styleId = tagStyleName
    ? ensureTagStyleByName(db, tagStyleName, createApiFileIdentifier)
    : getDefaultTagStyleId(db);

  db.prepare("DELETE FROM file_tags WHERE file_id = ?").run(fileId);

  for (const tag of normalizedTags) {
    const tagId = tag.id
      ? readTagId(db, tag.id)
      : ensureTag(
          db,
          styleId,
          ensureTagNamespace(db, styleId, tag.namespace),
          tag,
        );

    db.prepare(
      "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
    ).run(fileId, tagId);
  }

  syncRatingsFromTagsForFiles(db, [fileId]);
}

function replaceApiFileUrls(
  db: Database.Database,
  fileId: number,
  urls: string[],
): void {
  db.prepare("DELETE FROM file_urls WHERE file_id = ?").run(fileId);

  for (const url of urls.map(normalizeUrl).filter(Boolean)) {
    db.prepare(
      `INSERT OR IGNORE INTO file_urls (file_id, url, normalized_url, source)
       VALUES (?, ?, ?, ?)`,
    ).run(fileId, url, url, null);
  }
}
