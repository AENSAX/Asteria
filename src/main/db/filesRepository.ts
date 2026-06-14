import type Database from "better-sqlite3";
import type { DatabaseFilePage, DatabaseFileRecord } from "../../shared/ipc.js";
import type {
  BrowserFilePage,
  BrowserFilePageRequest,
  BrowserFileRecord,
  ExportFileRecord,
  FileDetailRecord,
  FileRatingRecord,
} from "../../shared/ipc.js";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../../shared/media.js";
import { getDatabaseConnection } from "./connection.js";
import { createPlaceholders, normalizeFileIds } from "./queryUtils.js";
import {
  DATABASE_FILE_SELECT_COLUMNS,
  DATABASE_FILE_SELECT_COLUMNS_WITH_DELETED_DOMAIN,
} from "./sqlFragments.js";
import { listFileTagsByFileIds } from "./fileTagsRepository.js";

export interface ThumbnailSourceRecord {
  fileId: number;
  sourcePath: string;
  sha256: string;
  extension: string | null;
  width: number | null;
  height: number | null;
}

export function listDatabaseFiles(
  page: number,
  pageSize = 20,
): DatabaseFilePage {
  const db = getDatabaseConnection();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (normalizedPage - 1) * pageSize;
  const total = readFileCount(false);
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE deleted_at IS NULL
       ORDER BY imported_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(pageSize, offset) as DatabaseFileRecord[];

  return {
    page: normalizedPage,
    pageSize,
    total,
    files: rows,
  };
}

export function listTrashedFiles(
  page: number,
  pageSize = 20,
): DatabaseFilePage {
  const db = getDatabaseConnection();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (normalizedPage - 1) * pageSize;
  const total = readFileCount(true);
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS_WITH_DELETED_DOMAIN}
       FROM files
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(pageSize, offset) as DatabaseFileRecord[];

  return {
    page: normalizedPage,
    pageSize,
    total,
    files: rows,
  };
}

export function listBrowserFiles(): BrowserFileRecord[] {
  const db = getDatabaseConnection();
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE deleted_at IS NULL
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as DatabaseFileRecord[];

  return attachActiveRatings(db, rows.map(toBrowserFileRecord));
}

export function listBrowserFileIds(): number[] {
  const db = getDatabaseConnection();
  const rows = db
    .prepare(
      `SELECT id
       FROM files
       WHERE deleted_at IS NULL
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as Array<{ id: number }>;

  return rows.map((row) => row.id);
}

export function listBrowserFilesByIds(fileIds: number[]): BrowserFileRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE deleted_at IS NULL
         AND id IN (${placeholders})`,
    )
    .all(...normalizedFileIds) as DatabaseFileRecord[];
  const filesById = new Map(
    attachActiveRatings(db, rows.map(toBrowserFileRecord)).map((file) => [
      file.id,
      file,
    ]),
  );

  return normalizedFileIds
    .map((fileId) => filesById.get(fileId))
    .filter((file): file is BrowserFileRecord => Boolean(file));
}

export function listBrowserFilePage(
  request: BrowserFilePageRequest,
): BrowserFilePage {
  return listBrowserFilePageWhere("", [], request);
}

export function listFavoriteFiles(): BrowserFileRecord[] {
  const db = getDatabaseConnection();
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE deleted_at IS NULL
         AND is_favorite = 1
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as DatabaseFileRecord[];

  return attachActiveRatings(db, rows.map(toBrowserFileRecord));
}

export function listFavoriteFilePage(
  request: BrowserFilePageRequest,
): BrowserFilePage {
  return listBrowserFilePageWhere("AND is_favorite = 1", [], request);
}

export function listBrowserFilePageByIds(
  fileIds: number[],
  request: BrowserFilePageRequest,
): BrowserFilePage {
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return createEmptyBrowserFilePage(request);
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  return listBrowserFilePageWhere(
    `AND id IN (${placeholders})`,
    normalizedFileIds,
    request,
  );
}

export function hydrateBrowserFileRecords(
  db: Database.Database,
  rows: DatabaseFileRecord[],
): BrowserFileRecord[] {
  return attachActiveRatings(db, rows.map(toBrowserFileRecord));
}

