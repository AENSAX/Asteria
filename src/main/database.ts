import Database from "better-sqlite3";
import { app } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  AiSettings,
  BatchFileTagRecord,
  BrowserFileRecord,
  DatabaseFilePage,
  DatabaseFileRecord,
  DatabaseStatus,
  EHentaiImportOptions,
  ExportFileRecord,
  FileDetailRecord,
  FileDomain,
  FileRatingRecord,
  FileTagRecord,
  FileUrlRecord,
  ApiPermissionRecord,
  ApiFileRecord,
  ApiServiceAvailability,
  ApiServiceDraft,
  ApiServiceRecord,
  DeleteManagedTagsResult,
  DeleteTagStyleResult,
  HydrusImportOptions,
  ManagedTagRecord,
  ManagedTagSortKey,
  NetworkSettings,
  RatingEntryRecord,
  RatingGroupRecord,
  SearchHintRecord,
  SortDirection,
  StorageSettings,
  TagTranslationSettings,
  TagTranslationSummary,
  TagDraft,
  TagRecord,
  TagStyleRecord,
} from "../shared/ipc.js";

const SCHEMA_VERSION = 9;
const FILE_STORAGE_SETTING_KEY = "file_storage_path";
const THUMBNAIL_STORAGE_SETTING_KEY = "thumbnail_storage_path";
const CONVERT_IMPORTED_IMAGES_TO_PNG_SETTING_KEY =
  "convert_imported_images_to_png";
const AI_SETTINGS_KEY = "ai_settings";
const HYDRUS_IMPORT_SETTINGS_KEY = "hydrus_import_settings";
const EHENTAI_IMPORT_SETTINGS_KEY = "ehentai_import_settings";
const NETWORK_SETTINGS_KEY = "network_settings";
const TAG_TRANSLATION_SETTINGS_KEY = "tag_translation_settings";
const defaultAiSettings: AiSettings = {
  modelPath: "",
  modelName: "",
  generalThreshold: 0.35,
  characterThreshold: 0.75,
  autoTagUntaggedImagesOnImport: false,
  enableImageRetagContextMenu: false,
  enableImageAppendTagContextMenu: false,
};
const defaultHydrusImportSettings: HydrusImportOptions = {
  baseUrl: "http://127.0.0.1:45869",
  accessKey: "",
  searchTags: [],
  tagStyleName: "hydrus",
  limit: 0,
  metadataBatchSize: 100,
  forceDuplicate: false,
};
const defaultEHentaiImportSettings: EHentaiImportOptions = {
  galleryUrl: "",
  cookie: "",
  importGalleryTags: true,
  forceDuplicate: false,
  requestDelayMs: 10_000,
  requestTimeoutMs: 45_000,
  startIndex: 1,
  limit: 0,
};
const defaultNetworkSettings: NetworkSettings = {
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: 7890,
};
const defaultTagTranslationSettings: TagTranslationSettings = {
  csvPath: "",
  keepOriginalTags: true,
  enableContextMenuTranslation: false,
  translateOnTagCreate: false,
};
let translationCache: {
  path: string;
  modifiedMs: number;
  map: Map<string, string>;
} | null = null;
const FILE_DOMAIN_PENDING: FileDomain = "pending";
const FILE_DOMAIN_LIBRARY: FileDomain = "library";
const FILE_DOMAIN_TRASH: FileDomain = "trash";
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

let database: Database.Database | undefined;
let databasePath = "";

export function initializeDatabase(): void {
  const configuredDatabasePath = getConfiguredDevelopmentDatabasePath();
  const dataDir = configuredDatabasePath
    ? dirname(configuredDatabasePath)
    : join(app.getPath("userData"), "data");
  mkdirSync(dataDir, { recursive: true });

  databasePath = configuredDatabasePath ?? join(dataDir, "library.sqlite");
  removeStaleSqliteSidecars(databasePath);
  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  runMigrations(database);
  ensureApplicationDataDirectories();
}

export function closeDatabase(): void {
  database?.close();
  database = undefined;
}

export function getDatabaseStatus(): DatabaseStatus {
  const db = getDatabase();

  return {
    path: databasePath,
    schemaVersion: readSchemaVersion(db),
    fileCount: readCount(db, "files"),
    importBatchCount: readCount(db, "import_batches"),
    tagCount: readCount(db, "tags"),
  };
}

export function listDatabaseFiles(
  page: number,
  pageSize = 20,
): DatabaseFilePage {
  const db = getDatabase();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (normalizedPage - 1) * pageSize;
  const total = readFileCount(db, false);
  const rows = db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        domain,
        is_favorite AS isFavorite,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END AS domainName
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

export function listBrowserFiles(): BrowserFileRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        domain,
        is_favorite AS isFavorite,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END AS domainName
       FROM files
       WHERE deleted_at IS NULL
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as DatabaseFileRecord[];

  return attachActiveRatings(db, rows.map(toBrowserFileRecord));
}

export function listFavoriteFiles(): BrowserFileRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        domain,
        is_favorite AS isFavorite,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END AS domainName
       FROM files
       WHERE deleted_at IS NULL
         AND is_favorite = 1
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as DatabaseFileRecord[];

  return attachActiveRatings(db, rows.map(toBrowserFileRecord));
}

type SearchToken =
  | { kind: "tag"; value: string }
  | { kind: "plus" }
  | { kind: "minus" }
  | { kind: "slash" }
  | { kind: "leftParen" }
  | { kind: "rightParen" };

type SearchNode =
  | { kind: "tag"; value: string }
  | { kind: "not"; node: SearchNode }
  | { kind: "and"; left: SearchNode; right: SearchNode }
  | { kind: "or"; left: SearchNode; right: SearchNode };

export function searchBrowserFiles(query: string): BrowserFileRecord[] {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return listBrowserFiles();
  }

  const tokens = tokenizeSearchQuery(normalizedQuery);

  if (tokens.length === 0) {
    return listBrowserFiles();
  }

  const ast = parseSearchExpression(tokens);

  if (!ast) {
    return [];
  }

  const files = listBrowserFiles();
  const universe = new Set(files.map((file) => file.id));
  const tagIndex = readSearchTagIndex();
  const matchedIds = evaluateSearchNode(ast, universe, tagIndex);

  return files.filter((file) => matchedIds.has(file.id));
}

export function searchHints(query: string, limit = 16): SearchHintRecord[] {
  const db = getDatabase();
  const normalizedQuery = normalizeTagSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const hints: SearchHintRecord[] = [];

  const favoriteAliases = ["喜欢", "收藏", "我的收藏", "favorite"];
  if (
    favoriteAliases.some((alias) =>
      normalizeTagSearchQuery(alias).includes(normalizedQuery),
    )
  ) {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS count FROM files WHERE deleted_at IS NULL AND is_favorite = 1",
      )
      .get() as { count: number } | undefined;

    hints.push({
      id: -10,
      kind: "favorite",
      styleName: "favorite",
      namespace: "",
      name: "喜欢",
      displayName: null,
      color: "#ff6fae",
      fileCount: row?.count ?? 0,
    });
  }

  const domainHints = listDomains()
    .filter((domain) =>
      normalizeTagSearchQuery(domain.displayName).includes(normalizedQuery),
    )
    .map((domain) => ({
      id:
        domain.id === FILE_DOMAIN_PENDING
          ? -1
          : domain.id === FILE_DOMAIN_LIBRARY
            ? -2
            : -3,
      kind: "domain" as const,
      styleName: "domain",
      namespace: "",
      name: domain.displayName,
      displayName: null,
      color: null,
      fileCount: domain.fileCount,
    }));

  hints.push(...domainHints);

  const ratingRows = db
    .prepare(
      `SELECT
        rating_entries.id,
        rating_groups.name AS groupName,
        rating_entries.label,
        rating_entries.color,
        COUNT(CASE WHEN files.deleted_at IS NULL THEN file_ratings.file_id END) AS fileCount
       FROM rating_entries
       JOIN rating_groups ON rating_groups.id = rating_entries.group_id
       LEFT JOIN file_ratings ON file_ratings.entry_id = rating_entries.id
       LEFT JOIN files ON files.id = file_ratings.file_id
       WHERE lower(rating_entries.label) LIKE ?
          OR lower(rating_groups.name || ':' || rating_entries.label) LIKE ?
       GROUP BY rating_entries.id
       ORDER BY rating_groups.id ASC, rating_entries.sort_order ASC, rating_entries.id ASC
       LIMIT ?`,
    )
    .all(`%${normalizedQuery}%`, `%${normalizedQuery}%`, limit) as Array<{
    id: number;
    groupName: string;
    label: string;
    color: string;
    fileCount: number;
  }>;

  hints.push(
    ...ratingRows.map((row) => ({
      id: row.id,
      kind: "rating" as const,
      styleName: "rating",
      namespace: row.groupName,
      name: row.label,
      displayName: null,
      color: row.color,
      fileCount: row.fileCount,
    })),
  );

  const tagHints = searchTags(query, limit).map((tag) => ({
    id: tag.id,
    kind: "tag" as const,
    styleName: tag.styleName,
    namespace: tag.namespace,
    name: tag.name,
    displayName: tag.displayName,
    color: null,
    fileCount: 0,
  }));

  hints.push(...tagHints);
  return hints.slice(0, limit);
}

