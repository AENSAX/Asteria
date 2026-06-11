import type {
  AiSettings,
  HydrusImportOptions,
  NetworkSettings,
  TagTranslationSettings,
} from "../../shared/ipc.js";

export const defaultAiSettings: AiSettings = {
  modelPath: "",
  modelName: "",
  generalThreshold: 0.35,
  characterThreshold: 0.75,
  autoTagUntaggedImagesOnImport: false,
  enableImageRetagContextMenu: false,
  enableImageAppendTagContextMenu: false,
};

export const defaultHydrusImportSettings: HydrusImportOptions = {
  baseUrl: "http://127.0.0.1:45869",
  accessKey: "",
  searchTags: [],
  tagStyleName: "hydrus",
  limit: 0,
  metadataBatchSize: 100,
  forceDuplicate: false,
};

export const defaultNetworkSettings: NetworkSettings = {
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: 7890,
};

export const defaultTagTranslationSettings: TagTranslationSettings = {
  csvPath: "",
  keepOriginalTags: true,
  enableContextMenuTranslation: false,
  translateOnTagCreate: false,
};

export function normalizeAiSettings(value: unknown): AiSettings {
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

export function normalizeHydrusImportSettings(
  value: unknown,
): HydrusImportOptions {
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

export function normalizeNetworkSettings(value: unknown): NetworkSettings {
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

export function normalizeProxyHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

export function normalizeTagTranslationSettings(
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

export function normalizeAiThreshold(
  value: unknown,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}
