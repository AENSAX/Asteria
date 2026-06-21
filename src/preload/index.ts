import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AsteriaApi, FilesChangedPayload } from "../shared/ipc.js";
import { IpcChannel, IpcEvent } from "../shared/ipcChannels.js";

contextBridge.exposeInMainWorld("asteriaPreloadDebug", {
  loadedAt: new Date().toISOString(),
  hasIpcRenderer: Boolean(ipcRenderer),
  hasWebUtils: Boolean(webUtils),
});

const api: AsteriaApi = {
  getVersion: () => ipcRenderer.invoke(IpcChannel.APP_GET_VERSION),
  getDatabaseStatus: () => ipcRenderer.invoke(IpcChannel.DATABASE_GET_STATUS),
  listDatabaseFiles: (page) =>
    ipcRenderer.invoke(IpcChannel.DATABASE_LIST_FILES, page),
  listBrowserFilePage: (request) =>
    ipcRenderer.invoke(IpcChannel.BROWSER_LIST_FILE_PAGE, request),
  listBrowserFileIds: () =>
    ipcRenderer.invoke(IpcChannel.BROWSER_LIST_FILE_IDS),
  listBrowserFiles: () => ipcRenderer.invoke(IpcChannel.BROWSER_LIST_FILES),
  listBrowserFilesByIds: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.BROWSER_LIST_FILES_BY_IDS, fileIds),
  searchBrowserFilePage: (request) =>
    ipcRenderer.invoke(IpcChannel.BROWSER_SEARCH_FILE_PAGE, request),
  listFavoriteFilePage: (request) =>
    ipcRenderer.invoke(IpcChannel.BROWSER_LIST_FAVORITE_PAGE, request),
  listFavoriteFiles: () =>
    ipcRenderer.invoke(IpcChannel.BROWSER_LIST_FAVORITES),
  setFileFavorite: (fileId, favorite) =>
    ipcRenderer.invoke(IpcChannel.FILE_SET_FAVORITE, fileId, favorite),
  openDatabaseManagerWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_DATABASE_MANAGER),
  openTagManagerWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_TAG_MANAGER),
  openRecycleBinWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_RECYCLE_BIN),
  openUrlManagerWindow: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_URL_MANAGER, fileIds),
  openBatchTagManagerWindow: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_BATCH_TAG_MANAGER, fileIds),
  openBatchOperationWindow: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_BATCH_OPERATION, fileIds),
  openExportWindow: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_EXPORT, fileIds),
  openScreeningWindow: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_SCREENING, fileIds),
  openFileDetailWindow: (id, sequenceIds) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_FILE_DETAIL, id, sequenceIds),
  openSettingsWindow: () => ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_SETTINGS),
  openRatingManagerWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_RATING_MANAGER),
  openApiManagerWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_API_MANAGER),
  openHydrusImportWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_HYDRUS_IMPORT),
  openAiManagerWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_AI_MANAGER),
  openTagTranslationWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_TAG_TRANSLATION),
  openTagRelationTreeWindow: (tagIds, kind) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_TAG_RELATION_TREE, tagIds, kind),
  openFileRatingEditorWindow: (fileIds, groupId) =>
    ipcRenderer.invoke(
      IpcChannel.WINDOW_OPEN_FILE_RATING_EDITOR,
      fileIds,
      groupId,
    ),
  openFavoritesWindow: () =>
    ipcRenderer.invoke(IpcChannel.WINDOW_OPEN_FAVORITES),
  openFileExternally: (fileId) =>
    ipcRenderer.invoke(IpcChannel.FILE_OPEN_EXTERNALLY, fileId),
  startFileDrag: (fileIds) => {
    ipcRenderer.send(IpcChannel.FILE_START_DRAG, fileIds);
  },
  readClipboardText: () => ipcRenderer.invoke(IpcChannel.CLIPBOARD_READ_TEXT),
  writeClipboardText: (text) =>
    ipcRenderer.invoke(IpcChannel.CLIPBOARD_WRITE_TEXT, text),
  setWindowTitle: (title) =>
    ipcRenderer.invoke(IpcChannel.WINDOW_SET_TITLE, title),
  getFileDetail: (id) => ipcRenderer.invoke(IpcChannel.FILE_GET_DETAIL, id),
  getFileDetailSequence: () =>
    ipcRenderer.invoke(IpcChannel.FILE_DETAIL_GET_SEQUENCE),
  getStorageSettings: () => ipcRenderer.invoke(IpcChannel.SETTINGS_GET_STORAGE),
  getNetworkSettings: () => ipcRenderer.invoke(IpcChannel.SETTINGS_GET_NETWORK),
  updateNetworkSettings: (settings) =>
    ipcRenderer.invoke(IpcChannel.SETTINGS_UPDATE_NETWORK, settings),
  selectStorageDirectory: () =>
    ipcRenderer.invoke(IpcChannel.SETTINGS_SELECT_STORAGE_DIRECTORY),
  updateFileStoragePath: (path) =>
    ipcRenderer.invoke(IpcChannel.SETTINGS_UPDATE_FILE_STORAGE_PATH, path),
  updateThumbnailStoragePath: (path) =>
    ipcRenderer.invoke(IpcChannel.SETTINGS_UPDATE_THUMBNAIL_STORAGE_PATH, path),
  updateConvertImportedImagesToPng: (enabled) =>
    ipcRenderer.invoke(
      IpcChannel.SETTINGS_UPDATE_CONVERT_IMPORTED_IMAGES_TO_PNG,
      enabled,
    ),
  preloadThumbnails: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.THUMBNAIL_PRELOAD, fileIds),
  getWorkStatus: () => ipcRenderer.invoke(IpcChannel.WORK_STATUS_GET),
  listPageLayoutConfigs: () =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_LIST_CONFIGS),
  getPageLayoutSettings: () =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_GET_SETTINGS),
  getPageLayoutTemplate: (kind) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_GET_TEMPLATE, kind),
  savePageLayoutConfig: (name, layoutJson) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_SAVE_CONFIG, name, layoutJson),
  createPageLayoutConfig: () =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_CREATE_CONFIG),
  renamePageLayoutConfig: (id, name) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_RENAME_CONFIG, id, name),
  deletePageLayoutConfig: (id) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_DELETE_CONFIG, id),
  openPageLayoutConfig: (id) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_OPEN_CONFIG, id),
  setDefaultPageLayoutConfig: (id) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_SET_DEFAULT_CONFIG, id),
  setNewPageLayoutConfig: (id) =>
    ipcRenderer.invoke(IpcChannel.PAGE_LAYOUT_SET_NEW_PAGE_CONFIG, id),
  listTrashedFiles: (page) =>
    ipcRenderer.invoke(IpcChannel.TRASH_LIST_FILES, page),
  trashFiles: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.TRASH_PUT_FILES, fileIds),
  restoreFiles: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.TRASH_RESTORE_FILES, fileIds),
  restoreAllTrashedFiles: () =>
    ipcRenderer.invoke(IpcChannel.TRASH_RESTORE_ALL_FILES),
  deleteFilesPermanently: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.TRASH_DELETE_FILES_PERMANENTLY, fileIds),
  deleteAllTrashedFilesPermanently: () =>
    ipcRenderer.invoke(IpcChannel.TRASH_DELETE_ALL_FILES_PERMANENTLY),
  setFilesDomain: (fileIds, domain) =>
    ipcRenderer.invoke(IpcChannel.FILE_SET_DOMAIN, fileIds, domain),
  listDomains: () => ipcRenderer.invoke(IpcChannel.DOMAIN_LIST),
  listFileUrls: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.URL_LIST_FILE_URLS, fileIds),
  addFileUrl: (fileIds, url) =>
    ipcRenderer.invoke(IpcChannel.URL_ADD_FILE_URL, fileIds, url),
  updateFileUrl: (fileIds, urlId, previousUrl, nextUrl) =>
    ipcRenderer.invoke(
      IpcChannel.URL_UPDATE_FILE_URL,
      fileIds,
      urlId,
      previousUrl,
      nextUrl,
    ),
  removeFileUrl: (fileIds, urlId, url) =>
    ipcRenderer.invoke(IpcChannel.URL_REMOVE_FILE_URL, fileIds, urlId, url),
  listRatingGroups: () => ipcRenderer.invoke(IpcChannel.RATING_LIST_GROUPS),
  createRatingGroup: (name) =>
    ipcRenderer.invoke(IpcChannel.RATING_CREATE_GROUP, name),
  renameRatingGroup: (groupId, name) =>
    ipcRenderer.invoke(IpcChannel.RATING_RENAME_GROUP, groupId, name),
  setRatingGroupActive: (groupId, active) =>
    ipcRenderer.invoke(IpcChannel.RATING_SET_GROUP_ACTIVE, groupId, active),
  deleteRatingGroup: (groupId) =>
    ipcRenderer.invoke(IpcChannel.RATING_DELETE_GROUP, groupId),
  listRatingEntries: (groupId) =>
    ipcRenderer.invoke(IpcChannel.RATING_LIST_ENTRIES, groupId),
  createRatingEntry: (groupId, label, color) =>
    ipcRenderer.invoke(IpcChannel.RATING_CREATE_ENTRY, groupId, label, color),
  updateRatingEntry: (entryId, label, color) =>
    ipcRenderer.invoke(IpcChannel.RATING_UPDATE_ENTRY, entryId, label, color),
  deleteRatingEntry: (entryId) =>
    ipcRenderer.invoke(IpcChannel.RATING_DELETE_ENTRY, entryId),
  reorderRatingEntries: (groupId, entryIds) =>
    ipcRenderer.invoke(IpcChannel.RATING_REORDER_ENTRIES, groupId, entryIds),
  setFileRatingEntries: (fileIds, groupId, entryIds) =>
    ipcRenderer.invoke(
      IpcChannel.RATING_SET_FILE_ENTRIES,
      fileIds,
      groupId,
      entryIds,
    ),
  listFileTags: (fileId) =>
    ipcRenderer.invoke(IpcChannel.TAG_LIST_FILE_TAGS, fileId),
  listFileParentTags: (fileId) =>
    ipcRenderer.invoke(IpcChannel.TAG_LIST_FILE_PARENT_TAGS, fileId),
  listBatchFileTags: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_LIST_BATCH_FILE_TAGS, fileIds),
  listBatchEffectiveFileTags: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_LIST_BATCH_EFFECTIVE_FILE_TAGS, fileIds),
  searchTags: (query) => ipcRenderer.invoke(IpcChannel.TAG_SEARCH, query),
  searchHints: (query) => ipcRenderer.invoke(IpcChannel.SEARCH_HINTS, query),
  listTagStyles: () => ipcRenderer.invoke(IpcChannel.TAG_LIST_STYLES),
  createTagStyle: (name) =>
    ipcRenderer.invoke(IpcChannel.TAG_CREATE_STYLE, name),
  renameTagStyle: (styleId, name) =>
    ipcRenderer.invoke(IpcChannel.TAG_RENAME_STYLE, styleId, name),
  setActiveTagStyle: (styleId) =>
    ipcRenderer.invoke(IpcChannel.TAG_SET_ACTIVE_STYLE, styleId),
  deleteTagStyle: (styleId) =>
    ipcRenderer.invoke(IpcChannel.TAG_DELETE_STYLE, styleId),
  listManagedTags: (styleId, sortKey, direction) =>
    ipcRenderer.invoke(
      IpcChannel.TAG_LIST_MANAGED_TAGS,
      styleId,
      sortKey,
      direction,
    ),
  listTagParents: () => ipcRenderer.invoke(IpcChannel.TAG_LIST_PARENTS),
  listTagSiblings: () => ipcRenderer.invoke(IpcChannel.TAG_LIST_SIBLINGS),
  getTagRelationTree: (tagIds, kind) =>
    ipcRenderer.invoke(IpcChannel.TAG_GET_RELATION_TREE, tagIds, kind),
  addTagParent: (childTagId, parentTagId) =>
    ipcRenderer.invoke(IpcChannel.TAG_ADD_PARENT, childTagId, parentTagId),
  addTagParents: (pairs) =>
    ipcRenderer.invoke(IpcChannel.TAG_ADD_PARENTS, pairs),
  removeTagParent: (childTagId, parentTagId) =>
    ipcRenderer.invoke(IpcChannel.TAG_REMOVE_PARENT, childTagId, parentTagId),
  removeTagParents: (pairs) =>
    ipcRenderer.invoke(IpcChannel.TAG_REMOVE_PARENTS, pairs),
  addTagSibling: (aliasTagId, canonicalTagId) =>
    ipcRenderer.invoke(IpcChannel.TAG_ADD_SIBLING, aliasTagId, canonicalTagId),
  addTagSiblings: (pairs) =>
    ipcRenderer.invoke(IpcChannel.TAG_ADD_SIBLINGS, pairs),
  removeTagSibling: (aliasTagId) =>
    ipcRenderer.invoke(IpcChannel.TAG_REMOVE_SIBLING, aliasTagId),
  removeTagSiblings: (aliasTagIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_REMOVE_SIBLINGS, aliasTagIds),
  createManagedTag: (styleId, tag) =>
    ipcRenderer.invoke(IpcChannel.TAG_CREATE_MANAGED_TAG, styleId, tag),
  createManagedTags: (styleId, tags) =>
    ipcRenderer.invoke(IpcChannel.TAG_CREATE_MANAGED_TAGS, styleId, tags),
  renameManagedTag: (tagId, tag) =>
    ipcRenderer.invoke(IpcChannel.TAG_RENAME_MANAGED_TAG, tagId, tag),
  previewManagedTagRename: (tagId, tag) =>
    ipcRenderer.invoke(IpcChannel.TAG_PREVIEW_MANAGED_RENAME, tagId, tag),
  deleteManagedTag: (tagId) =>
    ipcRenderer.invoke(IpcChannel.TAG_DELETE_MANAGED_TAG, tagId),
  deleteManagedTags: (tagIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_DELETE_MANAGED_TAGS, tagIds),
  addFileTags: (fileId, tags) =>
    ipcRenderer.invoke(IpcChannel.TAG_ADD_FILE_TAGS, fileId, tags),
  removeFileTags: (fileId, tagIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_REMOVE_FILE_TAGS, fileId, tagIds),
  addTagsToFiles: (fileIds, tags) =>
    ipcRenderer.invoke(IpcChannel.TAG_ADD_TAGS_TO_FILES, fileIds, tags),
  removeTagsFromFiles: (fileIds, tagIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_REMOVE_TAGS_FROM_FILES, fileIds, tagIds),
  importFiles: (queueKey) =>
    ipcRenderer.invoke(IpcChannel.IMPORT_FILES, queueKey),
  importFolder: (queueKey) =>
    ipcRenderer.invoke(IpcChannel.IMPORT_FOLDER, queueKey),
  importPaths: (paths, queueKey) =>
    ipcRenderer.invoke(IpcChannel.IMPORT_PATHS, paths, queueKey),
  importUrls: (urls, queueKey) =>
    ipcRenderer.invoke(IpcChannel.IMPORT_URLS, urls, queueKey),
  listImportQueueFiles: (queueKey) =>
    ipcRenderer.invoke(IpcChannel.IMPORT_LIST_QUEUE_FILES, queueKey),
  commitImportQueue: (queueIds, confirmedDuplicateQueueIds, queueKey) =>
    ipcRenderer.invoke(
      IpcChannel.IMPORT_COMMIT_QUEUE,
      queueIds,
      confirmedDuplicateQueueIds,
      queueKey,
    ),
  removeImportQueueFiles: (queueIds, queueKey) =>
    ipcRenderer.invoke(
      IpcChannel.IMPORT_REMOVE_QUEUE_FILES,
      queueIds,
      queueKey,
    ),
  clearImportQueue: (queueKey) =>
    ipcRenderer.invoke(IpcChannel.IMPORT_CLEAR_QUEUE, queueKey),
  testHydrusConnection: (options) =>
    ipcRenderer.invoke(IpcChannel.HYDRUS_TEST_CONNECTION, options),
  importFromHydrus: (options) =>
    ipcRenderer.invoke(IpcChannel.HYDRUS_IMPORT, options),
  cancelHydrusImport: () => ipcRenderer.invoke(IpcChannel.HYDRUS_CANCEL_IMPORT),
  getHydrusImportSettings: () =>
    ipcRenderer.invoke(IpcChannel.HYDRUS_GET_SETTINGS),
  updateHydrusImportSettings: (settings) =>
    ipcRenderer.invoke(IpcChannel.HYDRUS_UPDATE_SETTINGS, settings),
  getTagTranslationSettings: () =>
    ipcRenderer.invoke(IpcChannel.TAG_TRANSLATION_GET_SETTINGS),
  updateTagTranslationSettings: (settings) =>
    ipcRenderer.invoke(IpcChannel.TAG_TRANSLATION_UPDATE_SETTINGS, settings),
  selectTagTranslationCsv: () =>
    ipcRenderer.invoke(IpcChannel.TAG_TRANSLATION_SELECT_CSV),
  translateFileTags: (fileIds) =>
    ipcRenderer.invoke(IpcChannel.TAG_TRANSLATION_TRANSLATE_FILES, fileIds),
  getAiSettings: () => ipcRenderer.invoke(IpcChannel.AI_GET_SETTINGS),
  updateAiSettings: (settings) =>
    ipcRenderer.invoke(IpcChannel.AI_UPDATE_SETTINGS, settings),
  selectAiModelDirectory: () =>
    ipcRenderer.invoke(IpcChannel.AI_SELECT_MODEL_DIRECTORY),
  detectAiModel: (modelPath) =>
    ipcRenderer.invoke(IpcChannel.AI_DETECT_MODEL, modelPath),
  detectAiModels: (modelPath, selectedModelName) =>
    ipcRenderer.invoke(
      IpcChannel.AI_DETECT_MODELS,
      modelPath,
      selectedModelName,
    ),
  downloadDefaultAiModel: (modelPath) =>
    ipcRenderer.invoke(IpcChannel.AI_DOWNLOAD_DEFAULT_MODEL, modelPath),
  tagFilesWithAi: (fileIds, overwrite) =>
    ipcRenderer.invoke(IpcChannel.AI_TAG_FILES, fileIds, overwrite),
  selectExportDirectory: () =>
    ipcRenderer.invoke(IpcChannel.EXPORT_SELECT_DIRECTORY),
  exportFiles: (options) =>
    ipcRenderer.invoke(IpcChannel.EXPORT_FILES, options),
  cancelExport: (jobId) => ipcRenderer.invoke(IpcChannel.EXPORT_CANCEL, jobId),
  listApiPermissions: () => ipcRenderer.invoke(IpcChannel.API_LIST_PERMISSIONS),
  listApiServices: () => ipcRenderer.invoke(IpcChannel.API_LIST_SERVICES),
  createApiService: (name) =>
    ipcRenderer.invoke(IpcChannel.API_CREATE_SERVICE, name),
  updateApiService: (serviceId, draft) =>
    ipcRenderer.invoke(IpcChannel.API_UPDATE_SERVICE, serviceId, draft),
  deleteApiService: (serviceId) =>
    ipcRenderer.invoke(IpcChannel.API_DELETE_SERVICE, serviceId),
  getApiServiceAvailability: (serviceId) =>
    ipcRenderer.invoke(IpcChannel.API_GET_SERVICE_AVAILABILITY, serviceId),
  confirmDialog: (options) =>
    ipcRenderer.invoke(IpcChannel.DIALOG_CONFIRM, options),
  alertDialog: (options) =>
    ipcRenderer.invoke(IpcChannel.DIALOG_ALERT, options),
  getDialogState: (dialogId) =>
    ipcRenderer.invoke(IpcChannel.DIALOG_GET_STATE, dialogId),
  resizeDialog: (dialogId, width, height) =>
    ipcRenderer.invoke(IpcChannel.DIALOG_RESIZE, dialogId, width, height),
  resolveDialog: (dialogId, confirmed) =>
    ipcRenderer.invoke(IpcChannel.DIALOG_RESOLVE, dialogId, confirmed),
  getPathForFile: (file) => webUtils.getPathForFile(file as File),
  setNativeTheme: (theme) =>
    ipcRenderer.invoke(IpcChannel.THEME_SET_NATIVE, theme),
  onImportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcEvent.IMPORT_PROGRESS, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.IMPORT_PROGRESS, wrappedListener);
    };
  },
  onDialogStateChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      state: unknown,
    ): void => {
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcEvent.DIALOG_STATE_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        IpcEvent.DIALOG_STATE_CHANGED,
        wrappedListener,
      );
    };
  },
  onExportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcEvent.EXPORT_PROGRESS, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.EXPORT_PROGRESS, wrappedListener);
    };
  },
  onImportQueueChanged: (listener) => {
    const wrappedListener = (): void => {
      listener();
    };

    ipcRenderer.on(IpcEvent.IMPORT_QUEUE_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        IpcEvent.IMPORT_QUEUE_CHANGED,
        wrappedListener,
      );
    };
  },
  onHydrusImportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcEvent.HYDRUS_IMPORT_PROGRESS, wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        IpcEvent.HYDRUS_IMPORT_PROGRESS,
        wrappedListener,
      );
    };
  },
  onFileDetailReset: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      fileId: unknown,
    ): void => {
      if (typeof fileId === "number") {
        listener(fileId);
      }
    };

    ipcRenderer.on(IpcEvent.FILE_DETAIL_RESET, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.FILE_DETAIL_RESET, wrappedListener);
    };
  },
  onFilesChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ): void => {
      listener(normalizeFilesChangedPayload(payload));
    };

    ipcRenderer.on(IpcEvent.FILES_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.FILES_CHANGED, wrappedListener);
    };
  },
  onFileFavoriteChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      fileId: unknown,
      favorite: unknown,
    ): void => {
      if (typeof fileId === "number" && typeof favorite === "boolean") {
        listener(fileId, favorite);
      }
    };

    ipcRenderer.on(IpcEvent.FILE_FAVORITE_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        IpcEvent.FILE_FAVORITE_CHANGED,
        wrappedListener,
      );
    };
  },
  onPageLayoutChanged: (listener) => {
    const wrappedListener = (): void => {
      listener();
    };

    ipcRenderer.on(IpcEvent.PAGE_LAYOUT_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.PAGE_LAYOUT_CHANGED, wrappedListener);
    };
  },
  onSettingsChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ): void => {
      const kind = (payload as { kind?: unknown } | null)?.kind;

      if (kind === "ai" || kind === "tagTranslation") {
        listener({ kind });
      }
    };

    ipcRenderer.on(IpcEvent.SETTINGS_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.SETTINGS_CHANGED, wrappedListener);
    };
  },
  onWorkStatusChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      status: unknown,
    ): void => {
      listener(status as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(IpcEvent.WORK_STATUS_CHANGED, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IpcEvent.WORK_STATUS_CHANGED, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("asteria", api);

function normalizeFilesChangedPayload(payload: unknown): FilesChangedPayload {
  if (!payload || typeof payload !== "object") {
    return {
      kind: "unknown",
      fullRefresh: true,
    };
  }

  const candidate = payload as Partial<FilesChangedPayload>;
  const fileIds = Array.isArray(candidate.fileIds)
    ? candidate.fileIds.filter(
        (fileId): fileId is number =>
          Number.isInteger(fileId) && fileId > 0,
      )
    : undefined;

  return {
    kind: typeof candidate.kind === "string" ? candidate.kind : "unknown",
    ...(candidate.fullRefresh === true || !fileIds?.length
      ? { fullRefresh: true }
      : { fileIds }),
  };
}
