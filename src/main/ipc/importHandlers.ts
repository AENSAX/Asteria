import type { IpcMain, WebContents } from "electron";
import type {
  HydrusConnectionStatus,
  HydrusImportOptions,
  HydrusImportProgress,
  ImportCommitResult,
  ImportProgress,
  ImportQueueFileRecord,
  FilesChangedPayload,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { normalizeHydrusImportSettings } from "../settings/normalizers.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface ImportHandlersContext {
  importFiles: (sender: WebContents) => Promise<ImportProgress>;
  importFolder: (sender: WebContents) => Promise<ImportProgress>;
  importPaths: (sender: WebContents, paths: unknown) => Promise<ImportProgress>;
  importUrls: (sender: WebContents, urls: unknown) => Promise<ImportProgress>;
  listImportQueueFiles: () => ImportQueueFileRecord[];
  commitImportQueue: (
    sender: WebContents,
    queueIds: number[],
    confirmedDuplicateQueueIds: number[],
  ) => Promise<ImportCommitResult>;
  removeImportQueueFiles: (queueIds: number[]) => ImportProgress;
  clearImportQueue: () => ImportProgress;
  testHydrusConnection: (
    options: HydrusImportOptions,
  ) => Promise<HydrusConnectionStatus>;
  importFromHydrus: (
    sender: WebContents,
    options: HydrusImportOptions,
  ) => Promise<HydrusImportProgress>;
  cancelHydrusImport: () => void;
  getHydrusImportSettings: () => HydrusImportOptions;
  setHydrusImportSettings: (
    settings: HydrusImportOptions,
  ) => HydrusImportOptions;
  tagUntaggedImagesWithAi: (fileIds: number[]) => Promise<unknown>;
  queueAllMissingThumbnails: (priority: "normal" | "high") => void;
  broadcastImportQueueChanged: () => void;
  broadcastFilesChanged: (payload?: Partial<FilesChangedPayload>) => void;
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

export function registerImportHandlers(
  ipcMain: IpcMain,
  context: ImportHandlersContext,
): void {
  ipcMain.handle(IpcChannel.IMPORT_FILES, async (event) => {
    const result = await context.importFiles(event.sender);
    context.broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle(IpcChannel.IMPORT_FOLDER, async (event) => {
    const result = await context.importFolder(event.sender);
    context.broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle(IpcChannel.IMPORT_PATHS, async (event, paths: unknown) => {
    const result = await context.importPaths(event.sender, paths);
    context.broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle(IpcChannel.IMPORT_URLS, async (event, urls: unknown) => {
    const result = await context.importUrls(event.sender, urls);
    context.broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle(IpcChannel.IMPORT_LIST_QUEUE_FILES, () =>
    context.listImportQueueFiles(),
  );
  ipcMain.handle(
    IpcChannel.IMPORT_COMMIT_QUEUE,
    async (event, queueIds: unknown, confirmedDuplicateQueueIds: unknown) => {
      const result = await context.commitImportQueue(
        event.sender,
        context.normalizeIpcFileIds(queueIds),
        context.normalizeIpcFileIds(confirmedDuplicateQueueIds),
      );

      if (result.phase !== "canceled") {
        await context.tagUntaggedImagesWithAi(result.committedFileIds);
      }

      context.broadcastImportQueueChanged();
      context.broadcastFilesChanged({
        kind: "imported",
        fileIds: result.committedFileIds,
      });

      if (result.phase !== "canceled") {
        context.queueAllMissingThumbnails("normal");
      }

      return result;
    },
  );
  ipcMain.handle(
    IpcChannel.IMPORT_REMOVE_QUEUE_FILES,
    (_event, queueIds: unknown) => {
      const result = context.removeImportQueueFiles(
        context.normalizeIpcFileIds(queueIds),
      );
      context.broadcastImportQueueChanged();
      return result;
    },
  );
  ipcMain.handle(IpcChannel.IMPORT_CLEAR_QUEUE, () => {
    const result = context.clearImportQueue();
    context.broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle(
    IpcChannel.HYDRUS_TEST_CONNECTION,
    (_event, options: unknown) =>
      context.testHydrusConnection(normalizeHydrusImportSettings(options)),
  );
  ipcMain.handle(IpcChannel.HYDRUS_IMPORT, async (event, options: unknown) => {
    const result = await context.importFromHydrus(
      event.sender,
      normalizeHydrusImportSettings(options),
    );
    context.broadcastFilesChanged({
      kind: "imported",
      fullRefresh: true,
    });
    context.queueAllMissingThumbnails("normal");
    return result;
  });
  ipcMain.handle(IpcChannel.HYDRUS_CANCEL_IMPORT, () => {
    context.cancelHydrusImport();
  });
  ipcMain.handle(IpcChannel.HYDRUS_GET_SETTINGS, () =>
    context.getHydrusImportSettings(),
  );
  ipcMain.handle(
    IpcChannel.HYDRUS_UPDATE_SETTINGS,
    (_event, settings: unknown) =>
      context.setHydrusImportSettings(normalizeHydrusImportSettings(settings)),
  );
}