export function getFileDetail(id: number): FileDetailRecord | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE id = ?`,
    )
    .get(id) as DatabaseFileRecord | undefined;

  if (!row) {
    return null;
  }

  return attachActiveRatings(db, [toBrowserFileRecord(row)])[0] ?? null;
}

export function listFilesForExport(fileIds: number[]): ExportFileRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = [
    ...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE deleted_at IS NULL
         AND id IN (${placeholders})`,
    )
    .all(...normalizedFileIds) as DatabaseFileRecord[];
  const filesById = new Map(rows.map((row) => [row.id, row]));
  const tagsByFileId = listFileTagsByFileIds(normalizedFileIds);
  const ratingsByFileId = listFileRatingsByFileIds(db, normalizedFileIds);

  return normalizedFileIds
    .map((fileId) => filesById.get(fileId))
    .filter((file): file is DatabaseFileRecord => Boolean(file))
    .map((file) => ({
      ...file,
      sourcePath: file.storagePath ?? file.originalPath,
      tags: tagsByFileId.get(file.id) ?? [],
      ratings: ratingsByFileId.get(file.id) ?? [],
    }));
}

export function getFileOriginalPath(id: number): string | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare(
      "SELECT storage_path AS storagePath, original_path AS originalPath FROM files WHERE id = ?",
    )
    .get(id) as
    | { storagePath: string | null; originalPath: string }
    | undefined;

  return row?.storagePath ?? row?.originalPath ?? null;
}

export function getFileThumbnailSource(
  id: number,
): ThumbnailSourceRecord | null {
  return listThumbnailSources([id])[0] ?? null;
}

export function listThumbnailSources(fileIds: number[]): ThumbnailSourceRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  const rows = db
    .prepare(
      `SELECT
        id AS fileId,
        sha256,
        extension,
        width,
        height,
        storage_path AS storagePath,
        original_path AS originalPath
       FROM files
       WHERE id IN (${placeholders})`,
    )
    .all(...normalizedFileIds) as Array<{
    fileId: number;
    sha256: string;
    extension: string | null;
    width: number | null;
    height: number | null;
    storagePath: string | null;
    originalPath: string;
  }>;
  const rowsById = new Map(rows.map((row) => [row.fileId, row]));

  return normalizedFileIds
    .map((fileId) => rowsById.get(fileId))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map(toThumbnailSourceRecord);
}

export function listThumbnailCandidates(): ThumbnailSourceRecord[] {
  const db = getDatabaseConnection();
  const extensions = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];
  const placeholders = createPlaceholders(extensions.length);
  const originalPathExtensionFilters = extensions
    .map(() => "lower(original_path) LIKE ?")
    .join(" OR ");
  const rows = db
    .prepare(
      `SELECT
        id AS fileId,
        sha256,
        extension,
        width,
        height,
        storage_path AS storagePath,
        original_path AS originalPath
       FROM files
       WHERE deleted_at IS NULL
         AND (
           lower(replace(coalesce(extension, ''), '.', '')) IN (${placeholders})
           OR (
             extension IS NULL
             AND (${originalPathExtensionFilters})
           )
         )
       ORDER BY imported_at DESC, id DESC`,
    )
    .all(
      ...extensions,
      ...extensions.map((extension) => `%.${extension}`),
    ) as Array<{
    fileId: number;
    sha256: string;
    extension: string | null;
    width: number | null;
    height: number | null;
    storagePath: string | null;
    originalPath: string;
  }>;

  return rows.map(toThumbnailSourceRecord);
}

export function updateFileDimensions(
  id: number,
  width: number,
  height: number,
): void {
  if (!Number.isInteger(id) || id <= 0 || width <= 0 || height <= 0) {
    return;
  }

  const db = getDatabaseConnection();
  db.prepare(
    `UPDATE files
     SET width = ?, height = ?
     WHERE id = ?
       AND (width IS NULL OR height IS NULL OR width <= 0 OR height <= 0)`,
  ).run(Math.round(width), Math.round(height), id);
}

export function hasStoredFileReference(sha256: string): boolean {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT id FROM files WHERE sha256 = ? LIMIT 1")
    .get(sha256) as { id: number } | undefined;

  return Boolean(row);
}

export function hasStoredPathReference(storagePath: string): boolean {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT id FROM files WHERE storage_path = ? LIMIT 1")
    .get(storagePath) as { id: number } | undefined;

  return Boolean(row);
}

export function listFilesForStorageMigration(): DatabaseFileRecord[] {
  const db = getDatabaseConnection();

  return db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS_WITH_DELETED_DOMAIN}
       FROM files
       ORDER BY id ASC`,
    )
    .all() as DatabaseFileRecord[];
}

export function updateFileStorageRecordPath(
  id: number,
  storagePath: string,
  fileName: string,
): void {
  const db = getDatabaseConnection();

  db.prepare(
    `UPDATE files
     SET storage_path = ?,
         file_name = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(storagePath, fileName, id);
}

