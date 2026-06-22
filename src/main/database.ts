import Database from "better-sqlite3";
import { app } from "electron";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DatabaseFileRecord, DatabaseStatus } from "../shared/ipc.js";
import {
  closeDatabaseConnection,
  getDatabaseConnection as readDatabaseConnection,
  getDatabasePath,
  setDatabaseConnection,
} from "./db/connection.js";
import {
  readSchemaVersion,
  readTableCount,
  runMigrations,
} from "./db/schema.js";
export {
  createApiService,
  deleteApiService,
  getApiServiceAvailability,
  listApiPermissions,
  listApiServices,
  updateApiService,
} from "./db/apiRepository.js";
export {
  createApiFileIdentifier,
  createApiUploadedFileRecord,
  findStoredFileForApiUpload,
  getApiFileByIdentifier,
  getInternalFileIdByApiIdentifier,
  listApiFileIdentifiers,
  listApiFileIdentifiersBySha256,
  updateApiFileMetadata,
} from "./db/apiFilesRepository.js";
export type {
  ApiFileMetadataUpdateInput,
  ApiUploadedFileRecordInput,
} from "./db/apiFilesRepository.js";
export {
  addFileUrl,
  listFileUrls,
  removeFileUrl,
  updateFileUrl,
} from "./db/urlsRepository.js";
export {
  createTagStyle,
  deleteTagStyle,
  listTagStyles,
  renameTagStyle,
  setActiveTagStyle,
} from "./db/tagStylesRepository.js";
export {
  addTagParent,
  addTagParents,
  addTagSibling,
  addTagSiblings,
  getDirectParentTagIds,
  getTagRelationTree,
  listTagParents,
  listTagSiblings,
  removeTagParent,
  removeTagParents,
  removeTagSibling,
  removeTagSiblings,
  resolveEffectiveTagIds,
  resolveParentTagIds,
} from "./db/tagRelationsRepository.js";
export {
  addFileTags,
  addTagsToFiles,
  listBatchEffectiveFileTags,
  listBatchFileTags,
  listFileParentTags,
  listFileTags,
  removeFileTags,
  removeTagsFromFiles,
  replaceFileTags,
  translateFileTags,
} from "./db/fileTagsRepository.js";
export {
  createManagedTag,
  createManagedTags,
  deleteManagedTag,
  deleteManagedTags,
  listManagedTags,
  previewManagedTagRename,
  renameManagedTag,
} from "./db/tagsRepository.js";
export {
  createRatingEntry,
  createRatingGroup,
  deleteRatingEntry,
  deleteRatingGroup,
  listRatingEntries,
  listRatingGroups,
  renameRatingGroup,
  reorderRatingEntries,
  setFileRatingEntries,
  setRatingGroupActive,
  updateRatingEntry,
} from "./db/ratingsRepository.js";
export {
  deleteAppSetting,
  getAiSettings,
  getAppSetting,
  getConvertImportedImagesToPng,
  getFileStoragePath,
  getHydrusImportSettings,
  getNetworkSettings,
  getStorageSettings,
  getTagTranslationSettings,
  getThumbnailStoragePath,
  setAiSettings,
  setAppSetting,
  setConvertImportedImagesToPng,
  setFileStoragePath,
  setHydrusImportSettings,
  setNetworkSettings,
  setTagTranslationSettings,
  setThumbnailStoragePath,
} from "./db/settingsRepository.js";
export { listDomains, setFilesDomain } from "./db/domainsRepository.js";
export {
  listBrowserNamespaceGroupPage,
  searchBrowserFilePage,
  searchHints,
  searchTags,
} from "./db/searchRepository.js";
export {
  deleteAllTrashedFilesPermanently,
  deleteFilesPermanently,
  getFileDetail,
  getFileOriginalPath,
  getFileThumbnailSource,
  hasStoredFileReference,
  hasStoredPathReference,
  listDatabaseFiles,
  listBrowserFileIds,
  listBrowserFilePage,
  listBrowserFilePageByNamespaceGroup,
  listBrowserFiles,
  listBrowserFilesByIds,
  listFavoriteFilePage,
  listFavoriteFiles,
  listFilesForExport,
  listFilesForStorageMigration,
  listThumbnailCandidates,
  listThumbnailSources,
  listTrashedFiles,
  restoreAllTrashedFiles,
  restoreFiles,
  setFileFavorite,
  trashFiles,
  updateFileDimensions,
  updateFileStorageRecordPath,
} from "./db/filesRepository.js";

export function initializeDatabase(): void {
  const configuredDatabasePath = getConfiguredDevelopmentDatabasePath();
  const dataDir = configuredDatabasePath
    ? dirname(configuredDatabasePath)
    : join(app.getPath("userData"), "data");
  mkdirSync(dataDir, { recursive: true });

  const databasePath =
    configuredDatabasePath ?? join(dataDir, "library.sqlite");
  removeStaleSqliteSidecars(databasePath);
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  setDatabaseConnection(database, databasePath);

  runMigrations(database, {
    defaultFileStoragePath: getDefaultFileStoragePath(),
    defaultThumbnailStoragePath: getDefaultThumbnailStoragePath(),
  });
  ensureApplicationDataDirectories();
}

export function closeDatabase(): void {
  closeDatabaseConnection();
}

export function getDatabaseStatus(): DatabaseStatus {
  const db = getDatabase();

  return {
    path: getDatabasePath(),
    schemaVersion: readSchemaVersion(db),
    fileCount: readTableCount(db, "files"),
    importBatchCount: readTableCount(db, "import_batches"),
    tagCount: readTableCount(db, "tags"),
  };
}

export function getDatabaseConnection(): Database.Database {
  return readDatabaseConnection();
}

function getDatabase(): Database.Database {
  return readDatabaseConnection();
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
