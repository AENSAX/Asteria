import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import { IpcChannel } from "../../shared/ipcChannels.js";
import type { MainLanguageId } from "../i18n.js";

type TagRelationTreeKind = "parent" | "sibling";
type NormalizeIpcFileIds = (value: unknown) => number[];

export interface WindowHandlersContext {
  createAiManagerWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createApiManagerWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createBatchOperationWindow: (
    fileIds: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createBatchTagManagerWindow: (
    fileIds: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createDatabaseManagerWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createExportWindow: (
    fileIds: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createFavoritesWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createFileDetailWindow: (
    id: number,
    sequenceIds?: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createFileRatingEditorWindow: (
    fileIds: number[],
    groupId: number,
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createHydrusImportWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createRatingManagerWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createRecycleBinWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createScreeningWindow: (
    fileIds: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createSettingsWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createTagManagerWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createTagRelationTreeWindow: (
    tagIds: number[],
    kind?: TagRelationTreeKind,
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  createTagTranslationWindow: (languageId?: MainLanguageId) => BrowserWindow;
  createUrlManagerWindow: (
    fileIds: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  normalizeIpcFileIds: NormalizeIpcFileIds;
  readWindowLanguageId: (
    window?: BrowserWindow | null,
  ) => Promise<MainLanguageId>;
}

export function registerWindowHandlers(
  ipcMain: IpcMain,
  context: WindowHandlersContext,
): void {
  function readSenderLanguageId(event: IpcMainInvokeEvent) {
    return context.readWindowLanguageId(
      BrowserWindow.fromWebContents(event.sender),
    );
  }

  ipcMain.handle(IpcChannel.WINDOW_OPEN_DATABASE_MANAGER, async (event) => {
    context.createDatabaseManagerWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_TAG_MANAGER, async (event) => {
    context.createTagManagerWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_TAG_RELATION_TREE,
    async (event, tagIds: unknown, kind: unknown) => {
      context.createTagRelationTreeWindow(
        context.normalizeIpcFileIds(tagIds),
        kind === "sibling" ? "sibling" : "parent",
        await readSenderLanguageId(event),
      );
    },
  );
  ipcMain.handle(IpcChannel.WINDOW_OPEN_RECYCLE_BIN, async (event) => {
    context.createRecycleBinWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_RATING_MANAGER, async (event) => {
    context.createRatingManagerWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_API_MANAGER, async (event) => {
    context.createApiManagerWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_HYDRUS_IMPORT, async (event) => {
    context.createHydrusImportWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_AI_MANAGER, async (event) => {
    context.createAiManagerWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_TAG_TRANSLATION, async (event) => {
    context.createTagTranslationWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_OPEN_FAVORITES, async (event) => {
    context.createFavoritesWindow(await readSenderLanguageId(event));
  });
  ipcMain.handle(IpcChannel.WINDOW_SET_TITLE, (event, title: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window || typeof title !== "string") {
      return;
    }

    const nextTitle = title.trim();

    if (nextTitle) {
      window.setTitle(nextTitle);
    }
  });
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_URL_MANAGER,
    async (event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length > 0) {
        context.createUrlManagerWindow(
          normalizedFileIds,
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_BATCH_TAG_MANAGER,
    async (event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length > 0) {
        context.createBatchTagManagerWindow(
          normalizedFileIds,
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_BATCH_OPERATION,
    async (event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length > 0) {
        context.createBatchOperationWindow(
          normalizedFileIds,
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_EXPORT,
    async (event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length > 0) {
        context.createExportWindow(
          normalizedFileIds,
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_FILE_RATING_EDITOR,
    async (event, fileIds: unknown, groupId: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);

      if (
        normalizedFileIds.length > 0 &&
        typeof groupId === "number" &&
        Number.isInteger(groupId) &&
        groupId > 0
      ) {
        context.createFileRatingEditorWindow(
          normalizedFileIds,
          groupId,
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_SCREENING,
    async (event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length > 0) {
        context.createScreeningWindow(
          normalizedFileIds,
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(
    IpcChannel.WINDOW_OPEN_FILE_DETAIL,
    async (event, id: unknown, sequenceIds: unknown) => {
      if (typeof id === "number" && Number.isInteger(id) && id > 0) {
        context.createFileDetailWindow(
          id,
          context.normalizeIpcFileIds(sequenceIds),
          await readSenderLanguageId(event),
        );
      }
    },
  );
  ipcMain.handle(IpcChannel.WINDOW_OPEN_SETTINGS, async (event) => {
    context.createSettingsWindow(await readSenderLanguageId(event));
  });
}
