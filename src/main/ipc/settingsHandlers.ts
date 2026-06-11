import {
  BrowserWindow,
  nativeTheme,
  type IpcMain,
  type WebContents,
} from "electron";
import type {
  NetworkSettings,
  PageLayoutConfigRecord,
  PageLayoutSettings,
  StorageSettings,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import {
  mainT,
  readWindowLanguageId,
  type MainTranslationKey,
} from "../i18n.js";
import { normalizeNetworkSettings } from "../settings/normalizers.js";

export interface SettingsHandlersContext {
  getStorageSettings: () => StorageSettings;
  getNetworkSettings: () => NetworkSettings;
  setNetworkSettings: (settings: NetworkSettings) => NetworkSettings;
  applyNetworkSettings: (settings: NetworkSettings) => Promise<void>;
  chooseStorageDirectory: (sender: WebContents) => Promise<string | null>;
  updateStoragePathWithMigration: (
    sender: WebContents,
    path: string,
  ) => Promise<StorageSettings>;
  updateThumbnailStoragePathWithMigration: (
    sender: WebContents,
    path: string,
  ) => Promise<StorageSettings>;
  setConvertImportedImagesToPng: (enabled: boolean) => StorageSettings;
  listPageLayoutConfigs: () => Promise<PageLayoutConfigRecord[]>;
  getPageLayoutSettings: () => PageLayoutSettings;
  getPageLayoutTemplate: (kind: "default" | "newPage") => Promise<string>;
  savePageLayoutConfig: (
    name: string,
    layoutJson: string,
  ) => Promise<PageLayoutConfigRecord[]>;
  createPageLayoutConfig: () => Promise<PageLayoutConfigRecord[]>;
  renamePageLayoutConfig: (
    id: string,
    name: string,
  ) => Promise<PageLayoutConfigRecord[]>;
  deletePageLayoutConfig: (id: string) => Promise<PageLayoutConfigRecord[]>;
  openPageLayoutConfig: (id: string) => Promise<void>;
  setDefaultPageLayoutConfig: (
    id: string | null,
  ) => Promise<PageLayoutSettings>;
  setNewPageLayoutConfig: (id: string | null) => Promise<PageLayoutSettings>;
}

function assertString(
  value: unknown,
  message: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(message);
  }
}

async function assertStoragePathValue(
  sender: WebContents,
  value: unknown,
): Promise<string> {
  if (typeof value === "string") {
    return value;
  }

  throw await createSettingsError(sender, "settings.file.invalidPath");
}

async function assertPageLayoutIdValue(
  sender: WebContents,
  value: unknown,
): Promise<string> {
  if (typeof value === "string") {
    return value;
  }

  throw await createSettingsError(sender, "settings.pageLayout.invalidConfig");
}

async function assertOptionalPageLayoutIdValue(
  sender: WebContents,
  value: unknown,
): Promise<string | null> {
  if (value === null || typeof value === "string") {
    return value;
  }

  throw await createSettingsError(sender, "settings.pageLayout.invalidConfig");
}

async function createSettingsError(
  sender: WebContents,
  key: MainTranslationKey,
): Promise<Error> {
  const languageId = await readWindowLanguageId(
    BrowserWindow.fromWebContents(sender),
  );
  return new Error(mainT(languageId, key));
}

async function runPageLayoutAction<T>(
  sender: WebContents,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && error.message === "页面配置不存在") {
      throw await createSettingsError(
        sender,
        "settings.pageLayout.missingConfig",
      );
    }

    throw error;
  }
}