export function setFileFavorite(fileId: number, favorite: boolean): void {
  const db = getDatabaseConnection();

  if (!Number.isInteger(fileId) || fileId <= 0) {
    return;
  }

  db.prepare(
    `UPDATE files
     SET is_favorite = ?,
         updated_at = datetime('now')
     WHERE id = ?
       AND deleted_at IS NULL`,
  ).run(favorite ? 1 : 0, fileId);
}

export function trashFiles(fileIds: number[]): void {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  db.prepare(
    `UPDATE files
     SET deleted_at = coalesce(deleted_at, datetime('now')),
         is_favorite = 0,
         updated_at = datetime('now')
     WHERE id IN (${placeholders})`,
  ).run(...normalizedFileIds);
}

export function restoreFiles(fileIds: number[]): void {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  db.prepare(
    `UPDATE files
     SET deleted_at = NULL,
         updated_at = datetime('now')
     WHERE id IN (${placeholders})`,
  ).run(...normalizedFileIds);
}

export function restoreAllTrashedFiles(): number {
  const db = getDatabaseConnection();
  const result = db
    .prepare(
      `UPDATE files
       SET deleted_at = NULL,
           updated_at = datetime('now')
       WHERE deleted_at IS NOT NULL`,
    )
    .run();

  return result.changes;
}

export function deleteFilesPermanently(
  fileIds: number[],
): DatabaseFileRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  const files = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS_WITH_DELETED_DOMAIN}
       FROM files
       WHERE id IN (${placeholders})`,
    )
    .all(...normalizedFileIds) as DatabaseFileRecord[];

  db.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).run(
    ...normalizedFileIds,
  );

  return files;
}

export function deleteAllTrashedFilesPermanently(): DatabaseFileRecord[] {
  const db = getDatabaseConnection();
  const files = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS_WITH_DELETED_DOMAIN}
       FROM files
       WHERE deleted_at IS NOT NULL`,
    )
    .all() as DatabaseFileRecord[];

  if (files.length === 0) {
    return [];
  }

  db.prepare("DELETE FROM files WHERE deleted_at IS NOT NULL").run();

  return files;
}

function readFileCount(trashed: boolean): number {
  const db = getDatabaseConnection();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM files WHERE deleted_at IS ${trashed ? "NOT " : ""}NULL`,
    )
    .get() as { count: number } | undefined;

  return row?.count ?? 0;
}

function listBrowserFilePageWhere(
  extraPredicate: string,
  params: Array<string | number>,
  request: BrowserFilePageRequest,
): BrowserFilePage {
  const db = getDatabaseConnection();
  const normalizedPage = normalizeBrowserPage(request.page);
  const pageSize = normalizeBrowserPageSize(request.pageSize);
  const offset = (normalizedPage - 1) * pageSize;
  const sort = createBrowserFileSortSql(request);
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM files
       WHERE deleted_at IS NULL
       ${extraPredicate}`,
    )
    .get(...params) as { count: number } | undefined;
  const rows = db
    .prepare(
      `SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       WHERE deleted_at IS NULL
       ${extraPredicate}
       ORDER BY ${sort}, id ${request.sortDirection === "asc" ? "ASC" : "DESC"}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as DatabaseFileRecord[];

  return {
    page: normalizedPage,
    pageSize,
    total: totalRow?.count ?? 0,
    files: hydrateBrowserFileRecords(db, rows),
  };
}

function createEmptyBrowserFilePage(
  request: BrowserFilePageRequest,
): BrowserFilePage {
  return {
    page: normalizeBrowserPage(request.page),
    pageSize: normalizeBrowserPageSize(request.pageSize),
    total: 0,
    files: [],
  };
}

function normalizeBrowserPage(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeBrowserPageSize(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 100;
}

function createBrowserFileSortSql(request: BrowserFilePageRequest): string {
  const column =
    request.sortKey === "updatedAt" ? "updated_at" : "imported_at";
  const direction = request.sortDirection === "asc" ? "ASC" : "DESC";

  return `${column} ${direction}`;
}

function toBrowserFileRecord<T extends DatabaseFileRecord>(
  row: T,
): T & { mediaUrl: string; thumbnailUrl: string } {
  const cacheVersion = encodeURIComponent(row.sha256);

  return {
    ...row,
    mediaUrl: `asteria-media://file/${row.id}?v=${cacheVersion}`,
    thumbnailUrl: `asteria-media://thumbnail/${row.id}?v=${cacheVersion}`,
  };
}

