import type { IpcMain } from "electron";
import type { WorkStatus } from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { registerAiHandlers, type AiHandlersContext } from "./aiHandlers.js";
import { registerApiHandlers, type ApiHandlersContext } from "./apiHandlers.js";
import {
  registerDialogHandlers,
  type DialogHandlersContext,
} from "./dialogHandlers.js";
import {
  registerExportHandlers,
  type ExportHandlersContext,
} from "./exportHandlers.js";
import {
  registerFileHandlers,
  type FileHandlersContext,
} from "./fileHandlers.js";
import {
  registerImportHandlers,
  type ImportHandlersContext,
} from "./importHandlers.js";
import {
  registerRatingHandlers,
  type RatingHandlersContext,
} from "./ratingHandlers.js";
import {
  registerSettingsHandlers,
  type SettingsHandlersContext,
} from "./settingsHandlers.js";
import { registerTagHandlers, type TagHandlersContext } from "./tagHandlers.js";
import {
  registerTagTranslationHandlers,
  type TagTranslationHandlersContext,
} from "./tagTranslationHandlers.js";
import { registerUrlHandlers, type UrlHandlersContext } from "./urlHandlers.js";
import {
  registerWindowHandlers,
  type WindowHandlersContext,
} from "./windowHandlers.js";

export interface RegisterIpcHandlersContext
  extends
    AiHandlersContext,
    ApiHandlersContext,
    DialogHandlersContext,
    ExportHandlersContext,
    FileHandlersContext,
    ImportHandlersContext,
    RatingHandlersContext,
    SettingsHandlersContext,
    TagHandlersContext,
    TagTranslationHandlersContext,
    UrlHandlersContext,
    WindowHandlersContext {
  getAppVersion: () => string;
  getCombinedWorkStatus: () => WorkStatus;
  queueThumbnailPreload: (
    fileIds: number[],
    priority: "normal" | "high",
  ) => void;
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number");
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  context: RegisterIpcHandlersContext,
): void {
  ipcMain.handle(IpcChannel.APP_GET_VERSION, () => context.getAppVersion());
  registerDialogHandlers(ipcMain, context);
  registerSettingsHandlers(ipcMain, context);
  registerFileHandlers(ipcMain, context);
  registerWindowHandlers(ipcMain, context);
  registerUrlHandlers(ipcMain, context);
  registerRatingHandlers(ipcMain, context);
  registerExportHandlers(ipcMain, context);
  registerApiHandlers(ipcMain, context);
  ipcMain.handle(IpcChannel.THUMBNAIL_PRELOAD, (_event, fileIds: unknown) => {
    context.queueThumbnailPreload(normalizeNumberArray(fileIds), "high");
  });
  ipcMain.handle(IpcChannel.WORK_STATUS_GET, () =>
    context.getCombinedWorkStatus(),
  );
  registerTagHandlers(ipcMain, context);
  registerImportHandlers(ipcMain, context);
  registerTagTranslationHandlers(ipcMain, context);
  registerAiHandlers(ipcMain, context);
}
