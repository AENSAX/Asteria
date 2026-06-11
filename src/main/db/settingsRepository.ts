import { app } from "electron";
import { join } from "node:path";
import type {
  AiSettings,
  HydrusImportOptions,
  NetworkSettings,
  StorageSettings,
  TagTranslationSettings,
} from "../../shared/ipc.js";
import {
  defaultAiSettings,
  defaultHydrusImportSettings,
  defaultNetworkSettings,
  defaultTagTranslationSettings,
  normalizeAiSettings,
  normalizeHydrusImportSettings,
  normalizeNetworkSettings,
  normalizeTagTranslationSettings,
} from "../settings/normalizers.js";
import { getDatabaseConnection } from "./connection.js";

const FILE_STORAGE_SETTING_KEY = "file_storage_path";
const THUMBNAIL_STORAGE_SETTING_KEY = "thumbnail_storage_path";
const CONVERT_IMPORTED_IMAGES_TO_PNG_SETTING_KEY =
  "convert_imported_images_to_png";
const AI_SETTINGS_KEY = "ai_settings";
const HYDRUS_IMPORT_SETTINGS_KEY = "hydrus_import_settings";
const NETWORK_SETTINGS_KEY = "network_settings";
const TAG_TRANSLATION_SETTINGS_KEY = "tag_translation_settings";

export function getStorageSettings(): StorageSettings {
  return {
    fileStoragePath: getFileStoragePath(),
    thumbnailStoragePath: getThumbnailStoragePath(),
    convertImportedImagesToPng: getConvertImportedImagesToPng(),
  };
}

export function getFileStoragePath(): string {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(FILE_STORAGE_SETTING_KEY) as { value: string } | undefined;

  if (row?.value) {
    return row.value;
  }

  const defaultPath = getDefaultFileStoragePath();
  setSettingValue(FILE_STORAGE_SETTING_KEY, defaultPath);
  return defaultPath;
}

export function getThumbnailStoragePath(): string {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(THUMBNAIL_STORAGE_SETTING_KEY) as { value: string } | undefined;

  if (row?.value) {
    return row.value;
  }

  const defaultPath = getDefaultThumbnailStoragePath();
  setSettingValue(THUMBNAIL_STORAGE_SETTING_KEY, defaultPath);
  return defaultPath;
}

export function getConvertImportedImagesToPng(): boolean {
  return getAppSetting(CONVERT_IMPORTED_IMAGES_TO_PNG_SETTING_KEY) === "true";
}

export function setFileStoragePath(path: string): StorageSettings {
  setSettingValue(FILE_STORAGE_SETTING_KEY, path);
  return getStorageSettings();
}

export function setThumbnailStoragePath(path: string): StorageSettings {
  setSettingValue(THUMBNAIL_STORAGE_SETTING_KEY, path);
  return getStorageSettings();
}

export function setConvertImportedImagesToPng(
  enabled: boolean,
): StorageSettings {
  setSettingValue(
    CONVERT_IMPORTED_IMAGES_TO_PNG_SETTING_KEY,
    enabled ? "true" : "false",
  );
  return getStorageSettings();
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

export function getAppSetting(key: string): string | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string): void {
  setSettingValue(key, value);
}

export function deleteAppSetting(key: string): void {
  const db = getDatabaseConnection();
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}

function setSettingValue(key: string, value: string): void {
  const db = getDatabaseConnection();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = datetime('now')`,
  ).run(key, value);
}

function getDefaultFileStoragePath(): string {
  return join(app.getPath("userData"), "library-files");
}

function getDefaultThumbnailStoragePath(): string {
  return join(app.getPath("userData"), "thumbnail-cache");
}
