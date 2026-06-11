import type { IpcMain } from "electron";
import type { FileUrlRecord } from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { createLocalizedIpcError } from "./ipcErrors.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface UrlHandlersContext {
  listFileUrls: (fileIds: number[]) => FileUrlRecord[];
  addFileUrl: (fileIds: number[], url: string) => FileUrlRecord[];
  updateFileUrl: (
    fileIds: number[],
    urlId: number,
    previousUrl: string,
    nextUrl: string,
  ) => FileUrlRecord[];
  removeFileUrl: (
    fileIds: number[],
    urlId: number,
    url: string,
  ) => FileUrlRecord[];
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

export function registerUrlHandlers(
  ipcMain: IpcMain,
  context: UrlHandlersContext,
): void {
  ipcMain.handle(IpcChannel.URL_LIST_FILE_URLS, (_event, fileIds: unknown) =>
    context.listFileUrls(context.normalizeIpcFileIds(fileIds)),
  );
  ipcMain.handle(
    IpcChannel.URL_ADD_FILE_URL,
    async (event, fileIds: unknown, url: unknown) => {
      if (typeof url !== "string") {
        throw await createLocalizedIpcError(event.sender, "url.invalidUrl");
      }

      return context.addFileUrl(context.normalizeIpcFileIds(fileIds), url);
    },
  );
  ipcMain.handle(
    IpcChannel.URL_UPDATE_FILE_URL,
    async (
      event,
      fileIds: unknown,
      urlId: unknown,
      previousUrl: unknown,
      nextUrl: unknown,
    ) => {
      if (
        typeof urlId !== "number" ||
        typeof previousUrl !== "string" ||
        typeof nextUrl !== "string"
      ) {
        throw await createLocalizedIpcError(event.sender, "url.invalidUrl");
      }

      return context.updateFileUrl(
        context.normalizeIpcFileIds(fileIds),
        urlId,
        previousUrl,
        nextUrl,
      );
    },
  );
  ipcMain.handle(
    IpcChannel.URL_REMOVE_FILE_URL,
    async (event, fileIds: unknown, urlId: unknown, url: unknown) => {
      if (typeof urlId !== "number" || typeof url !== "string") {
        throw await createLocalizedIpcError(event.sender, "url.invalidUrl");
      }

      return context.removeFileUrl(
        context.normalizeIpcFileIds(fileIds),
        urlId,
        url,
      );
    },
  );
}