export function registerSettingsHandlers(
  ipcMain: IpcMain,
  context: SettingsHandlersContext,
): void {
  ipcMain.handle(IpcChannel.THEME_SET_NATIVE, (_event, theme: unknown) => {
    nativeTheme.themeSource = theme === "light" ? "light" : "dark";
  });
  ipcMain.handle(IpcChannel.SETTINGS_GET_STORAGE, () =>
    context.getStorageSettings(),
  );
  ipcMain.handle(IpcChannel.SETTINGS_GET_NETWORK, () =>
    context.getNetworkSettings(),
  );
  ipcMain.handle(
    IpcChannel.SETTINGS_UPDATE_NETWORK,
    async (_event, settings: unknown) => {
      const nextSettings = context.setNetworkSettings(
        normalizeNetworkSettings(settings),
      );
      await context.applyNetworkSettings(nextSettings);
      return nextSettings;
    },
  );
  ipcMain.handle(IpcChannel.SETTINGS_SELECT_STORAGE_DIRECTORY, (event) =>
    context.chooseStorageDirectory(event.sender),
  );
  ipcMain.handle(
    IpcChannel.SETTINGS_UPDATE_FILE_STORAGE_PATH,
    async (event, path: unknown) => {
      const normalizedPath = await assertStoragePathValue(event.sender, path);
      return context.updateStoragePathWithMigration(
        event.sender,
        normalizedPath,
      );
    },
  );
  ipcMain.handle(
    IpcChannel.SETTINGS_UPDATE_THUMBNAIL_STORAGE_PATH,
    async (event, path: unknown) => {
      const normalizedPath = await assertStoragePathValue(event.sender, path);
      return context.updateThumbnailStoragePathWithMigration(
        event.sender,
        normalizedPath,
      );
    },
  );
  ipcMain.handle(
    IpcChannel.SETTINGS_UPDATE_CONVERT_IMPORTED_IMAGES_TO_PNG,
    (_event, enabled: unknown) =>
      context.setConvertImportedImagesToPng(enabled === true),
  );
  ipcMain.handle(IpcChannel.PAGE_LAYOUT_LIST_CONFIGS, () =>
    context.listPageLayoutConfigs(),
  );
  ipcMain.handle(IpcChannel.PAGE_LAYOUT_GET_SETTINGS, () =>
    context.getPageLayoutSettings(),
  );
  ipcMain.handle(IpcChannel.PAGE_LAYOUT_GET_TEMPLATE, (_event, kind: unknown) =>
    context.getPageLayoutTemplate(kind === "newPage" ? "newPage" : "default"),
  );
  ipcMain.handle(
    IpcChannel.PAGE_LAYOUT_SAVE_CONFIG,
    async (event, name: unknown, layoutJson: unknown) => {
      if (typeof name !== "string" || typeof layoutJson !== "string") {
        throw await createSettingsError(
          event.sender,
          "settings.pageLayout.invalidConfig",
        );
      }

      return runPageLayoutAction(event.sender, () =>
        context.savePageLayoutConfig(name, layoutJson),
      );
    },
  );
  ipcMain.handle(IpcChannel.PAGE_LAYOUT_CREATE_CONFIG, () =>
    context.createPageLayoutConfig(),
  );
  ipcMain.handle(
    IpcChannel.PAGE_LAYOUT_RENAME_CONFIG,
    async (event, id: unknown, name: unknown) => {
      if (typeof id !== "string" || typeof name !== "string") {
        throw await createSettingsError(
          event.sender,
          "settings.pageLayout.invalidConfig",
        );
      }

      return runPageLayoutAction(event.sender, () =>
        context.renamePageLayoutConfig(id, name),
      );
    },
  );
  ipcMain.handle(
    IpcChannel.PAGE_LAYOUT_DELETE_CONFIG,
    async (event, id: unknown) => {
      const configId = await assertPageLayoutIdValue(event.sender, id);
      return runPageLayoutAction(event.sender, () =>
        context.deletePageLayoutConfig(configId),
      );
    },
  );
  ipcMain.handle(
    IpcChannel.PAGE_LAYOUT_OPEN_CONFIG,
    async (event, id: unknown) => {
      const configId = await assertPageLayoutIdValue(event.sender, id);
      return runPageLayoutAction(event.sender, () =>
        context.openPageLayoutConfig(configId),
      );
    },
  );
  ipcMain.handle(
    IpcChannel.PAGE_LAYOUT_SET_DEFAULT_CONFIG,
    async (event, id: unknown) => {
      const configId = await assertOptionalPageLayoutIdValue(event.sender, id);
      return runPageLayoutAction(event.sender, () =>
        context.setDefaultPageLayoutConfig(configId),
      );
    },
  );
  ipcMain.handle(
    IpcChannel.PAGE_LAYOUT_SET_NEW_PAGE_CONFIG,
    async (event, id: unknown) => {
      const configId = await assertOptionalPageLayoutIdValue(event.sender, id);
      return runPageLayoutAction(event.sender, () =>
        context.setNewPageLayoutConfig(configId),
      );
    },
  );
}