export function getFileDetail(id: number): FileDetailRecord | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        domain,
        is_favorite AS isFavorite,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END AS domainName
       FROM files
       WHERE id = ?`,
    )
    .get(id) as DatabaseFileRecord | undefined;

  if (!row) {
    return null;
  }

  return attachActiveRatings(db, [toBrowserFileRecord(row)])[0] ?? null;
}

export function getFileOriginalPath(id: number): string | null {
  const db = getDatabase();
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
): { sourcePath: string; sha256: string; extension: string | null } | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT
        sha256,
        extension,
        storage_path AS storagePath,
        original_path AS originalPath
       FROM files
       WHERE id = ?`,
    )
    .get(id) as
    | {
        sha256: string;
        extension: string | null;
        storagePath: string | null;
        originalPath: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    sourcePath: row.storagePath ?? row.originalPath,
    sha256: row.sha256,
    extension: row.extension,
  };
}

export function listFilesForExport(fileIds: number[]): ExportFileRecord[] {
  const db = getDatabase();
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
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        domain,
        is_favorite AS isFavorite,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END AS domainName
       FROM files
       WHERE deleted_at IS NULL
         AND id IN (${placeholders})`,
    )
    .all(...normalizedFileIds) as DatabaseFileRecord[];
  const filesById = new Map(rows.map((row) => [row.id, row]));

  return normalizedFileIds
    .map((fileId) => filesById.get(fileId))
    .filter((file): file is DatabaseFileRecord => Boolean(file))
    .map((file) => ({
      ...file,
      sourcePath: file.storagePath ?? file.originalPath,
      tags: listFileTags(file.id),
      ratings: listFileRatingsForExport(db, file.id),
    }));
}

function listFileRatingsForExport(
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

export function hasStoredFileReference(sha256: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare("SELECT id FROM files WHERE sha256 = ? LIMIT 1")
    .get(sha256) as { id: number } | undefined;

  return Boolean(row);
}

export function hasStoredPathReference(storagePath: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare("SELECT id FROM files WHERE storage_path = ? LIMIT 1")
    .get(storagePath) as { id: number } | undefined;

  return Boolean(row);
}

export function getStorageSettings(): StorageSettings {
  return {
    fileStoragePath: getFileStoragePath(),
    thumbnailStoragePath: getThumbnailStoragePath(),
    convertImportedImagesToPng: getConvertImportedImagesToPng(),
  };
}

export function getNetworkSettings(): NetworkSettings {
  const rawSettings = getAppSetting(NETWORK_SETTINGS_KEY);

  if (!rawSettings) {
    setNetworkSettings(defaultNetworkSettings);
    return defaultNetworkSettings;
  }

  try {
    return normalizeNetworkSettings(JSON.parse(rawSettings));
  } catch {
    setNetworkSettings(defaultNetworkSettings);
    return defaultNetworkSettings;
  }
}

export function setNetworkSettings(settings: NetworkSettings): NetworkSettings {
  const normalizedSettings = normalizeNetworkSettings(settings);
  setAppSetting(NETWORK_SETTINGS_KEY, JSON.stringify(normalizedSettings));
  return normalizedSettings;
}

export function getTagTranslationSettings(): TagTranslationSettings {
  const rawSettings = getAppSetting(TAG_TRANSLATION_SETTINGS_KEY);

  if (!rawSettings) {
    setTagTranslationSettings(defaultTagTranslationSettings);
    return defaultTagTranslationSettings;
  }

  try {
    return normalizeTagTranslationSettings(JSON.parse(rawSettings));
  } catch {
    setTagTranslationSettings(defaultTagTranslationSettings);
    return defaultTagTranslationSettings;
  }
}

export function setTagTranslationSettings(
  settings: TagTranslationSettings,
): TagTranslationSettings {
  const normalizedSettings = normalizeTagTranslationSettings(settings);
  setAppSetting(
    TAG_TRANSLATION_SETTINGS_KEY,
    JSON.stringify(normalizedSettings),
  );
  return normalizedSettings;
}

export function getAiSettings(): AiSettings {
  const rawSettings = getAppSetting(AI_SETTINGS_KEY);

  if (!rawSettings) {
    setAiSettings(defaultAiSettings);
    return defaultAiSettings;
  }

  try {
    return normalizeAiSettings(JSON.parse(rawSettings));
  } catch {
    setAiSettings(defaultAiSettings);
    return defaultAiSettings;
  }
}

export function setAiSettings(settings: AiSettings): AiSettings {
  const normalizedSettings = normalizeAiSettings(settings);
  setAppSetting(AI_SETTINGS_KEY, JSON.stringify(normalizedSettings));
  return normalizedSettings;
}

export function getHydrusImportSettings(): HydrusImportOptions {
  const rawSettings = getAppSetting(HYDRUS_IMPORT_SETTINGS_KEY);

  if (!rawSettings) {
    setHydrusImportSettings(defaultHydrusImportSettings);
    return defaultHydrusImportSettings;
  }

  try {
    return normalizeHydrusImportSettings(JSON.parse(rawSettings));
  } catch {
    setHydrusImportSettings(defaultHydrusImportSettings);
    return defaultHydrusImportSettings;
  }
}

export function setHydrusImportSettings(
  settings: HydrusImportOptions,
): HydrusImportOptions {
  const normalizedSettings = normalizeHydrusImportSettings(settings);
  setAppSetting(HYDRUS_IMPORT_SETTINGS_KEY, JSON.stringify(normalizedSettings));
  return normalizedSettings;
}

export function getEHentaiImportSettings(): EHentaiImportOptions {
  const rawSettings = getAppSetting(EHENTAI_IMPORT_SETTINGS_KEY);

  if (!rawSettings) {
    setEHentaiImportSettings(defaultEHentaiImportSettings);
    return defaultEHentaiImportSettings;
  }

  try {
    return normalizeEHentaiImportSettings(JSON.parse(rawSettings));
  } catch {
    setEHentaiImportSettings(defaultEHentaiImportSettings);
    return defaultEHentaiImportSettings;
  }
}

export function setEHentaiImportSettings(
  settings: EHentaiImportOptions,
): EHentaiImportOptions {
  const normalizedSettings = normalizeEHentaiImportSettings(settings);
  setAppSetting(
    EHENTAI_IMPORT_SETTINGS_KEY,
    JSON.stringify(normalizedSettings),
  );
  return normalizedSettings;
}

export function createApiFileIdentifier(): string {
  return randomUUID();
}

export function listApiFileIdentifiers(): string[] {
  const db = getDatabase();
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
  const db = getDatabase();
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
  const db = getDatabase();
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
  const db = getDatabase();
  const row = db
    .prepare("SELECT id FROM files WHERE api_identifier = ?")
    .get(apiIdentifier) as { id: number } | undefined;

  return row?.id ?? null;
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
  const db = getDatabase();
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
      const normalizedTags = expandTagDraftsWithTranslation(
        normalizeTagDrafts(input.tags ?? []),
      );
      const styleId = input.tagStyleName
        ? ensureTagStyleByName(db, input.tagStyleName)
        : getDefaultTagStyleId(db);

      db.prepare("DELETE FROM file_tags WHERE file_id = ?").run(row.id);

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
        ).run(row.id, tagId);
      }
    }

    if (shouldUpdateUrls) {
      db.prepare("DELETE FROM file_urls WHERE file_id = ?").run(row.id);

      for (const url of (input.urls ?? []).map(normalizeUrl).filter(Boolean)) {
        db.prepare(
          `INSERT OR IGNORE INTO file_urls (file_id, url, normalized_url, source)
           VALUES (?, ?, ?, ?)`,
        ).run(row.id, url, url, null);
      }
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
  tags: TagDraft[];
  tagStyleName: string | null;
  urls: string[];
}

export function findStoredFileForApiUpload(sha256: string): {
  fileName: string;
  extension: string | null;
  storagePath: string | null;
} | null {
  const db = getDatabase();
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

export function createApiUploadedFileRecord(
  input: ApiUploadedFileRecordInput,
): ApiFileRecord {
  const db = getDatabase();
  const apiIdentifier = createApiFileIdentifier();

  db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO files
          (api_identifier, sha256, original_path, storage_path, file_name, extension, mime_type, size_bytes, domain)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        FILE_DOMAIN_PENDING,
      );
    const fileId = Number(result.lastInsertRowid);

    if (input.tags.length > 0) {
      const styleId = input.tagStyleName
        ? ensureTagStyleByName(db, input.tagStyleName)
        : getDefaultTagStyleId(db);
      const normalizedTags = expandTagDraftsWithTranslation(
        normalizeTagDrafts(input.tags),
      );

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
    }

    for (const url of input.urls.map(normalizeUrl).filter(Boolean)) {
      db.prepare(
        `INSERT OR IGNORE INTO file_urls (file_id, url, normalized_url, source)
         VALUES (?, ?, ?, ?)`,
      ).run(fileId, url, url, null);
    }
  })();

  const file = getApiFileByIdentifier(apiIdentifier);

  if (!file) {
    throw new Error("上传文件入库失败");
  }

  return file;
}

export function listApiPermissions(): ApiPermissionRecord[] {
  return apiPermissions;
}

export function listApiServices(): ApiServiceRecord[] {
  const db = getDatabase();
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
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    enabled: row.enabled === 1,
    permissions: permissionsByServiceId.get(row.id) ?? [],
  }));
}

export function createApiService(name: string): ApiServiceRecord[] {
  const db = getDatabase();
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
  const db = getDatabase();
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
  const db = getDatabase();
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
  db: Database.Database,
  serviceIds: number[],
): Map<number, string[]> {
  if (serviceIds.length === 0) {
    return new Map();
  }

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

export function getFileStoragePath(): string {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(FILE_STORAGE_SETTING_KEY) as { value: string } | undefined;

  if (row?.value) {
    return row.value;
  }

  const defaultPath = getDefaultFileStoragePath();
  setSettingValue(db, FILE_STORAGE_SETTING_KEY, defaultPath);
  return defaultPath;
}

export function getThumbnailStoragePath(): string {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(THUMBNAIL_STORAGE_SETTING_KEY) as { value: string } | undefined;

  if (row?.value) {
    return row.value;
  }

  const defaultPath = getDefaultThumbnailStoragePath();
  setSettingValue(db, THUMBNAIL_STORAGE_SETTING_KEY, defaultPath);
  return defaultPath;
}

export function getConvertImportedImagesToPng(): boolean {
  return getAppSetting(CONVERT_IMPORTED_IMAGES_TO_PNG_SETTING_KEY) === "true";
}

function normalizeAiSettings(value: unknown): AiSettings {
  const settings = value as Partial<AiSettings> | null;

  return {
    modelPath:
      typeof settings?.modelPath === "string"
        ? settings.modelPath.trim()
        : defaultAiSettings.modelPath,
    modelName:
      typeof settings?.modelName === "string"
        ? settings.modelName.trim()
        : defaultAiSettings.modelName,
    generalThreshold: normalizeAiThreshold(
      settings?.generalThreshold,
      defaultAiSettings.generalThreshold,
    ),
    characterThreshold: normalizeAiThreshold(
      settings?.characterThreshold,
      defaultAiSettings.characterThreshold,
    ),
    autoTagUntaggedImagesOnImport:
      settings?.autoTagUntaggedImagesOnImport === true,
    enableImageRetagContextMenu: settings?.enableImageRetagContextMenu === true,
    enableImageAppendTagContextMenu:
      settings?.enableImageAppendTagContextMenu === true,
  };
}

function normalizeHydrusImportSettings(value: unknown): HydrusImportOptions {
  const settings = value as Partial<HydrusImportOptions> | null;
  const limit = Number(settings?.limit);
  const metadataBatchSize = Number(settings?.metadataBatchSize);

  return {
    baseUrl:
      typeof settings?.baseUrl === "string" && settings.baseUrl.trim()
        ? settings.baseUrl.trim()
        : defaultHydrusImportSettings.baseUrl,
    accessKey:
      typeof settings?.accessKey === "string"
        ? settings.accessKey.trim()
        : defaultHydrusImportSettings.accessKey,
    searchTags: Array.isArray(settings?.searchTags)
      ? settings.searchTags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : defaultHydrusImportSettings.searchTags,
    tagStyleName:
      typeof settings?.tagStyleName === "string" && settings.tagStyleName.trim()
        ? settings.tagStyleName.trim()
        : defaultHydrusImportSettings.tagStyleName,
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : defaultHydrusImportSettings.limit,
    metadataBatchSize:
      Number.isFinite(metadataBatchSize) && metadataBatchSize > 0
        ? Math.floor(metadataBatchSize)
        : defaultHydrusImportSettings.metadataBatchSize,
    forceDuplicate: settings?.forceDuplicate === true,
  };
}

function normalizeEHentaiImportSettings(value: unknown): EHentaiImportOptions {
  const settings = value as Partial<EHentaiImportOptions> | null;
  const requestTimeoutMs = Number(settings?.requestTimeoutMs);
  const startIndex = Number(settings?.startIndex);
  const limit = Number(settings?.limit);

  return {
    galleryUrl:
      typeof settings?.galleryUrl === "string"
        ? settings.galleryUrl.trim()
        : defaultEHentaiImportSettings.galleryUrl,
    cookie:
      typeof settings?.cookie === "string"
        ? settings.cookie.trim()
        : defaultEHentaiImportSettings.cookie,
    importGalleryTags: settings?.importGalleryTags !== false,
    forceDuplicate: settings?.forceDuplicate === true,
    requestDelayMs: defaultEHentaiImportSettings.requestDelayMs,
    requestTimeoutMs:
      Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
        ? Math.floor(requestTimeoutMs)
        : defaultEHentaiImportSettings.requestTimeoutMs,
    startIndex:
      Number.isFinite(startIndex) && startIndex > 0
        ? Math.floor(startIndex)
        : defaultEHentaiImportSettings.startIndex,
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : defaultEHentaiImportSettings.limit,
  };
}

function normalizeNetworkSettings(value: unknown): NetworkSettings {
  const settings = value as Partial<NetworkSettings> | null;
  const port = Number(settings?.proxyPort);

  return {
    proxyEnabled: settings?.proxyEnabled === true,
    proxyHost:
      typeof settings?.proxyHost === "string"
        ? normalizeProxyHost(settings.proxyHost)
        : defaultNetworkSettings.proxyHost,
    proxyPort:
      Number.isInteger(port) && port > 0 && port <= 65535
        ? port
        : defaultNetworkSettings.proxyPort,
  };
}

function normalizeProxyHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

function normalizeTagTranslationSettings(
  value: unknown,
): TagTranslationSettings {
  const settings = value as Partial<TagTranslationSettings> | null;

  return {
    csvPath:
      typeof settings?.csvPath === "string"
        ? settings.csvPath.trim()
        : defaultTagTranslationSettings.csvPath,
    keepOriginalTags: settings?.keepOriginalTags !== false,
    enableContextMenuTranslation:
      settings?.enableContextMenuTranslation === true,
    translateOnTagCreate: settings?.translateOnTagCreate === true,
  };
}

function normalizeAiThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
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

export function listDomains(): Array<{
  id: FileDomain;
  name: string;
  displayName: string;
  fileCount: number;
}> {
  const db = getDatabase();
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
  const db = getDatabase();
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

export function setFileFavorite(fileId: number, favorite: boolean): void {
  const db = getDatabase();

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

export function setFileStoragePath(path: string): StorageSettings {
  const db = getDatabase();
  setSettingValue(db, FILE_STORAGE_SETTING_KEY, path);
  return getStorageSettings();
}

export function setThumbnailStoragePath(path: string): StorageSettings {
  const db = getDatabase();
  setSettingValue(db, THUMBNAIL_STORAGE_SETTING_KEY, path);
  return getStorageSettings();
}

export function setConvertImportedImagesToPng(
  enabled: boolean,
): StorageSettings {
  const db = getDatabase();
  setSettingValue(
    db,
    CONVERT_IMPORTED_IMAGES_TO_PNG_SETTING_KEY,
    enabled ? "true" : "false",
  );
  return getStorageSettings();
}

export function getAppSetting(key: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string): void {
  const db = getDatabase();
  setSettingValue(db, key, value);
}

export function deleteAppSetting(key: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}

export function listFilesForStorageMigration(): DatabaseFileRecord[] {
  const db = getDatabase();

  return db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
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
       ORDER BY id ASC`,
    )
    .all() as DatabaseFileRecord[];
}