function attachActiveRatings<T extends DatabaseFileRecord>(
  db: Database.Database,
  files: Array<T & { mediaUrl: string; thumbnailUrl: string }>,
): Array<
  T & { mediaUrl: string; thumbnailUrl: string; ratings: FileRatingRecord[] }
> {
  if (files.length === 0) {
    return [];
  }

  const fileIds = files.map((file) => file.id);
  const placeholders = createPlaceholders(fileIds.length);
  const ratingRows = db
    .prepare(
      `SELECT
        file_ratings.file_id AS fileId,
        rating_groups.id AS groupId,
        rating_groups.name AS groupName,
        rating_entries.id AS entryId,
        rating_entries.label,
        rating_entries.color
       FROM file_ratings
       JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
       JOIN rating_groups ON rating_groups.id = rating_entries.group_id
       WHERE rating_groups.is_active = 1
         AND file_ratings.file_id IN (${placeholders})
       ORDER BY rating_groups.id ASC, rating_entries.sort_order ASC, rating_entries.id ASC`,
    )
    .all(...fileIds) as Array<FileRatingRecord & { fileId: number }>;
  const ratingsByFileId = new Map<number, FileRatingRecord[]>();

  for (const row of ratingRows) {
    const ratings = ratingsByFileId.get(row.fileId) ?? [];
    ratings.push({
      groupId: row.groupId,
      groupName: row.groupName,
      entryId: row.entryId,
      label: row.label,
      color: row.color,
    });
    ratingsByFileId.set(row.fileId, ratings);
  }

  return files.map((file) => ({
    ...file,
    ratings: ratingsByFileId.get(file.id) ?? [],
  }));
}

export function listFileRatingsForExport(
  db: Database.Database,
  fileId: number,
): FileRatingRecord[] {
  return db
    .prepare(
      `SELECT
        rating_groups.id AS groupId,
        rating_groups.name AS groupName,
        rating_entries.id AS entryId,
        rating_entries.label,
        rating_entries.color
       FROM file_ratings
       JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
       JOIN rating_groups ON rating_groups.id = rating_entries.group_id
       WHERE file_ratings.file_id = ?
       ORDER BY rating_groups.id ASC, rating_entries.sort_order ASC, rating_entries.id ASC`,
    )
    .all(fileId) as FileRatingRecord[];
}

function listFileRatingsByFileIds(
  db: Database.Database,
  fileIds: number[],
): Map<number, FileRatingRecord[]> {
  const ratingsByFileId = new Map<number, FileRatingRecord[]>();

  if (fileIds.length === 0) {
    return ratingsByFileId;
  }

  const placeholders = createPlaceholders(fileIds.length);
  const rows = db
    .prepare(
      `SELECT
        file_ratings.file_id AS fileId,
        rating_groups.id AS groupId,
        rating_groups.name AS groupName,
        rating_entries.id AS entryId,
        rating_entries.label,
        rating_entries.color
       FROM file_ratings
       JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
       JOIN rating_groups ON rating_groups.id = rating_entries.group_id
       WHERE file_ratings.file_id IN (${placeholders})
       ORDER BY file_ratings.file_id ASC, rating_groups.id ASC, rating_entries.sort_order ASC, rating_entries.id ASC`,
    )
    .all(...fileIds) as Array<FileRatingRecord & { fileId: number }>;

  for (const row of rows) {
    const ratings = ratingsByFileId.get(row.fileId) ?? [];
    ratings.push({
      groupId: row.groupId,
      groupName: row.groupName,
      entryId: row.entryId,
      label: row.label,
      color: row.color,
    });
    ratingsByFileId.set(row.fileId, ratings);
  }

  return ratingsByFileId;
}

function toThumbnailSourceRecord(row: {
  fileId: number;
  sha256: string;
  extension: string | null;
  width: number | null;
  height: number | null;
  storagePath: string | null;
  originalPath: string;
}): ThumbnailSourceRecord {
  return {
    fileId: row.fileId,
    sourcePath: row.storagePath ?? row.originalPath,
    sha256: row.sha256,
    extension: row.extension,
    width: row.width,
    height: row.height,
  };
}
