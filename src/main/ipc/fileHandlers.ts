import type { IpcMain } from "electron";
import type {
  BrowserFilePage,
  BrowserFilePageRequest,
  BrowserFileRecord,
  BrowserSearchPageRequest,
  DatabaseFilePage,
  DatabaseStatus,
  DomainRecord,
  FileDetailRecord,
  FileDomain,
  FilesChangedPayload,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { createLocalizedIpcError } from "./ipcErrors.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface FileHandlersContext {
  getDatabaseStatus: () => DatabaseStatus;
  listDatabaseFiles: (page: number) => DatabaseFilePage;
  listBrowserFilePage: (request: BrowserFilePageRequest) => BrowserFilePage;
  listBrowserFiles: () => BrowserFileRecord[];
  searchBrowserFilePage: (request: BrowserSearchPageRequest) => BrowserFilePage;
  listFavoriteFilePage: (request: BrowserFilePageRequest) => BrowserFilePage;
  listFavoriteFiles: () => BrowserFileRecord[];
  setFileFavorite: (fileId: number, favorite: boolean) => void;
  broadcastFileFavoriteChanged: (fileId: number, favorite: boolean) => void;
  getFileDetail: (id: number) => FileDetailRecord | null;
  getFileDetailSequence: (webContentsId: number) => number[];
  openStoredFileExternally: (fileId: number) => Promise<void>;
  listTrashedFiles: (page: number) => DatabaseFilePage;
  trashFiles: (fileIds: number[]) => void;
  restoreFiles: (fileIds: number[]) => void;
  deleteStoredFilesPermanently: (fileIds: number[]) => Promise<void>;
  setFilesDomain: (fileIds: number[], domain: FileDomain) => void;
  listDomains: () => DomainRecord[];
  broadcastFilesChanged: (payload?: Partial<FilesChangedPayload>) => void;
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

function normalizePage(value: unknown): number {
  return typeof value === "number" ? value : 1;
}

function normalizeBrowserFilePageRequest(
  value: unknown,
): BrowserFilePageRequest {
  const request = value as Partial<BrowserFilePageRequest> | null;

  return {
    page: typeof request?.page === "number" ? request.page : 1,
    pageSize: typeof request?.pageSize === "number" ? request.pageSize : 100,
    sortKey: request?.sortKey === "updatedAt" ? "updatedAt" : "importedAt",
    sortDirection: request?.sortDirection === "asc" ? "asc" : "desc",
  };
}

function normalizeBrowserSearchPageRequest(
  value: unknown,
): BrowserSearchPageRequest {
  const request = value as Partial<BrowserSearchPageRequest> | null;

  return {
    ...normalizeBrowserFilePageRequest(value),
    query: typeof request?.query === "string" ? request.query : "",
  };
}

function isValidFileId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isWritableDomain(
  value: unknown,
): value is Exclude<FileDomain, "trash"> {
  return value === "pending" || value === "library";
}

export function registerFileHandlers(
  ipcMain: IpcMain,
  context: FileHandlersContext,
): void {
  ipcMain.handle(IpcChannel.DATABASE_GET_STATUS, () =>
    context.getDatabaseStatus(),
  );
  ipcMain.handle(IpcChannel.DATABASE_LIST_FILES, (_event, page: unknown) =>
    context.listDatabaseFiles(normalizePage(page)),
  );
  ipcMain.handle(IpcChannel.BROWSER_LIST_FILES, () =>
    context.listBrowserFiles(),
  );
  ipcMain.handle(IpcChannel.BROWSER_LIST_FILE_PAGE, (_event, request: unknown) =>
    context.listBrowserFilePage(normalizeBrowserFilePageRequest(request)),
  );
  ipcMain.handle(
    IpcChannel.BROWSER_SEARCH_FILE_PAGE,
    (_event, request: unknown) =>
      context.searchBrowserFilePage(normalizeBrowserSearchPageRequest(request)),
  );
  ipcMain.handle(IpcChannel.BROWSER_LIST_FAVORITES, () =>
    context.listFavoriteFiles(),
  );
  ipcMain.handle(
    IpcChannel.BROWSER_LIST_FAVORITE_PAGE,
    (_event, request: unknown) =>
      context.listFavoriteFilePage(normalizeBrowserFilePageRequest(request)),
  );
  ipcMain.handle(
    IpcChannel.FILE_SET_FAVORITE,
    async (event, fileId: unknown, favorite: unknown) => {
      if (!isValidFileId(fileId) || typeof favorite !== "boolean") {
        throw await createLocalizedIpcError(
          event.sender,
          "file.invalidFavoriteParams",
        );
      }

      context.setFileFavorite(fileId, favorite);
      context.broadcastFileFavoriteChanged(fileId, favorite);
    },
  );
  ipcMain.handle(IpcChannel.FILE_GET_DETAIL, (_event, id: unknown) => {
    if (!isValidFileId(id)) {
      return null;
    }

    return context.getFileDetail(id);
  });
  ipcMain.handle(IpcChannel.FILE_DETAIL_GET_SEQUENCE, (event) =>
    context.getFileDetailSequence(event.sender.id),
  );
  ipcMain.handle(
    IpcChannel.FILE_OPEN_EXTERNALLY,
    async (event, fileId: unknown) => {
      if (!isValidFileId(fileId)) {
        throw await createLocalizedIpcError(event.sender, "file.invalidFile");
      }

      return context.openStoredFileExternally(fileId);
    },
  );
  ipcMain.handle(IpcChannel.TRASH_LIST_FILES, (_event, page: unknown) =>
    context.listTrashedFiles(normalizePage(page)),
  );
  ipcMain.handle(IpcChannel.TRASH_PUT_FILES, (_event, fileIds: unknown) => {
    const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
    context.trashFiles(normalizedFileIds);
    context.broadcastFilesChanged({
      kind: "trashed",
      fileIds: normalizedFileIds,
    });
  });
  ipcMain.handle(IpcChannel.TRASH_RESTORE_FILES, (_event, fileIds: unknown) => {
    const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
    context.restoreFiles(normalizedFileIds);
    context.broadcastFilesChanged({
      kind: "restored",
      fileIds: normalizedFileIds,
    });
  });
  ipcMain.handle(
    IpcChannel.TRASH_DELETE_FILES_PERMANENTLY,
    async (_event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      await context.deleteStoredFilesPermanently(normalizedFileIds);
      context.broadcastFilesChanged({
        kind: "deleted",
        fileIds: normalizedFileIds,
      });
    },
  );
  ipcMain.handle(
    IpcChannel.FILE_SET_DOMAIN,
    async (event, fileIds: unknown, domain: unknown) => {
      if (!isWritableDomain(domain)) {
        throw await createLocalizedIpcError(event.sender, "file.invalidDomain");
      }

      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      context.setFilesDomain(normalizedFileIds, domain);
      context.broadcastFilesChanged({
        kind: "domain",
        fileIds: normalizedFileIds,
      });
    },
  );
  ipcMain.handle(IpcChannel.DOMAIN_LIST, () => context.listDomains());
}