export function updateFileStorageRecordPath(
  id: number,
  storagePath: string,
  fileName: string,
): void {
  const db = getDatabase();

  db.prepare(
    `UPDATE files
     SET storage_path = ?,
         file_name = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(storagePath, fileName, id);
}

export function listFileTags(fileId: number): FileTagRecord[] {
  const db = getDatabase();

  return db
    .prepare(
      `SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        file_tags.created_at AS createdAt
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE file_tags.file_id = ?
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(fileId) as FileTagRecord[];
}

export function searchTags(query: string, limit = 12): TagRecord[] {
  const db = getDatabase();
  const normalizedQuery = normalizeTagSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const likeQuery = `%${normalizedQuery}%`;
  const prefixQuery = `${normalizedQuery}%`;

  return db
    .prepare(
      `SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE lower(tags.name) LIKE ?
          OR lower(tags.namespace || ':' || tags.name) LIKE ?
          OR lower(coalesce(tags.display_name, '')) LIKE ?
       ORDER BY
        CASE
          WHEN lower(tags.namespace || ':' || tags.name) LIKE ? THEN 0
          WHEN lower(tags.name) LIKE ? THEN 1
          ELSE 2
        END,
        tag_styles.is_default DESC,
        tags.namespace ASC,
        tags.name ASC
       LIMIT ?`,
    )
    .all(
      likeQuery,
      likeQuery,
      likeQuery,
      prefixQuery,
      prefixQuery,
      limit,
    ) as TagRecord[];
}

export function listTagStyles(): TagStyleRecord[] {
  const db = getDatabase();

  return db
    .prepare(
      `SELECT
        tag_styles.id,
        tag_styles.name,
        tag_styles.display_name AS displayName,
        tag_styles.is_default AS isDefault,
        tag_styles.created_at AS createdAt,
        COUNT(tags.id) AS tagCount
       FROM tag_styles
       LEFT JOIN tags ON tags.style_id = tag_styles.id
       GROUP BY tag_styles.id
       ORDER BY tag_styles.is_default DESC, lower(tag_styles.display_name) ASC`,
    )
    .all() as TagStyleRecord[];
}

export function setActiveTagStyle(styleId: number): TagStyleRecord[] {
  const db = getDatabase();

  if (!Number.isInteger(styleId) || styleId <= 0) {
    throw new Error("标签风格无效");
  }

  const style = db
    .prepare("SELECT id FROM tag_styles WHERE id = ?")
    .get(styleId) as { id: number } | undefined;

  if (!style) {
    throw new Error("标签风格不存在");
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE tag_styles SET is_default = 0, updated_at = datetime('now') WHERE is_default = 1",
    ).run();
    db.prepare(
      "UPDATE tag_styles SET is_default = 1, updated_at = datetime('now') WHERE id = ?",
    ).run(styleId);
  })();

  return listTagStyles();
}

export function createTagStyle(name: string): TagStyleRecord[] {
  const db = getDatabase();
  const displayName = name.trim();
  const normalizedName = normalizeTagPart(name).replace(/\s+/g, "-");

  if (!displayName || !normalizedName) {
    throw new Error("标签风格名称不能为空");
  }

  db.prepare(
    `INSERT INTO tag_styles (name, display_name, description, is_default)
     VALUES (?, ?, ?, 0)`,
  ).run(normalizedName, displayName, null);

  db.prepare(
    `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
     SELECT id, '', ? FROM tag_styles WHERE name = ?`,
  ).run("无命名空间", normalizedName);

  return listTagStyles();
}

