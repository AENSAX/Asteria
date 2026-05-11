import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AsteriaApi } from "../shared/ipc.js";

contextBridge.exposeInMainWorld("asteriaPreloadDebug", {
  loadedAt: new Date().toISOString(),
  hasIpcRenderer: Boolean(ipcRenderer),
  hasWebUtils: Boolean(webUtils),
});

const api: AsteriaApi = {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getDatabaseStatus: () => ipcRenderer.invoke("database:get-status"),
  listDatabaseFiles: (page) => ipcRenderer.invoke("database:list-files", page),
  listBrowserFiles: () => ipcRenderer.invoke("browser:list-files"),
  searchBrowserFiles: (query) =>
    ipcRenderer.invoke("browser:search-files", query),
  listFavoriteFiles: () => ipcRenderer.invoke("browser:list-favorites"),
  setFileFavorite: (fileId, favorite) =>
    ipcRenderer.invoke("file:set-favorite", fileId, favorite),
  openDatabaseManagerWindow: () =>
    ipcRenderer.invoke("window:open-database-manager"),
  openTagManagerWindow: () => ipcRenderer.invoke("window:open-tag-manager"),
  openRecycleBinWindow: () => ipcRenderer.invoke("window:open-recycle-bin"),
  openUrlManagerWindow: (fileIds) =>
    ipcRenderer.invoke("window:open-url-manager", fileIds),
  openBatchTagManagerWindow: (fileIds) =>
    ipcRenderer.invoke("window:open-batch-tag-manager", fileIds),
  openBatchOperationWindow: (fileIds) =>
    ipcRenderer.invoke("window:open-batch-operation", fileIds),
  openExportWindow: (fileIds) =>
    ipcRenderer.invoke("window:open-export", fileIds),
  openScreeningWindow: (fileIds) =>
    ipcRenderer.invoke("window:open-screening", fileIds),
  openFileDetailWindow: (id, sequenceIds) =>
    ipcRenderer.invoke("window:open-file-detail", id, sequenceIds),
  openSettingsWindow: () => ipcRenderer.invoke("window:open-settings"),
  openRatingManagerWindow: () =>
    ipcRenderer.invoke("window:open-rating-manager"),
  openApiManagerWindow: () => ipcRenderer.invoke("window:open-api-manager"),
  openHydrusImportWindow: () => ipcRenderer.invoke("window:open-hydrus-import"),
  openEHentaiImportWindow: () =>
    ipcRenderer.invoke("window:open-ehentai-import"),
  openAiManagerWindow: () => ipcRenderer.invoke("window:open-ai-manager"),
  openTagTranslationWindow: () =>
    ipcRenderer.invoke("window:open-tag-translation"),
  openFileRatingEditorWindow: (fileIds, groupId) =>
    ipcRenderer.invoke("window:open-file-rating-editor", fileIds, groupId),
  openFavoritesWindow: () => ipcRenderer.invoke("window:open-favorites"),
  openFileExternally: (fileId) =>
    ipcRenderer.invoke("file:open-externally", fileId),
  setWindowTitle: (title) => ipcRenderer.invoke("window:set-title", title),
  getFileDetail: (id) => ipcRenderer.invoke("file:get-detail", id),
  getFileDetailSequence: () => ipcRenderer.invoke("file-detail:get-sequence"),
  getStorageSettings: () => ipcRenderer.invoke("settings:get-storage"),
  getNetworkSettings: () => ipcRenderer.invoke("settings:get-network"),
  updateNetworkSettings: (settings) =>
    ipcRenderer.invoke("settings:update-network", settings),
  selectStorageDirectory: () =>
    ipcRenderer.invoke("settings:select-storage-directory"),
  updateFileStoragePath: (path) =>
    ipcRenderer.invoke("settings:update-file-storage-path", path),
  updateThumbnailStoragePath: (path) =>
    ipcRenderer.invoke("settings:update-thumbnail-storage-path", path),
  updateConvertImportedImagesToPng: (enabled) =>
    ipcRenderer.invoke(
      "settings:update-convert-imported-images-to-png",
      enabled,
    ),
  preloadThumbnails: (fileIds) =>
    ipcRenderer.invoke("thumbnail:preload", fileIds),
  getWorkStatus: () => ipcRenderer.invoke("work-status:get"),
  listPageLayoutConfigs: () => ipcRenderer.invoke("page-layout:list-configs"),
  getPageLayoutSettings: () => ipcRenderer.invoke("page-layout:get-settings"),
  getPageLayoutTemplate: (kind) =>
    ipcRenderer.invoke("page-layout:get-template", kind),
  savePageLayoutConfig: (name, layoutJson) =>
    ipcRenderer.invoke("page-layout:save-config", name, layoutJson),
  createPageLayoutConfig: () => ipcRenderer.invoke("page-layout:create-config"),
  renamePageLayoutConfig: (id, name) =>
    ipcRenderer.invoke("page-layout:rename-config", id, name),
  deletePageLayoutConfig: (id) =>
    ipcRenderer.invoke("page-layout:delete-config", id),
  openPageLayoutConfig: (id) =>
    ipcRenderer.invoke("page-layout:open-config", id),
  setDefaultPageLayoutConfig: (id) =>
    ipcRenderer.invoke("page-layout:set-default-config", id),
  setNewPageLayoutConfig: (id) =>
    ipcRenderer.invoke("page-layout:set-new-page-config", id),
  listTrashedFiles: (page) => ipcRenderer.invoke("trash:list-files", page),
  trashFiles: (fileIds) => ipcRenderer.invoke("trash:put-files", fileIds),
  restoreFiles: (fileIds) => ipcRenderer.invoke("trash:restore-files", fileIds),
  deleteFilesPermanently: (fileIds) =>
    ipcRenderer.invoke("trash:delete-files-permanently", fileIds),
  setFilesDomain: (fileIds, domain) =>
    ipcRenderer.invoke("file:set-domain", fileIds, domain),
  listDomains: () => ipcRenderer.invoke("domain:list"),
  listFileUrls: (fileIds) => ipcRenderer.invoke("url:list-file-urls", fileIds),
  addFileUrl: (fileIds, url) =>
    ipcRenderer.invoke("url:add-file-url", fileIds, url),
  updateFileUrl: (fileIds, urlId, previousUrl, nextUrl) =>
    ipcRenderer.invoke(
      "url:update-file-url",
      fileIds,
      urlId,
      previousUrl,
      nextUrl,
    ),
  removeFileUrl: (fileIds, urlId, url) =>
    ipcRenderer.invoke("url:remove-file-url", fileIds, urlId, url),
  listRatingGroups: () => ipcRenderer.invoke("rating:list-groups"),
  createRatingGroup: (name) => ipcRenderer.invoke("rating:create-group", name),
  renameRatingGroup: (groupId, name) =>
    ipcRenderer.invoke("rating:rename-group", groupId, name),
  setRatingGroupActive: (groupId, active) =>
    ipcRenderer.invoke("rating:set-group-active", groupId, active),
  deleteRatingGroup: (groupId) =>
    ipcRenderer.invoke("rating:delete-group", groupId),
  listRatingEntries: (groupId) =>
    ipcRenderer.invoke("rating:list-entries", groupId),
  createRatingEntry: (groupId, label, color) =>
    ipcRenderer.invoke("rating:create-entry", groupId, label, color),
  updateRatingEntry: (entryId, label, color) =>
    ipcRenderer.invoke("rating:update-entry", entryId, label, color),
  deleteRatingEntry: (entryId) =>
    ipcRenderer.invoke("rating:delete-entry", entryId),
  reorderRatingEntries: (groupId, entryIds) =>
    ipcRenderer.invoke("rating:reorder-entries", groupId, entryIds),
  setFileRatingEntries: (fileIds, groupId, entryIds) =>
    ipcRenderer.invoke("rating:set-file-entries", fileIds, groupId, entryIds),
  listFileTags: (fileId) => ipcRenderer.invoke("tag:list-file-tags", fileId),
  listBatchFileTags: (fileIds) =>
    ipcRenderer.invoke("tag:list-batch-file-tags", fileIds),
  searchTags: (query) => ipcRenderer.invoke("tag:search", query),
  searchHints: (query) => ipcRenderer.invoke("search:hints", query),
  listTagStyles: () => ipcRenderer.invoke("tag:list-styles"),
  createTagStyle: (name) => ipcRenderer.invoke("tag:create-style", name),
  renameTagStyle: (styleId, name) =>
    ipcRenderer.invoke("tag:rename-style", styleId, name),
  setActiveTagStyle: (styleId) =>
    ipcRenderer.invoke("tag:set-active-style", styleId),
  deleteTagStyle: (styleId) => ipcRenderer.invoke("tag:delete-style", styleId),
  listManagedTags: (styleId, sortKey, direction) =>
    ipcRenderer.invoke("tag:list-managed-tags", styleId, sortKey, direction),
  createManagedTag: (styleId, tag) =>
    ipcRenderer.invoke("tag:create-managed-tag", styleId, tag),
  deleteManagedTag: (tagId) =>
    ipcRenderer.invoke("tag:delete-managed-tag", tagId),
  deleteManagedTags: (tagIds) =>
    ipcRenderer.invoke("tag:delete-managed-tags", tagIds),
  addFileTags: (fileId, tags) =>
    ipcRenderer.invoke("tag:add-file-tags", fileId, tags),
  removeFileTags: (fileId, tagIds) =>
    ipcRenderer.invoke("tag:remove-file-tags", fileId, tagIds),
  addTagsToFiles: (fileIds, tags) =>
    ipcRenderer.invoke("tag:add-tags-to-files", fileIds, tags),
  removeTagsFromFiles: (fileIds, tagIds) =>
    ipcRenderer.invoke("tag:remove-tags-from-files", fileIds, tagIds),
  importFiles: () => ipcRenderer.invoke("import:files"),
  importFolder: () => ipcRenderer.invoke("import:folder"),
  importPaths: (paths) => ipcRenderer.invoke("import:paths", paths),
  importUrls: (urls) => ipcRenderer.invoke("import:urls", urls),
  listImportQueueFiles: () => ipcRenderer.invoke("import:list-queue-files"),
  commitImportQueue: (queueIds, confirmedDuplicateQueueIds) =>
    ipcRenderer.invoke(
      "import:commit-queue",
      queueIds,
      confirmedDuplicateQueueIds,
    ),
  removeImportQueueFiles: (queueIds) =>
    ipcRenderer.invoke("import:remove-queue-files", queueIds),
  clearImportQueue: () => ipcRenderer.invoke("import:clear-queue"),
  testHydrusConnection: (options) =>
    ipcRenderer.invoke("hydrus:test-connection", options),
  importFromHydrus: (options) => ipcRenderer.invoke("hydrus:import", options),
  cancelHydrusImport: () => ipcRenderer.invoke("hydrus:cancel-import"),
  getHydrusImportSettings: () => ipcRenderer.invoke("hydrus:get-settings"),
  updateHydrusImportSettings: (settings) =>
    ipcRenderer.invoke("hydrus:update-settings", settings),
  testEHentaiGallery: (options) =>
    ipcRenderer.invoke("ehentai:test-gallery", options),
  importFromEHentai: (options) => ipcRenderer.invoke("ehentai:import", options),
  cancelEHentaiImport: () => ipcRenderer.invoke("ehentai:cancel-import"),
  getEHentaiImportSettings: () => ipcRenderer.invoke("ehentai:get-settings"),
  updateEHentaiImportSettings: (settings) =>
    ipcRenderer.invoke("ehentai:update-settings", settings),
  getTagTranslationSettings: () =>
    ipcRenderer.invoke("tag-translation:get-settings"),
  updateTagTranslationSettings: (settings) =>
    ipcRenderer.invoke("tag-translation:update-settings", settings),
  selectTagTranslationCsv: () =>
    ipcRenderer.invoke("tag-translation:select-csv"),
  translateFileTags: (fileIds) =>
    ipcRenderer.invoke("tag-translation:translate-files", fileIds),
  getAiSettings: () => ipcRenderer.invoke("ai:get-settings"),
  updateAiSettings: (settings) =>
    ipcRenderer.invoke("ai:update-settings", settings),
  selectAiModelDirectory: () => ipcRenderer.invoke("ai:select-model-directory"),
  detectAiModel: (modelPath) =>
    ipcRenderer.invoke("ai:detect-model", modelPath),
  detectAiModels: (modelPath, selectedModelName) =>
    ipcRenderer.invoke("ai:detect-models", modelPath, selectedModelName),
  downloadDefaultAiModel: (modelPath) =>
    ipcRenderer.invoke("ai:download-default-model", modelPath),
  tagFilesWithAi: (fileIds, overwrite) =>
    ipcRenderer.invoke("ai:tag-files", fileIds, overwrite),
  selectExportDirectory: () => ipcRenderer.invoke("export:select-directory"),
  exportFiles: (options) => ipcRenderer.invoke("export:files", options),
  cancelExport: (jobId) => ipcRenderer.invoke("export:cancel", jobId),
  listApiPermissions: () => ipcRenderer.invoke("api:list-permissions"),
  listApiServices: () => ipcRenderer.invoke("api:list-services"),
  createApiService: (name) => ipcRenderer.invoke("api:create-service", name),
  updateApiService: (serviceId, draft) =>
    ipcRenderer.invoke("api:update-service", serviceId, draft),
  deleteApiService: (serviceId) =>
    ipcRenderer.invoke("api:delete-service", serviceId),
  getApiServiceAvailability: (serviceId) =>
    ipcRenderer.invoke("api:get-service-availability", serviceId),
  confirmDialog: (options) => ipcRenderer.invoke("dialog:confirm", options),
  getDialogState: (dialogId) =>
    ipcRenderer.invoke("dialog:get-state", dialogId),
  resizeDialog: (dialogId, width, height) =>
    ipcRenderer.invoke("dialog:resize", dialogId, width, height),
  resolveDialog: (dialogId, confirmed) =>
    ipcRenderer.invoke("dialog:resolve", dialogId, confirmed),
  getPathForFile: (file) => webUtils.getPathForFile(file as File),
  setNativeTheme: (theme) => ipcRenderer.invoke("theme:set-native", theme),
  onImportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("import:progress", wrappedListener);

    return () => {
      ipcRenderer.removeListener("import:progress", wrappedListener);
    };
  },
  onDialogStateChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      state: unknown,
    ): void => {
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("dialog:state-changed", wrappedListener);

    return () => {
      ipcRenderer.removeListener("dialog:state-changed", wrappedListener);
    };
  },
  onExportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("export:progress", wrappedListener);

    return () => {
      ipcRenderer.removeListener("export:progress", wrappedListener);
    };
  },
  onImportQueueChanged: (listener) => {
    const wrappedListener = (): void => {
      listener();
    };

    ipcRenderer.on("import-queue:changed", wrappedListener);

    return () => {
      ipcRenderer.removeListener("import-queue:changed", wrappedListener);
    };
  },
  onHydrusImportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("hydrus-import:progress", wrappedListener);

    return () => {
      ipcRenderer.removeListener("hydrus-import:progress", wrappedListener);
    };
  },
  onEHentaiImportProgress: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      progress: unknown,
    ): void => {
      listener(progress as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("ehentai-import:progress", wrappedListener);

    return () => {
      ipcRenderer.removeListener("ehentai-import:progress", wrappedListener);
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

    ipcRenderer.on("file-detail:reset", wrappedListener);

    return () => {
      ipcRenderer.removeListener("file-detail:reset", wrappedListener);
    };
  },
  onFilesChanged: (listener) => {
    const wrappedListener = (): void => {
      listener();
    };

    ipcRenderer.on("files:changed", wrappedListener);

    return () => {
      ipcRenderer.removeListener("files:changed", wrappedListener);
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

    ipcRenderer.on("file:favorite-changed", wrappedListener);

    return () => {
      ipcRenderer.removeListener("file:favorite-changed", wrappedListener);
    };
  },
  onPageLayoutChanged: (listener) => {
    const wrappedListener = (): void => {
      listener();
    };

    ipcRenderer.on("page-layout:changed", wrappedListener);

    return () => {
      ipcRenderer.removeListener("page-layout:changed", wrappedListener);
    };
  },
  onWorkStatusChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      status: unknown,
    ): void => {
      listener(status as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("work-status:changed", wrappedListener);

    return () => {
      ipcRenderer.removeListener("work-status:changed", wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("asteria", api);