export function renameTagStyle(
  styleId: number,
  name: string,
): TagStyleRecord[] {
  const db = getDatabase();
  const displayName = name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeTagPart(displayName).replace(/\s+/g, "-");

  if (
    !Number.isInteger(styleId) ||
    styleId <= 0 ||
    !displayName ||
    !normalizedName
  ) {
    throw new Error("标签风格无效");
  }

  db.prepare(
    `UPDATE tag_styles
     SET name = ?,
         display_name = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(normalizedName, displayName, styleId);

  return listTagStyles();
}

export function deleteTagStyle(styleId: number): DeleteTagStyleResult {
  const db = getDatabase();

  if (!Number.isInteger(styleId) || styleId <= 0) {
    throw new Error("标签风格无效");
  }

  const style = db
    .prepare("SELECT id FROM tag_styles WHERE id = ?")
    .get(styleId) as { id: number } | undefined;

  if (!style) {
    throw new Error("标签风格不存在");
  }

  const tagCount = db
    .prepare("SELECT COUNT(*) AS count FROM tags WHERE style_id = ?")
    .get(styleId) as { count: number } | undefined;
  const fileTagCount = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       WHERE tags.style_id = ?`,
    )
    .get(styleId) as { count: number } | undefined;

  db.transaction(() => {
    db.prepare("DELETE FROM tag_styles WHERE id = ?").run(styleId);

    const defaultStyle = db
      .prepare("SELECT id FROM tag_styles WHERE is_default = 1 LIMIT 1")
      .get() as { id: number } | undefined;

    if (!defaultStyle) {
      const fallback = db
        .prepare("SELECT id FROM tag_styles ORDER BY id ASC LIMIT 1")
        .get() as { id: number } | undefined;

      if (fallback) {
        db.prepare(
          "UPDATE tag_styles SET is_default = 1, updated_at = datetime('now') WHERE id = ?",
        ).run(fallback.id);
      } else {
        getDefaultTagStyleId(db);
      }
    }
  })();

  return {
    styles: listTagStyles(),
    deletedTagCount: tagCount?.count ?? 0,
    deletedFileTagCount: fileTagCount?.count ?? 0,
  };
}

export function listManagedTags(
  styleId: number,
  sortKey: ManagedTagSortKey,
  direction: SortDirection,
): ManagedTagRecord[] {
  const db = getDatabase();
  const orderColumn = resolveManagedTagSortColumn(sortKey);
  const orderDirection = direction === "desc" ? "DESC" : "ASC";

  return db
    .prepare(
      `SELECT
        tags.id,
        tags.style_id AS styleId,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        tags.created_at AS createdAt,
        COUNT(file_tags.file_id) AS fileCount
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       LEFT JOIN file_tags ON file_tags.tag_id = tags.id
       WHERE tags.style_id = ?
       GROUP BY tags.id
       ORDER BY ${orderColumn} ${orderDirection}, lower(tags.namespace) ASC, lower(tags.name) ASC`,
    )
    .all(styleId) as ManagedTagRecord[];
}

export function createManagedTag(
  styleId: number,
  tag: TagDraft,
): ManagedTagRecord {
  const db = getDatabase();
  const normalizedTag = normalizeTagDrafts([tag])[0];

  if (!Number.isInteger(styleId) || styleId <= 0) {
    throw new Error("标签风格无效");
  }

  if (!normalizedTag) {
    throw new Error("标签不能为空");
  }

  const translatedTags = expandTagDraftsWithTranslation([normalizedTag]);
  const primaryTag = translatedTags[0] ?? normalizedTag;
  const existing = db
    .prepare(
      "SELECT id FROM tags WHERE style_id = ? AND namespace = ? AND name = ?",
    )
    .get(styleId, primaryTag.namespace, primaryTag.name) as
    | { id: number }
    | undefined;

  if (existing) {
    throw new Error("同个风格不能包含完全相同的标签");
  }

  let tagId = 0;

  for (const tagDraft of translatedTags) {
    const namespaceId = ensureTagNamespace(db, styleId, tagDraft.namespace);
    const ensuredTagId = ensureTag(db, styleId, namespaceId, tagDraft);

    if (tagDraft === primaryTag) {
      tagId = ensuredTagId;
    }
  }

  if (!tagId) {
    throw new Error("标签创建失败");
  }

  const created = readManagedTag(db, tagId);

  if (!created) {
    throw new Error("标签创建失败");
  }

  return created;
}

export function deleteManagedTag(tagId: number): DeleteManagedTagsResult {
  return deleteManagedTags([tagId]);
}

export function deleteManagedTags(tagIds: number[]): DeleteManagedTagsResult {
  const db = getDatabase();
  const normalizedTagIds = normalizeTagIds(tagIds);

  if (normalizedTagIds.length === 0) {
    throw new Error("标签无效");
  }

  const placeholders = createPlaceholders(normalizedTagIds.length);
  const fileCount = db
    .prepare(
      `SELECT COUNT(DISTINCT file_id) AS count FROM file_tags WHERE tag_id IN (${placeholders})`,
    )
    .get(...normalizedTagIds) as { count: number } | undefined;
  const tagCount = db
    .prepare(`SELECT COUNT(*) AS count FROM tags WHERE id IN (${placeholders})`)
    .get(...normalizedTagIds) as { count: number } | undefined;

  db.transaction(() => {
    db.prepare(`DELETE FROM file_tags WHERE tag_id IN (${placeholders})`).run(
      ...normalizedTagIds,
    );
    db.prepare(`DELETE FROM tags WHERE id IN (${placeholders})`).run(
      ...normalizedTagIds,
    );
  })();

  return {
    deletedTagCount: tagCount?.count ?? 0,
    deletedFileCount: fileCount?.count ?? 0,
  };
}

export function addFileTags(fileId: number, tags: TagDraft[]): FileTagRecord[] {
  const db = getDatabase();
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );

  if (normalizedTags.length === 0) {
    return listFileTags(fileId);
  }

  db.transaction(() => {
    const file = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId) as
      | { id: number }
      | undefined;

    if (!file) {
      throw new Error("文件不存在");
    }

    const styleId = getDefaultTagStyleId(db);

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
  })();

  return listFileTags(fileId);
}

export function replaceFileTags(
  fileId: number,
  tags: TagDraft[],
): FileTagRecord[] {
  const db = getDatabase();
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );

  db.transaction(() => {
    const file = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId) as
      | { id: number }
      | undefined;

    if (!file) {
      throw new Error("文件不存在");
    }

    const styleId = getDefaultTagStyleId(db);
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

    db.prepare(
      "UPDATE files SET updated_at = datetime('now') WHERE id = ?",
    ).run(fileId);
  })();

  return listFileTags(fileId);
}

export function removeFileTags(
  fileId: number,
  tagIds: number[],
): FileTagRecord[] {
  const db = getDatabase();
  const normalizedTagIds = normalizeTagIds(tagIds);

  if (normalizedTagIds.length === 0) {
    return listFileTags(fileId);
  }

  db.transaction(() => {
    for (const tagId of normalizedTagIds) {
      db.prepare("DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?").run(
        fileId,
        tagId,
      );
    }
  })();

  return listFileTags(fileId);
}

export function listTrashedFiles(
  page: number,
  pageSize = 20,
): DatabaseFilePage {
  const db = getDatabase();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (normalizedPage - 1) * pageSize;
  const total = readFileCount(db, true);
  const rows = db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
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

export function trashFiles(fileIds: number[]): void {
  const db = getDatabase();
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
  const db = getDatabase();
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

export function deleteFilesPermanently(
  fileIds: number[],
): DatabaseFileRecord[] {
  const db = getDatabase();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  const files = db
    .prepare(
      `SELECT
        id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
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
       WHERE id IN (${placeholders})`,
    )
    .all(...normalizedFileIds) as DatabaseFileRecord[];

  db.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).run(
    ...normalizedFileIds,
  );

  return files;
}

export function listFileUrls(fileIds: number[]): FileUrlRecord[] {
  const db = getDatabase();
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
  const db = getDatabase();
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
  const db = getDatabase();
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
  const db = getDatabase();
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

export function listRatingGroups(): RatingGroupRecord[] {
  const db = getDatabase();

  return db
    .prepare(
      `SELECT
        rating_groups.id,
        rating_groups.name,
        rating_groups.is_active AS isActive,
        COUNT(rating_entries.id) AS entryCount,
        rating_groups.created_at AS createdAt,
        rating_groups.updated_at AS updatedAt
       FROM rating_groups
       LEFT JOIN rating_entries ON rating_entries.group_id = rating_groups.id
       GROUP BY rating_groups.id
       ORDER BY rating_groups.id ASC`,
    )
    .all() as RatingGroupRecord[];
}

export function createRatingGroup(name: string): RatingGroupRecord[] {
  const db = getDatabase();
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("分级名称不能为空");
  }

  db.prepare("INSERT INTO rating_groups (name) VALUES (?)").run(normalizedName);
  return listRatingGroups();
}

export function renameRatingGroup(
  groupId: number,
  name: string,
): RatingGroupRecord[] {
  const db = getDatabase();
  const normalizedName = name.trim();

  if (!Number.isInteger(groupId) || groupId <= 0 || !normalizedName) {
    throw new Error("分级无效");
  }

  db.prepare(
    `UPDATE rating_groups
     SET name = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(normalizedName, groupId);

  return listRatingGroups();
}

export function setRatingGroupActive(
  groupId: number,
  active: boolean,
): RatingGroupRecord[] {
  const db = getDatabase();

  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error("分级无效");
  }

  db.prepare(
    `UPDATE rating_groups
     SET is_active = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(active ? 1 : 0, groupId);

  return listRatingGroups();
}

export function deleteRatingGroup(groupId: number): RatingGroupRecord[] {
  const db = getDatabase();

  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error("分级无效");
  }

  db.prepare("DELETE FROM rating_groups WHERE id = ?").run(groupId);
  return listRatingGroups();
}

export function listRatingEntries(groupId: number): RatingEntryRecord[] {
  const db = getDatabase();

  if (!Number.isInteger(groupId) || groupId <= 0) {
    return [];
  }

  return db
    .prepare(
      `SELECT
        id,
        group_id AS groupId,
        label,
        color,
        sort_order AS sortOrder,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM rating_entries
       WHERE group_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(groupId) as RatingEntryRecord[];
}

export function createRatingEntry(
  groupId: number,
  label: string,
  color: string,
): RatingEntryRecord[] {
  const db = getDatabase();
  const normalizedLabel = label.trim();
  const normalizedColor = normalizeRatingColor(color);

  if (!Number.isInteger(groupId) || groupId <= 0 || !normalizedLabel) {
    throw new Error("分级条目无效");
  }

  const row = db
    .prepare(
      "SELECT coalesce(MAX(sort_order), 0) + 1 AS sortOrder FROM rating_entries WHERE group_id = ?",
    )
    .get(groupId) as { sortOrder: number } | undefined;

  db.prepare(
    `INSERT INTO rating_entries (group_id, label, color, sort_order)
     VALUES (?, ?, ?, ?)`,
  ).run(groupId, normalizedLabel, normalizedColor, row?.sortOrder ?? 1);

  return listRatingEntries(groupId);
}

export function updateRatingEntry(
  entryId: number,
  label: string,
  color: string,
): RatingEntryRecord[] {
  const db = getDatabase();
  const normalizedLabel = label.trim();
  const normalizedColor = normalizeRatingColor(color);

  if (!Number.isInteger(entryId) || entryId <= 0 || !normalizedLabel) {
    throw new Error("分级条目无效");
  }

  const row = db
    .prepare("SELECT group_id AS groupId FROM rating_entries WHERE id = ?")
    .get(entryId) as { groupId: number } | undefined;

  if (!row) {
    throw new Error("分级条目不存在");
  }

  db.prepare(
    `UPDATE rating_entries
     SET label = ?,
         color = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(normalizedLabel, normalizedColor, entryId);

  return listRatingEntries(row.groupId);
}

export function deleteRatingEntry(entryId: number): RatingEntryRecord[] {
  const db = getDatabase();

  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new Error("分级条目无效");
  }

  const row = db
    .prepare("SELECT group_id AS groupId FROM rating_entries WHERE id = ?")
    .get(entryId) as { groupId: number } | undefined;

  if (!row) {
    return [];
  }

  db.prepare("DELETE FROM rating_entries WHERE id = ?").run(entryId);
  return listRatingEntries(row.groupId);
}

export function reorderRatingEntries(
  groupId: number,
  entryIds: number[],
): RatingEntryRecord[] {
  const db = getDatabase();
  const normalizedEntryIds = normalizePositiveIds(entryIds);

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0 ||
    normalizedEntryIds.length === 0
  ) {
    return listRatingEntries(groupId);
  }

  const placeholders = createPlaceholders(normalizedEntryIds.length);
  const validRows = db
    .prepare(
      `SELECT id FROM rating_entries WHERE group_id = ? AND id IN (${placeholders})`,
    )
    .all(groupId, ...normalizedEntryIds) as Array<{ id: number }>;
  const validIds = new Set(validRows.map((row) => row.id));

  db.transaction(() => {
    let sortOrder = 1;

    for (const entryId of normalizedEntryIds) {
      if (!validIds.has(entryId)) {
        continue;
      }

      db.prepare(
        `UPDATE rating_entries
         SET sort_order = ?,
             updated_at = datetime('now')
         WHERE id = ? AND group_id = ?`,
      ).run(sortOrder, entryId, groupId);
      sortOrder += 1;
    }
  })();

  return listRatingEntries(groupId);
}

export function setFileRatingEntries(
  fileIds: number[],
  groupId: number,
  entryIds: number[],
): void {
  const db = getDatabase();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedEntryIds = normalizePositiveIds(entryIds);

  if (
    normalizedFileIds.length === 0 ||
    !Number.isInteger(groupId) ||
    groupId <= 0
  ) {
    return;
  }

  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const entryPlaceholders =
    normalizedEntryIds.length > 0
      ? createPlaceholders(normalizedEntryIds.length)
      : "";
  const validEntryRows =
    normalizedEntryIds.length > 0
      ? (db
          .prepare(
            `SELECT id FROM rating_entries WHERE group_id = ? AND id IN (${entryPlaceholders})`,
          )
          .all(groupId, ...normalizedEntryIds) as Array<{ id: number }>)
      : [];
  const validEntryIds = validEntryRows.map((row) => row.id);

  db.transaction(() => {
    db.prepare(
      `DELETE FROM file_ratings
       WHERE file_id IN (${filePlaceholders})
         AND entry_id IN (SELECT id FROM rating_entries WHERE group_id = ?)`,
    ).run(...normalizedFileIds, groupId);

    for (const fileId of normalizedFileIds) {
      for (const entryId of validEntryIds) {
        db.prepare(
          "INSERT OR IGNORE INTO file_ratings (file_id, entry_id) VALUES (?, ?)",
        ).run(fileId, entryId);
      }
    }
  })();
}

export function listBatchFileTags(fileIds: number[]): BatchFileTagRecord[] {
  const db = getDatabase();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);

  return db
    .prepare(
      `SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        MIN(file_tags.created_at) AS createdAt,
        COUNT(DISTINCT file_tags.file_id) AS fileCount
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE file_tags.file_id IN (${placeholders})
       GROUP BY tags.id
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(...normalizedFileIds) as BatchFileTagRecord[];
}

export function addTagsToFiles(
  fileIds: number[],
  tags: TagDraft[],
): BatchFileTagRecord[] {
  const db = getDatabase();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );

  if (normalizedFileIds.length === 0 || normalizedTags.length === 0) {
    return listBatchFileTags(normalizedFileIds);
  }

  db.transaction(() => {
    ensureFilesExist(db, normalizedFileIds);
    const styleId = getDefaultTagStyleId(db);

    for (const tag of normalizedTags) {
      const tagId = tag.id
        ? readTagId(db, tag.id)
        : ensureTag(
            db,
            styleId,
            ensureTagNamespace(db, styleId, tag.namespace),
            tag,
          );

      for (const fileId of normalizedFileIds) {
        db.prepare(
          "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
        ).run(fileId, tagId);
      }
    }
  })();

  return listBatchFileTags(normalizedFileIds);
}

export function removeTagsFromFiles(
  fileIds: number[],
  tagIds: number[],
): BatchFileTagRecord[] {
  const db = getDatabase();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedTagIds = normalizeTagIds(tagIds);

  if (normalizedFileIds.length === 0 || normalizedTagIds.length === 0) {
    return listBatchFileTags(normalizedFileIds);
  }

  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const tagPlaceholders = createPlaceholders(normalizedTagIds.length);

  db.prepare(
    `DELETE FROM file_tags
     WHERE file_id IN (${filePlaceholders})
       AND tag_id IN (${tagPlaceholders})`,
  ).run(...normalizedFileIds, ...normalizedTagIds);

  return listBatchFileTags(normalizedFileIds);
}

export function translateFileTags(
  fileIds: number[],
  onProgress?: (completed: number, total: number) => void,
): TagTranslationSummary {
  const db = getDatabase();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const settings = getTagTranslationSettings();
  const translationMap = readTranslationMap(settings);
  const summary: TagTranslationSummary = {
    fileCount: normalizedFileIds.length,
    translatedTagCount: 0,
    removedOriginalTagCount: 0,
    missingTranslationCount: 0,
  };

  if (normalizedFileIds.length === 0 || translationMap.size === 0) {
    return summary;
  }

  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const rows = db
    .prepare(
      `SELECT
        file_tags.file_id AS fileId,
        tags.id AS tagId,
        tags.style_id AS styleId,
        tags.namespace,
        tags.name
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       WHERE file_tags.file_id IN (${filePlaceholders})`,
    )
    .all(...normalizedFileIds) as Array<{
    fileId: number;
    tagId: number;
    styleId: number;
    namespace: string;
    name: string;
  }>;

  const rowsByFileId = new Map<number, typeof rows>();

  for (const row of rows) {
    const fileRows = rowsByFileId.get(row.fileId) ?? [];
    fileRows.push(row);
    rowsByFileId.set(row.fileId, fileRows);
  }

  db.transaction(() => {
    const originalTagIds = new Set<number>();
    let completedFiles = 0;

    for (const fileId of normalizedFileIds) {
      for (const row of rowsByFileId.get(fileId) ?? []) {
        const translatedName = readTranslatedTagName(row.name, translationMap);

        if (!translatedName) {
          summary.missingTranslationCount += 1;
          continue;
        }

        const translatedTag: TagDraft = {
          namespace: row.namespace,
          name: translatedName,
        };
        const translatedTagId = ensureTag(
          db,
          row.styleId,
          ensureTagNamespace(db, row.styleId, translatedTag.namespace),
          translatedTag,
        );
        db.prepare(
          "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
        ).run(row.fileId, translatedTagId);
        summary.translatedTagCount += 1;

        if (translatedTagId !== row.tagId) {
          db.prepare(
            "DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?",
          ).run(row.fileId, row.tagId);
          originalTagIds.add(row.tagId);
          summary.removedOriginalTagCount += 1;
        }
      }

      completedFiles += 1;
      onProgress?.(completedFiles, normalizedFileIds.length);
    }

    if (!settings.keepOriginalTags && originalTagIds.size > 0) {
      const originalTagIdList = [...originalTagIds];
      const originalTagPlaceholders = createPlaceholders(
        originalTagIdList.length,
      );

      db.prepare(
        `DELETE FROM tags
         WHERE id IN (${originalTagPlaceholders})
           AND NOT EXISTS (
             SELECT 1 FROM file_tags WHERE file_tags.tag_id = tags.id
           )`,
      ).run(...originalTagIdList);
    }

    if (summary.translatedTagCount > 0 || summary.removedOriginalTagCount > 0) {
      db.prepare(
        `UPDATE files SET updated_at = datetime('now') WHERE id IN (${filePlaceholders})`,
      ).run(...normalizedFileIds);
    }
  })();

  return summary;
}

export function getDatabaseConnection(): Database.Database {
  return getDatabase();
}

function getDatabase(): Database.Database {
  if (!database) {
    throw new Error("Database has not been initialized.");
  }

  return database;
}

function getDefaultFileStoragePath(): string {
  return join(app.getPath("userData"), "library-files");
}

function getDefaultThumbnailStoragePath(): string {
  return join(app.getPath("userData"), "thumbnail-cache");
}

function ensureApplicationDataDirectories(): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  mkdirSync(getDefaultFileStoragePath(), { recursive: true });
  mkdirSync(getDefaultThumbnailStoragePath(), { recursive: true });
  mkdirSync(join(app.getPath("userData"), "runtime"), { recursive: true });
  mkdirSync(join(app.getPath("userData"), "page-layouts"), { recursive: true });
}

function removeStaleSqliteSidecars(path: string): void {
  if (existsSync(path)) {
    return;
  }

  for (const sidecarPath of [`${path}-wal`, `${path}-shm`]) {
    try {
      rmSync(sidecarPath, { force: true });
    } catch {
      // The database can be freshly recreated without stale WAL/SHM files.
    }
  }
}

function getConfiguredDevelopmentDatabasePath(): string | null {
  if (app.isPackaged) {
    return null;
  }

  const configuredPath = process.env.ASTERIA_DEV_DATABASE_PATH?.trim();

  if (!configuredPath) {
    return null;
  }

  return resolve(configuredPath);
}

function setSettingValue(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = datetime('now')`,
  ).run(key, value);
}

function normalizeTagSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeTagDrafts(tags: TagDraft[]): TagDraft[] {
  const seen = new Set<string>();
  const normalizedTags: TagDraft[] = [];

  for (const tag of tags) {
    const id =
      Number.isInteger(tag.id) && Number(tag.id) > 0
        ? Number(tag.id)
        : undefined;
    const namespace = normalizeTagPart(tag.namespace);
    const name = normalizeTagPart(tag.name);

    if (!name) {
      continue;
    }

    const key = id ? `id:${id}` : `${namespace}:${name}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedTags.push(
      id === undefined ? { namespace, name } : { id, namespace, name },
    );
  }

  return normalizedTags;
}

function expandTagDraftsWithTranslation(tags: TagDraft[]): TagDraft[] {
  const settings = getTagTranslationSettings();

  if (!settings.translateOnTagCreate) {
    return tags;
  }

  const translationMap = readTranslationMap(settings);

  if (translationMap.size === 0) {
    return tags;
  }

  const expandedTags: TagDraft[] = [];

  for (const tag of tags) {
    if (tag.id) {
      expandedTags.push(tag);
      continue;
    }

    const translatedName = readTranslatedTagName(tag.name, translationMap);

    if (!translatedName) {
      expandedTags.push(tag);
      continue;
    }

    expandedTags.push({
      namespace: tag.namespace,
      name: translatedName,
    });
  }

  return normalizeTagDrafts(expandedTags);
}

function readTranslationMap(
  settings: TagTranslationSettings,
): Map<string, string> {
  const csvPath = settings.csvPath.trim();

  if (!csvPath) {
    return new Map();
  }

  try {
    const csvStat = statSync(csvPath);

    if (!csvStat.isFile()) {
      return new Map();
    }

    if (
      translationCache &&
      translationCache.path === csvPath &&
      translationCache.modifiedMs === csvStat.mtimeMs
    ) {
      return translationCache.map;
    }

    const nextMap = parseTranslationCsv(readFileSync(csvPath, "utf8"));
    translationCache = {
      path: csvPath,
      modifiedMs: csvStat.mtimeMs,
      map: nextMap,
    };
    return nextMap;
  } catch {
    return new Map();
  }
}

function parseTranslationCsv(text: string): Map<string, string> {
  const rows = parseCsvRows(text);
  const translationMap = new Map<string, string>();

  for (const row of rows) {
    const source = normalizeTagTranslationKey(row[0] ?? "");
    const translation = (row[2] ?? "").trim();

    if (!source || !translation) {
      continue;
    }

    translationMap.set(source, translation);
  }

  return translationMap;
}

function readTranslatedTagName(
  name: string,
  translationMap: Map<string, string>,
): string | null {
  const normalizedName = normalizeTagTranslationKey(name);
  const translation = translationMap.get(normalizedName);

  if (!translation) {
    return null;
  }

  return normalizeTagPart(`${name} ${translation}`);
}

function normalizeTagTranslationKey(value: string): string {
  return normalizeTagPart(value.replace(/[\s_]+/g, " "));
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cellValue) => cellValue.trim()));
}

function normalizeTagIds(tagIds: number[]): number[] {
  const seen = new Set<number>();
  const normalizedTagIds: number[] = [];

  for (const tagId of tagIds) {
    if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) {
      continue;
    }

    seen.add(tagId);
    normalizedTagIds.push(tagId);
  }

  return normalizedTagIds;
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

function normalizePositiveIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const normalizedIds: number[] = [];

  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalizedIds.push(id);
  }

  return normalizedIds;
}

function normalizeRatingColor(color: string): string {
  const normalizedColor = color.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalizedColor)) {
    return normalizedColor;
  }

  return "#d9dde1";
}

function normalizeUrl(value: string): string {
  return value.trim();
}

function tokenizeSearchQuery(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let buffer = "";
  let quoted = false;
  let escaped = false;

  function flushBuffer(): void {
    const value = buffer.trim();

    if (value) {
      tokens.push({ kind: "tag", value: normalizeTagPart(value) });
    }

    buffer = "";
  }

  for (const character of query) {
    if (quoted) {
      if (escaped) {
        buffer += character;
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        quoted = false;
        flushBuffer();
        continue;
      }

      buffer += character;
      continue;
    }

    if (character === '"') {
      flushBuffer();
      quoted = true;
      continue;
    }

    if (character === "+") {
      flushBuffer();
      tokens.push({ kind: "plus" });
      continue;
    }

    if (character === "-") {
      flushBuffer();
      tokens.push({ kind: "minus" });
      continue;
    }

    if (character === "/") {
      flushBuffer();
      tokens.push({ kind: "slash" });
      continue;
    }

    if (character === "(") {
      flushBuffer();
      tokens.push({ kind: "leftParen" });
      continue;
    }

    if (character === ")") {
      flushBuffer();
      tokens.push({ kind: "rightParen" });
      continue;
    }

    buffer += character;
  }

  if (quoted && escaped) {
    buffer += "\\";
  }

  flushBuffer();

  return tokens;
}

function parseSearchExpression(tokens: SearchToken[]): SearchNode | null {
  let index = 0;

  function peek(): SearchToken | undefined {
    return tokens[index];
  }

  function consume(): SearchToken | undefined {
    const token = tokens[index];
    index += 1;
    return token;
  }

  function parsePrimary(): SearchNode | null {
    const token = peek();

    if (!token) {
      return null;
    }

    if (token.kind === "tag") {
      consume();
      return { kind: "tag", value: token.value };
    }

    if (token.kind === "leftParen") {
      consume();
      const expression = parseOr();

      if (peek()?.kind === "rightParen") {
        consume();
      }

      return expression;
    }

    return null;
  }

  function parseUnary(): SearchNode | null {
    const token = peek();

    if (token?.kind === "minus") {
      consume();
      const node = parseUnary();
      return node ? { kind: "not", node } : null;
    }

    return parsePrimary();
  }

  function startsExpression(token: SearchToken | undefined): boolean {
    return (
      token?.kind === "tag" ||
      token?.kind === "leftParen" ||
      token?.kind === "minus"
    );
  }

  function parseAnd(): SearchNode | null {
    let node = parseUnary();

    if (!node) {
      return null;
    }

    while (true) {
      const token = peek();

      if (token?.kind === "plus") {
        consume();
        const right = parseUnary();

        if (!right) {
          return node;
        }

        node = { kind: "and", left: node, right };
        continue;
      }

      if (startsExpression(token)) {
        const right = parseUnary();

        if (!right) {
          return node;
        }

        node = { kind: "and", left: node, right };
        continue;
      }

      return node;
    }
  }

  function parseOr(): SearchNode | null {
    let node = parseAnd();

    if (!node) {
      return null;
    }

    while (peek()?.kind === "slash") {
      consume();
      const right = parseAnd();

      if (!right) {
        return node;
      }

      node = { kind: "or", left: node, right };
    }

    return node;
  }

  return parseOr();
}

function readSearchTagIndex(): Map<string, Set<number>> {
  const db = getDatabase();
  const tagRows = db
    .prepare(
      `SELECT
        file_tags.file_id AS fileId,
        tags.namespace,
        tags.name
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id`,
    )
    .all() as Array<{ fileId: number; namespace: string; name: string }>;
  const tagIndex = new Map<string, Set<number>>();

  for (const row of tagRows) {
    const keys = [
      row.name,
      row.namespace ? `${row.namespace}:${row.name}` : row.name,
    ];

    for (const key of keys) {
      addSearchIndexEntry(tagIndex, key, row.fileId);
    }
  }

  const favoriteRows = db
    .prepare(
      `SELECT id AS fileId
       FROM files
       WHERE deleted_at IS NULL
         AND is_favorite = 1`,
    )
    .all() as Array<{ fileId: number }>;

  for (const row of favoriteRows) {
    addSearchIndexEntry(tagIndex, "喜欢", row.fileId);
    addSearchIndexEntry(tagIndex, "收藏", row.fileId);
    addSearchIndexEntry(tagIndex, "我的收藏", row.fileId);
    addSearchIndexEntry(tagIndex, "favorite", row.fileId);
  }

  const ratingRows = db
    .prepare(
      `SELECT
        file_ratings.file_id AS fileId,
        rating_entries.id AS entryId,
        rating_groups.name AS groupName,
        rating_entries.label
       FROM file_ratings
       JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
       JOIN rating_groups ON rating_groups.id = rating_entries.group_id
       JOIN files ON files.id = file_ratings.file_id
       WHERE files.deleted_at IS NULL`,
    )
    .all() as Array<{
    fileId: number;
    entryId: number;
    groupName: string;
    label: string;
  }>;

  for (const row of ratingRows) {
    addSearchIndexEntry(tagIndex, `@rating:${row.entryId}`, row.fileId);
    addSearchIndexEntry(tagIndex, row.label, row.fileId);
    addSearchIndexEntry(tagIndex, `${row.groupName}:${row.label}`, row.fileId);
  }

  const domainRows = db
    .prepare(
      `SELECT
        id AS fileId,
        domain,
        deleted_at AS deletedAt
       FROM files`,
    )
    .all() as Array<{
    fileId: number;
    domain: FileDomain;
    deletedAt: string | null;
  }>;

  for (const row of domainRows) {
    const domainName = row.deletedAt
      ? "回收站"
      : row.domain === FILE_DOMAIN_LIBRARY
        ? "已在库中"
        : "待入库";

    addSearchIndexEntry(tagIndex, domainName, row.fileId);
  }

  return tagIndex;
}

function addSearchIndexEntry(
  tagIndex: Map<string, Set<number>>,
  key: string,
  fileId: number,
): void {
  const normalizedKey = normalizeTagPart(key);
  const fileIds = tagIndex.get(normalizedKey) ?? new Set<number>();
  fileIds.add(fileId);
  tagIndex.set(normalizedKey, fileIds);
}

function evaluateSearchNode(
  node: SearchNode,
  universe: Set<number>,
  tagIndex: Map<string, Set<number>>,
): Set<number> {
  if (node.kind === "tag") {
    return new Set(tagIndex.get(node.value) ?? []);
  }

  if (node.kind === "not") {
    return subtractSets(
      universe,
      evaluateSearchNode(node.node, universe, tagIndex),
    );
  }

  if (node.kind === "and") {
    return intersectSets(
      evaluateSearchNode(node.left, universe, tagIndex),
      evaluateSearchNode(node.right, universe, tagIndex),
    );
  }

  return unionSets(
    evaluateSearchNode(node.left, universe, tagIndex),
    evaluateSearchNode(node.right, universe, tagIndex),
  );
}

function intersectSets(left: Set<number>, right: Set<number>): Set<number> {
  const result = new Set<number>();
  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];

  for (const value of smaller) {
    if (larger.has(value)) {
      result.add(value);
    }
  }

  return result;
}

function unionSets(left: Set<number>, right: Set<number>): Set<number> {
  return new Set([...left, ...right]);
}

function subtractSets(left: Set<number>, right: Set<number>): Set<number> {
  const result = new Set<number>();

  for (const value of left) {
    if (!right.has(value)) {
      result.add(value);
    }
  }

  return result;
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
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

function normalizeTagPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getDefaultTagStyleId(db: Database.Database): number {
  const row = db
    .prepare("SELECT id FROM tag_styles WHERE is_default = 1 LIMIT 1")
    .get() as { id: number } | undefined;

  if (row) {
    return row.id;
  }

  const existingDefault = db
    .prepare("SELECT id FROM tag_styles WHERE name = ?")
    .get("default") as { id: number } | undefined;

  if (existingDefault) {
    db.prepare("UPDATE tag_styles SET is_default = 1 WHERE id = ?").run(
      existingDefault.id,
    );
    return existingDefault.id;
  }

  const result = db
    .prepare(
      `INSERT INTO tag_styles (name, display_name, description, is_default)
       VALUES (?, ?, ?, ?)`,
    )
    .run("default", "default tag style", "默认标签风格", 1);

  return Number(result.lastInsertRowid);
}

function ensureTagStyleByName(db: Database.Database, value: string): number {
  const displayName = value.trim().replace(/\s+/g, " ");

  if (!displayName) {
    return getDefaultTagStyleId(db);
  }

  const normalizedName = normalizeTagPart(displayName).replace(/\s+/g, "-");
  const existing = db
    .prepare(
      "SELECT id FROM tag_styles WHERE name = ? OR lower(display_name) = lower(?) LIMIT 1",
    )
    .get(normalizedName, displayName) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO tag_styles (name, display_name, description, is_default)
       VALUES (?, ?, ?, 0)`,
    )
    .run(normalizedName || createApiFileIdentifier(), displayName, null);

  db.prepare(
    `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
     VALUES (?, '', ?)`,
  ).run(result.lastInsertRowid, "无命名空间");

  return Number(result.lastInsertRowid);
}

function ensureTagNamespace(
  db: Database.Database,
  styleId: number,
  namespace: string,
): number {
  const existing = db
    .prepare("SELECT id FROM tag_namespaces WHERE style_id = ? AND name = ?")
    .get(styleId, namespace) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const displayName = namespace || "无命名空间";
  const result = db
    .prepare(
      "INSERT INTO tag_namespaces (style_id, name, display_name) VALUES (?, ?, ?)",
    )
    .run(styleId, namespace, displayName);

  return Number(result.lastInsertRowid);
}

function ensureTag(
  db: Database.Database,
  styleId: number,
  namespaceId: number,
  tag: TagDraft,
): number {
  const existing = db
    .prepare(
      "SELECT id FROM tags WHERE style_id = ? AND namespace = ? AND name = ?",
    )
    .get(styleId, tag.namespace, tag.name) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO tags (style_id, namespace_id, namespace, name, display_name)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(styleId, namespaceId, tag.namespace, tag.name, null);

  return Number(result.lastInsertRowid);
}

function readTagId(db: Database.Database, tagId: number): number {
  const existing = db.prepare("SELECT id FROM tags WHERE id = ?").get(tagId) as
    | { id: number }
    | undefined;

  if (!existing) {
    throw new Error("标签不存在");
  }

  return existing.id;
}

function readManagedTag(
  db: Database.Database,
  tagId: number,
): ManagedTagRecord | null {
  const row = db
    .prepare(
      `SELECT
        tags.id,
        tags.style_id AS styleId,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        tags.created_at AS createdAt,
        COUNT(file_tags.file_id) AS fileCount
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       LEFT JOIN file_tags ON file_tags.tag_id = tags.id
       WHERE tags.id = ?
       GROUP BY tags.id`,
    )
    .get(tagId) as ManagedTagRecord | undefined;

  return row ?? null;
}

function resolveManagedTagSortColumn(sortKey: ManagedTagSortKey): string {
  if (sortKey === "createdAt") {
    return "tags.created_at";
  }

  if (sortKey === "fileCount") {
    return "fileCount";
  }

  return "lower(tags.namespace || char(31) || tags.name)";
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = readSchemaVersion(db);

  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE files (
          id INTEGER PRIMARY KEY,
          sha256 TEXT NOT NULL,
          original_path TEXT NOT NULL,
          storage_path TEXT,
          file_name TEXT NOT NULL,
          extension TEXT,
          mime_type TEXT,
          size_bytes INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          imported_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT
        );

        CREATE TABLE import_batches (
          id INTEGER PRIMARY KEY,
          source_kind TEXT NOT NULL,
          source_path TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          total_items INTEGER NOT NULL DEFAULT 0,
          imported_items INTEGER NOT NULL DEFAULT 0,
          failed_items INTEGER NOT NULL DEFAULT 0,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          finished_at TEXT
        );

        CREATE TABLE import_items (
          id INTEGER PRIMARY KEY,
          batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
          file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
          source_path TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          namespace TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          display_name TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(namespace, name)
        );

        CREATE TABLE file_tags (
          file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (file_id, tag_id)
        );

        CREATE TABLE modules (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE pages (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'workspace',
          layout_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE windows (
          id INTEGER PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          module_id TEXT NOT NULL REFERENCES modules(id),
          title TEXT NOT NULL,
          state_json TEXT NOT NULL DEFAULT '{}',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX idx_files_sha256 ON files(sha256);
        CREATE INDEX idx_files_imported_at ON files(imported_at);
        CREATE INDEX idx_import_items_batch_id ON import_items(batch_id);
        CREATE INDEX idx_import_items_status ON import_items(status);
        CREATE INDEX idx_tags_namespace_name ON tags(namespace, name);
        CREATE INDEX idx_windows_page_id ON windows(page_id);
      `);

      db.prepare(
        "INSERT INTO modules (id, title, kind) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)",
      ).run(
        "file-import",
        "文件导入",
        "import",
        "library-grid",
        "图库视图",
        "browser",
        "file-detail",
        "文件详情",
        "inspector",
      );

      const pageResult = db
        .prepare(
          "INSERT INTO pages (title, kind, layout_json) VALUES (?, ?, ?)",
        )
        .run("默认工作台", "workspace", '{"direction":"horizontal"}');

      db.prepare(
        "INSERT INTO windows (page_id, module_id, title, sort_order) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
      ).run(
        pageResult.lastInsertRowid,
        "file-import",
        "文件导入",
        0,
        pageResult.lastInsertRowid,
        "library-grid",
        "图库视图",
        1,
        pageResult.lastInsertRowid,
        "file-detail",
        "详情",
        2,
      );

      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(1, "initial_schema");
    })();
  }

  if (currentVersion < 2) {
    migrateToTagStyles(db);
  }

  if (currentVersion < 3) {
    migrateToStorageSettings(db);
  }

  if (currentVersion < 4) {
    migrateToFileDomains(db);
  }

  if (currentVersion < 5) {
    migrateToRatings(db);
  }

  if (currentVersion < 6) {
    migrateToFavorites(db);
  }

  if (currentVersion < 7) {
    migrateToDuplicateFileRecords(db);
  }

  if (currentVersion < 8) {
    migrateToApiServices(db);
  }

  if (currentVersion < 9) {
    migrateToApiFileIdentifiers(db);
  }

  ensureApiFileIdentifiersSchema(db);
}

function migrateToApiFileIdentifiers(db: Database.Database): void {
  db.transaction(() => {
    ensureApiFileIdentifiersSchema(db);
    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(9, "api_file_identifiers");
  })();
}

function ensureApiFileIdentifiersSchema(db: Database.Database): void {
  const columns = db.pragma("table_info(files)") as Array<{ name: string }>;
  const hasApiIdentifier = columns.some(
    (column) => column.name === "api_identifier",
  );

  if (!hasApiIdentifier) {
    db.exec("ALTER TABLE files ADD COLUMN api_identifier TEXT");
  }

  const rows = db
    .prepare(
      "SELECT id FROM files WHERE api_identifier IS NULL OR api_identifier = ?",
    )
    .all("") as Array<{ id: number }>;

  for (const row of rows) {
    db.prepare("UPDATE files SET api_identifier = ? WHERE id = ?").run(
      createApiFileIdentifier(),
      row.id,
    );
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_api_identifier
      ON files(api_identifier);
  `);
}

function migrateToApiServices(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_services (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '127.0.0.1',
        port INTEGER NOT NULL DEFAULT 17321,
        token TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS api_service_permissions (
        service_id INTEGER NOT NULL REFERENCES api_services(id) ON DELETE CASCADE,
        permission_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (service_id, permission_id)
      );

      CREATE INDEX IF NOT EXISTS idx_api_service_permissions_service_id
        ON api_service_permissions(service_id);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(8, "api_services");
  })();
}

function migrateToTagStyles(db: Database.Database): void {
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");

  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tag_styles (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          description TEXT,
          is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_styles_default
          ON tag_styles(is_default)
          WHERE is_default = 1;

        CREATE TABLE IF NOT EXISTS tag_namespaces (
          id INTEGER PRIMARY KEY,
          style_id INTEGER NOT NULL REFERENCES tag_styles(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT '',
          display_name TEXT,
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(style_id, name)
        );

        CREATE TABLE IF NOT EXISTS file_urls (
          id INTEGER PRIMARY KEY,
          file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          normalized_url TEXT,
          source TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(file_id, url)
        );
      `);

      db.prepare(
        `INSERT OR IGNORE INTO tag_styles (name, display_name, description, is_default)
         VALUES (?, ?, ?, ?)`,
      ).run("default", "default tag style", "默认标签风格", 1);

      const defaultStyle = db
        .prepare("SELECT id FROM tag_styles WHERE name = ?")
        .get("default") as { id: number } | undefined;

      if (!defaultStyle) {
        throw new Error("Default tag style was not created.");
      }

      db.prepare(
        `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
         VALUES (?, ?, ?)`,
      ).run(defaultStyle.id, "", "无命名空间");

      db.prepare(
        `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
         SELECT DISTINCT ?, namespace, CASE WHEN namespace = '' THEN ? ELSE namespace END
         FROM tags`,
      ).run(defaultStyle.id, "无命名空间");

      db.exec(`
        DROP INDEX IF EXISTS idx_tags_namespace_name;

        CREATE TABLE tags_next (
          id INTEGER PRIMARY KEY,
          style_id INTEGER NOT NULL REFERENCES tag_styles(id) ON DELETE CASCADE,
          namespace_id INTEGER REFERENCES tag_namespaces(id) ON DELETE SET NULL,
          namespace TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          display_name TEXT,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(style_id, namespace, name)
        );
      `);

      db.prepare(
        `INSERT INTO tags_next (
          id,
          style_id,
          namespace_id,
          namespace,
          name,
          display_name,
          created_at,
          updated_at
        )
        SELECT
          tags.id,
          ?,
          tag_namespaces.id,
          tags.namespace,
          tags.name,
          tags.display_name,
          tags.created_at,
          tags.created_at
        FROM tags
        LEFT JOIN tag_namespaces
          ON tag_namespaces.style_id = ?
         AND tag_namespaces.name = tags.namespace`,
      ).run(defaultStyle.id, defaultStyle.id);

      db.exec(`
        DROP TABLE tags;
        ALTER TABLE tags_next RENAME TO tags;

        CREATE INDEX IF NOT EXISTS idx_tags_style_namespace_name ON tags(style_id, namespace, name);
        CREATE INDEX IF NOT EXISTS idx_tags_namespace_id ON tags(namespace_id);
        CREATE INDEX IF NOT EXISTS idx_file_tags_tag_id ON file_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tag_namespaces_style_name ON tag_namespaces(style_id, name);
        CREATE INDEX IF NOT EXISTS idx_file_urls_file_id ON file_urls(file_id);
        CREATE INDEX IF NOT EXISTS idx_file_urls_url ON file_urls(url);
      `);

      db.prepare(
        "INSERT OR IGNORE INTO modules (id, title, kind) VALUES (?, ?, ?)",
      ).run("tag-manager", "标签管理", "tag");

      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(2, "tag_styles_and_file_urls");
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateToStorageSettings(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    setSettingValue(db, FILE_STORAGE_SETTING_KEY, getDefaultFileStoragePath());
    setSettingValue(
      db,
      THUMBNAIL_STORAGE_SETTING_KEY,
      getDefaultThumbnailStoragePath(),
    );

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(3, "file_storage_settings");
  })();
}

function migrateToFileDomains(db: Database.Database): void {
  db.transaction(() => {
    const columns = db.pragma("table_info(files)") as Array<{ name: string }>;
    const hasDomain = columns.some((column) => column.name === "domain");

    if (!hasDomain) {
      db.exec(`
        ALTER TABLE files
        ADD COLUMN domain TEXT NOT NULL DEFAULT 'pending';
      `);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_domain ON files(domain);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(4, "file_domains");
  })();
}

function migrateToRatings(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rating_groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS rating_entries (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES rating_groups(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#d9dde1',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS file_ratings (
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        entry_id INTEGER NOT NULL REFERENCES rating_entries(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (file_id, entry_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rating_entries_group_id ON rating_entries(group_id);
      CREATE INDEX IF NOT EXISTS idx_file_ratings_file_id ON file_ratings(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_ratings_entry_id ON file_ratings(entry_id);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(5, "ratings");
  })();
}

function migrateToFavorites(db: Database.Database): void {
  db.transaction(() => {
    const columns = db.pragma("table_info(files)") as Array<{ name: string }>;
    const hasFavorite = columns.some((column) => column.name === "is_favorite");

    if (!hasFavorite) {
      db.exec(`
        ALTER TABLE files
        ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1));
      `);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(is_favorite);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(SCHEMA_VERSION, "favorites");
  })();
}

function migrateToDuplicateFileRecords(db: Database.Database): void {
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");

  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE files_next (
          id INTEGER PRIMARY KEY,
          sha256 TEXT NOT NULL,
          original_path TEXT NOT NULL,
          storage_path TEXT,
          file_name TEXT NOT NULL,
          extension TEXT,
          mime_type TEXT,
          size_bytes INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          imported_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT,
          domain TEXT NOT NULL DEFAULT 'pending',
          is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1))
        );

        INSERT INTO files_next (
          id,
          sha256,
          original_path,
          storage_path,
          file_name,
          extension,
          mime_type,
          size_bytes,
          width,
          height,
          duration_ms,
          imported_at,
          updated_at,
          deleted_at,
          domain,
          is_favorite
        )
        SELECT
          id,
          sha256,
          original_path,
          storage_path,
          file_name,
          extension,
          mime_type,
          size_bytes,
          width,
          height,
          duration_ms,
          imported_at,
          updated_at,
          deleted_at,
          domain,
          is_favorite
        FROM files;

        DROP TABLE files;
        ALTER TABLE files_next RENAME TO files;

        CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
        CREATE INDEX IF NOT EXISTS idx_files_imported_at ON files(imported_at);
        CREATE INDEX IF NOT EXISTS idx_files_domain ON files(domain);
        CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(is_favorite);
      `);

      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(7, "duplicate_file_records");
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function readSchemaVersion(db: Database.Database): number {
  const row = db
    .prepare(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    )
    .get() as { version: number } | undefined;

  return row?.version ?? 0;
}

function readCount(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as
    | { count: number }
    | undefined;

  return row?.count ?? 0;
}

function readFileCount(db: Database.Database, trashed: boolean): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM files WHERE deleted_at IS ${trashed ? "NOT " : ""}NULL`,
    )
    .get() as { count: number } | undefined;

  return row?.count ?? 0;
}
