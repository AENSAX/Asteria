import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  nativeTheme,
  protocol,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron";
import { copyFile, cp, mkdir, rm, stat, unlink } from "node:fs/promises";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  closeDatabase,
  addFileTags,
  addFileUrl,
  addTagsToFiles,
  createApiService,
  deleteAppSetting,
  deleteApiService,
  getEHentaiImportSettings,
  deleteFilesPermanently as deleteFilesPermanentlyFromDatabase,
  createRatingEntry,
  createRatingGroup,
  getAiSettings,
  getHydrusImportSettings,
  getFileDetail,
  getFileOriginalPath,
  getNetworkSettings,
  getTagTranslationSettings,
  getAppSetting,
  getDatabaseStatus,
  hasStoredFileReference,
  hasStoredPathReference,
  getStorageSettings,
  initializeDatabase,
  createManagedTag,
  createTagStyle,
  deleteManagedTag,
  deleteManagedTags,
  deleteTagStyle,
  listDomains,
  listApiPermissions,
  listApiServices,
  listFilesForStorageMigration,
  listFavoriteFiles,
  listFileTags,
  listFileUrls,
  listBatchFileTags,
  listBrowserFiles,
  listDatabaseFiles,
  listManagedTags,
  listRatingEntries,
  listRatingGroups,
  listTrashedFiles,
  listTagStyles,
  removeFileTags,
  removeFileUrl,
  removeTagsFromFiles,
  deleteRatingEntry,
  deleteRatingGroup,
  renameRatingGroup,
  reorderRatingEntries,
  restoreFiles,
  searchTags,
  searchBrowserFiles,
  searchHints,
  renameTagStyle,
  setActiveTagStyle,
  setAppSetting,
  setAiSettings,
  setEHentaiImportSettings,
  setHydrusImportSettings,
  setNetworkSettings,
  setTagTranslationSettings,
  setFileFavorite,
  setFilesDomain,
  setFileRatingEntries,
  setRatingGroupActive,
  setConvertImportedImagesToPng,
  setFileStoragePath,
  setThumbnailStoragePath,
  trashFiles,
  updateRatingEntry,
  updateFileUrl,
  updateApiService,
  updateFileStorageRecordPath,
  translateFileTags,
} from "./database.js";
import type {
  AiSettings,
  AiTaggingSummary,
  DatabaseFileRecord,
  ConfirmDialogOptions,
  ApiServiceDraft,
  ExportOptions,
  EHentaiImportOptions,
  GenericDialogState,
  HydrusImportOptions,
  OperationProgress,
  PageLayoutConfigRecord,
  PageLayoutSettings,
  NetworkSettings,
  StorageSettings,
  TagTranslationSettings,
  TagDraft,
  WorkStatus,
} from "../shared/ipc.js";
import {
  clearImportQueue,
  commitImportQueue,
  getImportQueueFilePath,
  importFiles,
  importFolder,
  importPaths,
  importUrls,
  listImportQueueFiles,
  removeImportQueueFiles,
} from "./importService.js";
import { cancelExport, exportFiles } from "./exportService.js";
import {
  cancelHydrusImport,
  importFromHydrus,
  testHydrusConnection,
} from "./hydrusImportService.js";
import {
  cancelEHentaiImport,
  importFromEHentai,
  testEHentaiGallery,
} from "./ehentaiImportService.js";
import {
  getApiServiceRuntimeAvailability,
  setApiFilesChangedHandler,
  stopApiServers,
  syncApiServers,
} from "./apiService.js";
import { clearStaleApiUploadBatches } from "./apiUploadService.js";
import {
  ensureThumbnailForFile,
  deleteThumbnailForSha,
  getThumbnailFallbackPath,
  getThumbnailWorkStatus,
  queueAllMissingThumbnails,
  queueThumbnailPreload,
  setThumbnailStatusListener,
} from "./thumbnailService.js";
import {
  defaultAiModelExists,
  detectAiModel,
  detectAiModels,
  downloadDefaultAiModel,
  getAiTaggingWorkStatus,
  setAiTaggingStatusListener,
  tagFilesWithAi,
  tagUntaggedImagesWithAi,
} from "./aiService.js";
import { applyNetworkSettings } from "./networkService.js";
import { configureDevelopmentAppPaths, loadDevelopmentEnv } from "./env.js";
import {
  buildStoredFileName,
  getImageConversionWorkStatus,
  setImageConversionStatusListener,
} from "./mediaStorage.js";

loadDevelopmentEnv();
configureDevelopmentAppPaths();

app.commandLine.appendSwitch("disable-crash-reporter");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "asteria-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const fileDetailWindows = new Map<number, BrowserWindow>();
const fileDetailSequences = new Map<number, number[]>();
const genericDialogs = new Map<
  string,
  {
    state: GenericDialogState;
    window: BrowserWindow | null;
    resolve?: (confirmed: boolean) => void;
  }
>();
const PAGE_LAYOUT_DEFAULT_SETTING_KEY = "page_layout_default_config_id";
const PAGE_LAYOUT_NEW_PAGE_SETTING_KEY = "page_layout_new_page_config_id";
const PAGE_LAYOUT_FILE_EXTENSION = ".jsonc";
let mainCloseConfirmOpen = false;
let mainCloseConfirmed = false;
let genericDialogCounter = 1;

type StorageMigrationOutcome =
  | "migrated"
  | "adopted"
  | "alreadyCurrent"
  | "missing";
type StorageMigrationResult = Record<StorageMigrationOutcome, number>;

function createAsteriaWindow(
  options: BrowserWindowConstructorOptions,
): BrowserWindow {
  const icon = getWindowIconPath();

  return new BrowserWindow({
    backgroundColor: "#1f2225",
    ...(icon ? { icon } : {}),
    ...options,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      ...options.webPreferences,
    },
  });
}

function showWhenReady(window: BrowserWindow): void {
  window.once("ready-to-show", () => {
    window.show();
  });
}

function getWindowIconPath(): string | undefined {
  const iconFileName =
    process.platform === "darwin"
      ? "app.icns"
      : process.platform === "win32"
        ? "app.ico"
        : "app.png";
  const candidates = [
    join(process.resourcesPath, "icons", iconFileName),
    join(app.getAppPath(), "resources", "icons", iconFileName),
    join(process.cwd(), "resources", "icons", iconFileName),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function createMainWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    title: "Asteria",
    backgroundColor: "#f3f4f6",
    show: false,
  });

  setupWindowDiagnostics(window);
  confirmMainWindowClose(window);
  loadRenderer(window);

  showWhenReady(window);

  if (!app.isPackaged && process.env.ASTERIA_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}

function createDatabaseManagerWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: "查看数据库",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "database-manager" });

  showWhenReady(window);

  return window;
}

function createTagManagerWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: "管理标签",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "tag-manager" });

  showWhenReady(window);

  return window;
}

function createRecycleBinWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: "回收站",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "recycle-bin" });

  showWhenReady(window);

  return window;
}

function createRatingManagerWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: "分级",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "rating-manager" });

  showWhenReady(window);

  return window;
}

function createApiManagerWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 900,
    height: 560,
    minWidth: 680,
    minHeight: 420,
    title: "API",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "api-manager" });

  showWhenReady(window);

  return window;
}

function createHydrusImportWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find(
    (window) => window.getTitle() === "从 Hydrus 导入" && !window.isDestroyed(),
  );

  if (existing) {
    existing.show();
    existing.focus();
    return existing;
  }

  const window = createAsteriaWindow({
    width: 820,
    height: 560,
    minWidth: 640,
    minHeight: 420,
    title: "从 Hydrus 导入",
    autoHideMenuBar: true,
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "hydrus-import" });

  showWhenReady(window);

  return window;
}

function createEHentaiImportWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find(
    (window) =>
      window.getTitle() === "从 E-Hentai 导入" && !window.isDestroyed(),
  );

  if (existing) {
    existing.show();
    existing.focus();
    return existing;
  }

  const window = createAsteriaWindow({
    width: 860,
    height: 560,
    minWidth: 660,
    minHeight: 420,
    title: "从 E-Hentai 导入",
    autoHideMenuBar: true,
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "ehentai-import" });

  showWhenReady(window);

  return window;
}

function createAiManagerWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find(
    (window) => window.getTitle() === "人工智能" && !window.isDestroyed(),
  );

  if (existing) {
    existing.show();
    existing.focus();
    return existing;
  }

  const window = createAsteriaWindow({
    width: 700,
    height: 430,
    minWidth: 560,
    minHeight: 340,
    title: "人工智能",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "ai-manager" });

  showWhenReady(window);

  return window;
}

function createTagTranslationWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find(
    (window) => window.getTitle() === "标签翻译" && !window.isDestroyed(),
  );

  if (existing) {
    existing.show();
    existing.focus();
    return existing;
  }

  const window = createAsteriaWindow({
    width: 720,
    height: 220,
    minWidth: 560,
    minHeight: 190,
    title: "标签翻译",
    autoHideMenuBar: true,
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "tag-translation" });

  showWhenReady(window);

  return window;
}

function createFavoritesWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: "我的收藏",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "favorites" });

  showWhenReady(window);

  return window;
}

function createUrlManagerWindow(fileIds: number[]): BrowserWindow {
  const window = createAsteriaWindow({
    width: 760,
    height: 520,
    minWidth: 560,
    minHeight: 360,
    title: "管理URL",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "url-manager", ids: fileIds.join(",") });

  showWhenReady(window);

  return window;
}

function createBatchTagManagerWindow(fileIds: number[]): BrowserWindow {
  const window = createAsteriaWindow({
    width: 760,
    height: 560,
    minWidth: 560,
    minHeight: 380,
    title: "管理标签",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "batch-tag-manager", ids: fileIds.join(",") });

  showWhenReady(window);

  return window;
}

function createExportWindow(fileIds: number[]): BrowserWindow {
  const window = createAsteriaWindow({
    width: 620,
    height: 430,
    minWidth: 480,
    minHeight: 320,
    title: "导出",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "export", ids: fileIds.join(",") });

  showWhenReady(window);

  return window;
}

function createFileRatingEditorWindow(
  fileIds: number[],
  groupId: number,
): BrowserWindow {
  const group = listRatingGroups().find((item) => item.id === groupId);
  const window = createAsteriaWindow({
    width: 420,
    height: 360,
    minWidth: 320,
    minHeight: 240,
    title: group ? `设置:${group.name}` : "设置分级",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, {
    window: "file-rating-editor",
    ids: fileIds.join(","),
    groupId: String(groupId),
  });

  showWhenReady(window);

  return window;
}

function createScreeningWindow(fileIds: number[]): BrowserWindow {
  const window = createAsteriaWindow({
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: "筛选入库",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "screening", ids: fileIds.join(",") });

  showWhenReady(window);

  return window;
}

function createFileDetailWindow(
  id: number,
  sequenceIds?: number[],
): BrowserWindow {
  const existingWindow = fileDetailWindows.get(id);

  if (existingWindow && !existingWindow.isDestroyed()) {
    setFileDetailSequence(existingWindow, id, sequenceIds);

    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }

    existingWindow.show();
    existingWindow.focus();
    existingWindow.webContents.send("file-detail:reset", id);
    return existingWindow;
  }

  const window = createAsteriaWindow({
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: "文件详情",
    show: false,
  });

  setupWindowDiagnostics(window);
  const webContentsId = window.webContents.id;
  fileDetailWindows.set(id, window);
  setFileDetailSequence(window, id, sequenceIds);
  loadRenderer(window, { window: "file-detail", id: String(id) });

  showWhenReady(window);

  window.once("closed", () => {
    fileDetailSequences.delete(webContentsId);

    if (fileDetailWindows.get(id) === window) {
      fileDetailWindows.delete(id);
    }
  });

  return window;
}

function setFileDetailSequence(
  window: BrowserWindow,
  fileId: number,
  sequenceIds?: number[],
): void {
  const normalizedSequence = normalizeIpcFileIds(sequenceIds);

  if (normalizedSequence.includes(fileId)) {
    fileDetailSequences.set(window.webContents.id, normalizedSequence);
    return;
  }

  fileDetailSequences.delete(window.webContents.id);
}

function createSettingsWindow(): BrowserWindow {
  const window = createAsteriaWindow({
    width: 820,
    height: 520,
    minWidth: 640,
    minHeight: 420,
    title: "设置",
    show: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "settings" });

  showWhenReady(window);

  return window;
}

function createGenericDialogWindow(
  state: GenericDialogState,
  parent?: BrowserWindow | null,
): BrowserWindow {
  const parentOptions = parent ? { parent } : {};
  const window = createAsteriaWindow({
    width: state.kind === "progress" ? 460 : 560,
    height: state.kind === "progress" ? 170 : 210,
    minWidth: 360,
    minHeight: 150,
    title: state.title,
    show: false,
    ...parentOptions,
    modal: false,
    minimizable: false,
    maximizable: false,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: "dialog", dialogId: state.id });

  showWhenReady(window);

  window.once("closed", () => {
    const request = genericDialogs.get(state.id);

    if (!request) {
      return;
    }

    request.window = null;

    if (
      (state.kind === "confirm" || state.kind === "alert") &&
      request.resolve
    ) {
      request.resolve(false);
      genericDialogs.delete(state.id);
    }
  });

  return window;
}

function setupWindowDiagnostics(window: BrowserWindow): void {
  const configuredTitle = window.getTitle();
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(configuredTitle);
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        "Renderer failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
    },
  );

  if (!app.isPackaged && process.env.ASTERIA_RENDERER_LOGS === "1") {
    window.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        console.log(
          `Renderer console [${level}] ${sourceId}:${line} ${message}`,
        );
      },
    );
  }

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details.reason, details.exitCode);
  });
}

function confirmMainWindowClose(window: BrowserWindow): void {
  window.on("close", (event) => {
    if (mainCloseConfirmed) {
      return;
    }

    event.preventDefault();

    if (mainCloseConfirmOpen) {
      return;
    }

    mainCloseConfirmOpen = true;
    const childWindows = listChildWindows(window);
    const message = buildMainCloseConfirmMessage(childWindows);

    void openConfirmDialog(
      {
        title: "确认退出",
        message,
        confirmText: "退出",
        cancelText: "取消",
      },
      window,
    )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        mainCloseConfirmed = true;
        closeChildWindows(childWindows);
        window.close();
      })
      .finally(() => {
        mainCloseConfirmOpen = false;
      });
  });
}

function listChildWindows(mainWindow: BrowserWindow): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(
    (candidate) => candidate.id !== mainWindow.id && !candidate.isDestroyed(),
  );
}

function closeChildWindows(childWindows: BrowserWindow[]): void {
  for (const childWindow of childWindows) {
    if (!childWindow.isDestroyed()) {
      childWindow.close();
    }
  }
}

function buildMainCloseConfirmMessage(childWindows: BrowserWindow[]): string {
  const tasks = [
    ...formatChildWindowTasks(childWindows),
    ...formatActiveWorkStatusTask(),
  ];

  if (tasks.length === 0) {
    return "确认退出吗";
  }

  return `确认退出吗？任务正在执行：\n${tasks.map((task) => `- ${task}`).join("\n")}`;
}

function formatChildWindowTasks(childWindows: BrowserWindow[]): string[] {
  const titleCounts = new Map<string, number>();

  for (const childWindow of childWindows) {
    const title = childWindow.getTitle().trim() || "未命名窗口";
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  return [...titleCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([title, count]) => `子窗口：${title}${count > 1 ? ` × ${count}` : ""}`,
    );
}

function formatActiveWorkStatusTask(): string[] {
  const status = getCombinedWorkStatus();

  if (!status.active) {
    return [];
  }

  return [
    `${status.message} 队列 ${status.queued} 处理中 ${status.processing} 已完成 ${status.completed}`,
  ];
}

function loadRenderer(
  window: BrowserWindow,
  query?: Record<string, string>,
): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (!app.isPackaged && rendererUrl) {
    const url = new URL(rendererUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    window.loadURL(url.toString());
  } else {
    window.loadFile(
      join(__dirname, "../renderer/index.html"),
      query ? { query } : undefined,
    );
  }
}

function isTagDraft(value: unknown): value is TagDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Partial<TagDraft>;

  return (
    (draft.id === undefined || typeof draft.id === "number") &&
    typeof draft.namespace === "string" &&
    typeof draft.name === "string"
  );
}

function normalizeIpcFileIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<number>();
  const fileIds: number[] = [];

  for (const fileId of value) {
    if (
      typeof fileId !== "number" ||
      !Number.isInteger(fileId) ||
      fileId <= 0 ||
      seen.has(fileId)
    ) {
      continue;
    }

    seen.add(fileId);
    fileIds.push(fileId);
  }

  return fileIds;
}

function normalizeConfirmDialogOptions(value: unknown): ConfirmDialogOptions {
  const options = value as Partial<ConfirmDialogOptions> | null;
  const message =
    typeof options?.message === "string" ? options.message.trim() : "";

  if (!message) {
    throw new Error("dialog message required");
  }

  return {
    title:
      typeof options?.title === "string" && options.title.trim()
        ? options.title.trim()
        : "确认",
    message,
    confirmText:
      typeof options?.confirmText === "string" && options.confirmText.trim()
        ? options.confirmText.trim()
        : "确认",
    cancelText:
      typeof options?.cancelText === "string" && options.cancelText.trim()
        ? options.cancelText.trim()
        : "取消",
  };
}

function normalizeHydrusImportOptions(value: unknown): HydrusImportOptions {
  const options = value as Partial<HydrusImportOptions> | null;

  return {
    baseUrl:
      typeof options?.baseUrl === "string"
        ? options.baseUrl
        : "http://127.0.0.1:45869",
    accessKey: typeof options?.accessKey === "string" ? options.accessKey : "",
    searchTags: Array.isArray(options?.searchTags)
      ? options.searchTags.filter(
          (tag): tag is string => typeof tag === "string",
        )
      : [],
    tagStyleName:
      typeof options?.tagStyleName === "string"
        ? options.tagStyleName
        : "hydrus",
    limit: typeof options?.limit === "number" ? options.limit : 0,
    metadataBatchSize:
      typeof options?.metadataBatchSize === "number"
        ? options.metadataBatchSize
        : 100,
    forceDuplicate: options?.forceDuplicate === true,
  };
}

function normalizeEHentaiImportOptions(value: unknown): EHentaiImportOptions {
  const options = value as Partial<EHentaiImportOptions> | null;

  return {
    galleryUrl:
      typeof options?.galleryUrl === "string" ? options.galleryUrl : "",
    cookie: typeof options?.cookie === "string" ? options.cookie : "",
    importGalleryTags: options?.importGalleryTags !== false,
    forceDuplicate: options?.forceDuplicate === true,
    requestDelayMs: 10_000,
    requestTimeoutMs:
      typeof options?.requestTimeoutMs === "number"
        ? options.requestTimeoutMs
        : 45_000,
    startIndex:
      typeof options?.startIndex === "number" ? options.startIndex : 1,
    limit: typeof options?.limit === "number" ? options.limit : 0,
  };
}

function normalizeAiSettings(value: unknown): AiSettings {
  const settings = value as Partial<AiSettings> | null;

  return {
    modelPath:
      typeof settings?.modelPath === "string" ? settings.modelPath.trim() : "",
    modelName:
      typeof settings?.modelName === "string" ? settings.modelName.trim() : "",
    generalThreshold: normalizeAiThreshold(settings?.generalThreshold, 0.35),
    characterThreshold: normalizeAiThreshold(
      settings?.characterThreshold,
      0.75,
    ),
    autoTagUntaggedImagesOnImport:
      settings?.autoTagUntaggedImagesOnImport === true,
    enableImageRetagContextMenu: settings?.enableImageRetagContextMenu === true,
    enableImageAppendTagContextMenu:
      settings?.enableImageAppendTagContextMenu === true,
  };
}

function normalizeAiThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeNetworkSettings(value: unknown): NetworkSettings {
  const settings = value as Partial<NetworkSettings> | null;
  const port = Number(settings?.proxyPort);

  return {
    proxyEnabled: settings?.proxyEnabled === true,
    proxyHost:
      typeof settings?.proxyHost === "string"
        ? normalizeProxyHost(settings.proxyHost)
        : "",
    proxyPort:
      Number.isInteger(port) && port > 0 && port <= 65535 ? port : 7890,
  };
}

function normalizeTagTranslationSettings(
  value: unknown,
): TagTranslationSettings {
  const settings = value as Partial<TagTranslationSettings> | null;

  return {
    csvPath:
      typeof settings?.csvPath === "string" ? settings.csvPath.trim() : "",
    keepOriginalTags: settings?.keepOriginalTags !== false,
    enableContextMenuTranslation:
      settings?.enableContextMenuTranslation === true,
    translateOnTagCreate: settings?.translateOnTagCreate === true,
  };
}

function normalizeProxyHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}

function buildAiTaggingMessage(result: AiTaggingSummary): string {
  const lines = [
    `总数: ${result.total}`,
    `已打标: ${result.tagged}`,
    `已跳过: ${result.skipped}`,
    `失败: ${result.failed}`,
  ];

  const firstFailure = result.failures[0];

  if (firstFailure) {
    lines.push(`首个失败: #${firstFailure.fileId} ${firstFailure.message}`);
  }

  return lines.join("\n");
}

function openConfirmDialog(
  options: ConfirmDialogOptions,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  const id = createGenericDialogId();
  const state: GenericDialogState = {
    id,
    kind: "confirm",
    title: options.title ?? "确认",
    message: options.message,
    confirmText: options.confirmText ?? "确认",
    cancelText: options.cancelText ?? "取消",
    progress: null,
  };

  return new Promise((resolveDialog) => {
    const window = createGenericDialogWindow(state, parent);
    genericDialogs.set(id, {
      state,
      window,
      resolve: resolveDialog,
    });
  });
}

function openAlertDialog(
  options: ConfirmDialogOptions,
  parent?: BrowserWindow | null,
): Promise<void> {
  const id = createGenericDialogId();
  const state: GenericDialogState = {
    id,
    kind: "alert",
    title: options.title ?? "提示",
    message: options.message,
    confirmText: options.confirmText ?? "确定",
    cancelText: options.cancelText ?? "取消",
    progress: null,
  };

  return new Promise((resolveDialog) => {
    const window = createGenericDialogWindow(state, parent);
    genericDialogs.set(id, {
      state,
      window,
      resolve: () => resolveDialog(),
    });
  });
}

function openProgressDialog(
  progress: OperationProgress,
  parent?: BrowserWindow | null,
): string {
  const id = createGenericDialogId();
  const state: GenericDialogState = {
    id,
    kind: "progress",
    title: progress.title,
    message: progress.message,
    confirmText: "确定",
    cancelText: "取消",
    progress,
  };
  const window = createGenericDialogWindow(state, parent);
  genericDialogs.set(id, { state, window });

  return id;
}

function updateProgressDialog(id: string, progress: OperationProgress): void {
  const request = genericDialogs.get(id);

  if (!request) {
    return;
  }

  request.state = {
    ...request.state,
    title: progress.title,
    message: progress.message,
    progress,
  };

  request.window?.webContents.send("dialog:state-changed", request.state);

  if (progress.completed) {
    setTimeout(() => closeGenericDialog(id), 400);
  }
}

function resizeGenericDialog(id: string, width: number, height: number): void {
  const request = genericDialogs.get(id);

  if (!request?.window || request.window.isDestroyed()) {
    return;
  }

  const nextWidth = Math.min(900, Math.max(280, Math.ceil(width)));
  const nextHeight = Math.min(560, Math.max(90, Math.ceil(height)));
  request.window.setContentSize(nextWidth, nextHeight);
}

function resolveGenericDialog(id: string, confirmed: boolean): void {
  const request = genericDialogs.get(id);

  if (!request) {
    return;
  }

  request.resolve?.(confirmed);
  genericDialogs.delete(id);
  request.window?.close();
}

function closeGenericDialog(id: string): void {
  const request = genericDialogs.get(id);

  if (!request) {
    return;
  }

  genericDialogs.delete(id);
  request.window?.close();
}

function createGenericDialogId(): string {
  const id = `dialog-${genericDialogCounter}`;
  genericDialogCounter += 1;
  return id;
}

async function chooseDirectory(title: string): Promise<string | null> {
  const selection = await dialog.showOpenDialog({
    title,
    properties: ["openDirectory", "createDirectory"],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  return selection.filePaths[0] ?? null;
}

async function chooseStorageDirectory(): Promise<string | null> {
  return chooseDirectory("选择文件存储位置");
}

async function chooseExportDirectory(): Promise<string | null> {
  return chooseDirectory("选择导出路径");
}

async function chooseAiModelDirectory(): Promise<string | null> {
  return chooseDirectory("选择模型路径");
}

async function chooseTagTranslationCsv(): Promise<string | null> {
  const selection = await dialog.showOpenDialog({
    title: "选择标签翻译 CSV",
    properties: ["openFile"],
    filters: [
      { name: "CSV", extensions: ["csv"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  return selection.filePaths[0] ?? null;
}

function isExportOptions(value: unknown): value is ExportOptions {
  const options = value as Partial<ExportOptions> | null;

  return Boolean(
    options &&
    typeof options.jobId === "string" &&
    Array.isArray(options.fileIds) &&
    typeof options.directory === "string" &&
    typeof options.filenameFormat === "string",
  );
}

function isApiServiceDraft(value: unknown): value is ApiServiceDraft {
  const draft = value as Partial<ApiServiceDraft> | null;

  return Boolean(
    draft &&
    typeof draft.name === "string" &&
    typeof draft.address === "string" &&
    typeof draft.port === "number" &&
    typeof draft.token === "string" &&
    typeof draft.enabled === "boolean" &&
    Array.isArray(draft.permissions),
  );
}

async function updateStoragePathWithMigration(
  sender: Electron.WebContents,
  nextPath: string,
): Promise<StorageSettings> {
  const normalizedNextPath = nextPath.trim();

  if (!normalizedNextPath) {
    throw new Error("路径不能为空");
  }

  const currentSettings = getStorageSettings();

  if (
    resolve(currentSettings.fileStoragePath) === resolve(normalizedNextPath)
  ) {
    return currentSettings;
  }

  await mkdir(normalizedNextPath, { recursive: true });

  const files = listFilesForStorageMigration();
  const total = files.length;
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const progressDialogId = openProgressDialog(
    {
      title: "正在迁移",
      total,
      processed: 0,
      message: "正在迁移",
      completed: false,
    },
    parentWindow,
  );
  const result = createStorageMigrationResult();

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      if (file) {
        result[await migrateOneStoredFile(file, normalizedNextPath)] += 1;
      }

      updateProgressDialog(progressDialogId, {
        title: "正在迁移",
        total,
        processed: index + 1,
        message: buildStorageMigrationProgressMessage(result),
        completed: false,
      });
    }

    const settings = setFileStoragePath(normalizedNextPath);
    await clearDirectoryContents(
      currentSettings.fileStoragePath,
      normalizedNextPath,
    );

    updateProgressDialog(progressDialogId, {
      title: "正在迁移",
      total,
      processed: total,
      message: buildStorageMigrationCompleteMessage(result),
      completed: true,
    });

    return settings;
  } catch (error) {
    updateProgressDialog(progressDialogId, {
      title: "正在迁移",
      total,
      processed: total,
      message: error instanceof Error ? error.message : "迁移失败",
      completed: true,
    });
    throw error;
  }
}

async function updateThumbnailStoragePathWithMigration(
  sender: Electron.WebContents,
  nextPath: string,
): Promise<StorageSettings> {
  const normalizedNextPath = nextPath.trim();

  if (!normalizedNextPath) {
    throw new Error("路径不能为空");
  }

  const currentSettings = getStorageSettings();

  if (
    resolve(currentSettings.thumbnailStoragePath) ===
    resolve(normalizedNextPath)
  ) {
    return currentSettings;
  }

  await mkdir(normalizedNextPath, { recursive: true });

  const parentWindow = BrowserWindow.fromWebContents(sender);
  const progressDialogId = openProgressDialog(
    {
      title: "正在迁移",
      total: 1,
      processed: 0,
      message: "正在迁移缩略图缓存",
      completed: false,
    },
    parentWindow,
  );

  try {
    const sourceExists = await directoryExists(
      currentSettings.thumbnailStoragePath,
    );

    if (sourceExists) {
      await cp(currentSettings.thumbnailStoragePath, normalizedNextPath, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    }

    const settings = setThumbnailStoragePath(normalizedNextPath);
    await clearDirectoryContents(
      currentSettings.thumbnailStoragePath,
      normalizedNextPath,
    );

    updateProgressDialog(progressDialogId, {
      title: "正在迁移",
      total: 1,
      processed: 1,
      message: sourceExists
        ? "缩略图缓存迁移完成"
        : "原缩略图缓存缺失，已使用新位置",
      completed: true,
    });

    return settings;
  } catch (error) {
    updateProgressDialog(progressDialogId, {
      title: "正在迁移",
      total: 1,
      processed: 1,
      message: error instanceof Error ? error.message : "缩略图缓存迁移失败",
      completed: true,
    });
    throw error;
  }
}

async function listPageLayoutConfigs(): Promise<PageLayoutConfigRecord[]> {
  const directory = await ensurePageLayoutDirectory();
  const settings = getPageLayoutSettings();
  const entries = await readdir(directory, { withFileTypes: true });
  const configs: PageLayoutConfigRecord[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(PAGE_LAYOUT_FILE_EXTENSION)) {
      continue;
    }

    const id = basename(entry.name, PAGE_LAYOUT_FILE_EXTENSION);
    const path = join(directory, entry.name);
    const fileStat = await stat(path);

    configs.push({
      id,
      name: id,
      path,
      isDefault: settings.defaultConfigId === id,
      isNewPage: settings.newPageConfigId === id,
      updatedAt: fileStat.mtime.toISOString(),
    });
  }

  return configs.sort((left, right) => left.name.localeCompare(right.name));
}

function getPageLayoutSettings(): PageLayoutSettings {
  return {
    defaultConfigId: getAppSetting(PAGE_LAYOUT_DEFAULT_SETTING_KEY),
    newPageConfigId: getAppSetting(PAGE_LAYOUT_NEW_PAGE_SETTING_KEY),
  };
}

async function getPageLayoutTemplate(
  kind: "default" | "newPage",
): Promise<string> {
  const settings = getPageLayoutSettings();
  const configId =
    kind === "newPage" ? settings.newPageConfigId : settings.defaultConfigId;

  if (configId) {
    const configPath = await resolvePageLayoutConfigPath(configId);

    if (configPath) {
      return readFile(configPath, "utf8");
    }
  }

  return readBundledPageLayoutTemplate();
}

async function savePageLayoutConfig(
  name: string,
  layoutJson: string,
): Promise<PageLayoutConfigRecord[]> {
  JSON.parse(layoutJson);

  const directory = await ensurePageLayoutDirectory();
  const id = await createUniqueLayoutConfigId(name);
  await writeFile(
    join(directory, `${id}${PAGE_LAYOUT_FILE_EXTENSION}`),
    layoutJson,
    "utf8",
  );

  return listPageLayoutConfigs();
}

async function createPageLayoutConfig(): Promise<PageLayoutConfigRecord[]> {
  const directory = await ensurePageLayoutDirectory();
  const id = await createUniqueLayoutConfigId("布局配置");
  const path = join(directory, `${id}${PAGE_LAYOUT_FILE_EXTENSION}`);
  await writeFile(path, await readBundledPageLayoutTemplate(), "utf8");
  await shell.openPath(path);

  return listPageLayoutConfigs();
}

async function renamePageLayoutConfig(
  id: string,
  name: string,
): Promise<PageLayoutConfigRecord[]> {
  const sourcePath = await requirePageLayoutConfigPath(id);
  const nextId = await createUniqueLayoutConfigId(name);
  await rename(
    sourcePath,
    join(
      await ensurePageLayoutDirectory(),
      `${nextId}${PAGE_LAYOUT_FILE_EXTENSION}`,
    ),
  );

  const settings = getPageLayoutSettings();

  if (settings.defaultConfigId === id) {
    setAppSetting(PAGE_LAYOUT_DEFAULT_SETTING_KEY, nextId);
  }

  if (settings.newPageConfigId === id) {
    setAppSetting(PAGE_LAYOUT_NEW_PAGE_SETTING_KEY, nextId);
  }

  return listPageLayoutConfigs();
}

async function deletePageLayoutConfig(
  id: string,
): Promise<PageLayoutConfigRecord[]> {
  const path = await requirePageLayoutConfigPath(id);
  await unlink(path);

  const settings = getPageLayoutSettings();

  if (settings.defaultConfigId === id) {
    deleteAppSetting(PAGE_LAYOUT_DEFAULT_SETTING_KEY);
  }

  if (settings.newPageConfigId === id) {
    deleteAppSetting(PAGE_LAYOUT_NEW_PAGE_SETTING_KEY);
  }

  return listPageLayoutConfigs();
}

async function openPageLayoutConfig(id: string): Promise<void> {
  const path = await requirePageLayoutConfigPath(id);
  const errorMessage = await shell.openPath(path);

  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

async function setPageLayoutSetting(
  key: string,
  id: string | null,
): Promise<PageLayoutSettings> {
  if (!id) {
    deleteAppSetting(key);
    return getPageLayoutSettings();
  }

  await requirePageLayoutConfigPath(id);
  setAppSetting(key, id);
  return getPageLayoutSettings();
}

async function ensurePageLayoutDirectory(): Promise<string> {
  const directory = join(app.getPath("userData"), "page-layouts");
  await mkdir(directory, { recursive: true });
  return directory;
}

async function resolvePageLayoutConfigPath(id: string): Promise<string | null> {
  if (!isSafeLayoutConfigId(id)) {
    return null;
  }

  const path = join(
    await ensurePageLayoutDirectory(),
    `${id}${PAGE_LAYOUT_FILE_EXTENSION}`,
  );

  try {
    const fileStat = await stat(path);
    return fileStat.isFile() ? path : null;
  } catch {
    return null;
  }
}

async function requirePageLayoutConfigPath(id: string): Promise<string> {
  const path = await resolvePageLayoutConfigPath(id);

  if (!path) {
    throw new Error("页面配置不存在");
  }

  return path;
}

async function createUniqueLayoutConfigId(name: string): Promise<string> {
  const directory = await ensurePageLayoutDirectory();
  const baseName = sanitizeLayoutConfigName(name) || "layout";
  let id = baseName;
  let index = 1;

  while (
    await pathExists(join(directory, `${id}${PAGE_LAYOUT_FILE_EXTENSION}`))
  ) {
    index += 1;
    id = `${baseName}-${index}`;
  }

  return id;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeLayoutConfigName(name: string): string {
  const normalizedName = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  return (
    normalizedName ||
    `布局配置-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
}

function isSafeLayoutConfigId(id: string): boolean {
  return /^[^<>:"/\\|?*\u0000-\u001f]+$/.test(id) && id !== "." && id !== "..";
}

async function readBundledPageLayoutTemplate(): Promise<string> {
  const candidates = [
    join(app.getAppPath(), "config/page-templates/default-page.jsonc"),
    join(process.cwd(), "config/page-templates/default-page.jsonc"),
  ];

  for (const path of candidates) {
    try {
      return await readFile(path, "utf8");
    } catch {
      continue;
    }
  }

  return JSON.stringify(
    {
      global: {
        tabEnableClose: true,
        tabEnableRename: false,
        tabSetEnableMaximize: false,
        splitterSize: 4,
        tabSetTabStripHeight: 26,
        tabSetHeaderHeight: 0,
      },
      borders: [],
      layout: {
        type: "row",
        id: "page-default",
        weight: 100,
        children: [
          {
            type: "tabset",
            id: "main-tabset",
            weight: 100,
            children: [
              {
                type: "tab",
                id: "view-placeholder",
                name: "空页面",
                component: "empty-page",
                enableClose: false,
                enableDrag: false,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  );
}

async function migrateOneStoredFile(
  file: DatabaseFileRecord,
  targetDirectory: string,
): Promise<StorageMigrationOutcome> {
  const sourcePath = file.storagePath ?? file.originalPath;
  const targetFileName = buildStoredFileName(file.sha256, file.extension);
  const targetPath = join(targetDirectory, targetFileName);

  if (resolve(sourcePath) === resolve(targetPath)) {
    updateFileStorageRecordPath(file.id, targetPath, targetFileName);
    return "alreadyCurrent";
  }

  if (!(await fileExists(sourcePath))) {
    if (await fileExists(targetPath)) {
      updateFileStorageRecordPath(file.id, targetPath, targetFileName);
      return "adopted";
    }

    return "missing";
  }

  if (!(await fileExists(targetPath))) {
    await copyFile(sourcePath, targetPath);
  }

  updateFileStorageRecordPath(file.id, targetPath, targetFileName);

  if (file.storagePath && !hasStoredPathReference(file.storagePath)) {
    await deleteIfStillExists(file.storagePath);
  }

  return "migrated";
}

function createStorageMigrationResult(): StorageMigrationResult {
  return {
    migrated: 0,
    adopted: 0,
    alreadyCurrent: 0,
    missing: 0,
  };
}

function buildStorageMigrationProgressMessage(
  result: StorageMigrationResult,
): string {
  return (
    [
      result.migrated > 0 ? `已迁移 ${result.migrated}` : "",
      result.adopted > 0 ? `已接管 ${result.adopted}` : "",
      result.alreadyCurrent > 0 ? `已在目标位置 ${result.alreadyCurrent}` : "",
      result.missing > 0 ? `缺失 ${result.missing}` : "",
    ]
      .filter(Boolean)
      .join("，") || "正在迁移"
  );
}

function buildStorageMigrationCompleteMessage(
  result: StorageMigrationResult,
): string {
  const message = buildStorageMigrationProgressMessage(result);
  return message === "正在迁移" ? "迁移完成" : `迁移完成：${message}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const directoryStat = await stat(directoryPath);
    return directoryStat.isDirectory();
  } catch {
    return false;
  }
}

async function deleteIfStillExists(filePath: string): Promise<void> {
  try {
    const fileStat = await stat(filePath);

    if (fileStat.isFile()) {
      await unlink(filePath);
    }
  } catch {
    return;
  }
}

async function clearDirectoryContents(
  directoryPath: string,
  protectedPath: string,
): Promise<void> {
  const sourceDirectory = resolve(directoryPath);
  const protectedDirectory = resolve(protectedPath);

  if (
    sourceDirectory === protectedDirectory ||
    isPathInsideDirectory(protectedDirectory, sourceDirectory)
  ) {
    return;
  }

  try {
    const directoryStat = await stat(sourceDirectory);

    if (!directoryStat.isDirectory()) {
      return;
    }

    const entries = await readdir(sourceDirectory);

    for (const entry of entries) {
      await rm(join(sourceDirectory, entry), { recursive: true, force: true });
    }
  } catch {
    return;
  }
}

function isPathInsideDirectory(
  candidatePath: string,
  directoryPath: string,
): boolean {
  const normalizedCandidate = normalizeResolvedPath(candidatePath);
  const normalizedDirectory = normalizeResolvedPath(directoryPath);

  return normalizedCandidate.startsWith(`${normalizedDirectory}\\`);
}

function normalizeResolvedPath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

async function openStoredFileExternally(fileId: number): Promise<void> {
  const filePath = getFileOriginalPath(fileId);

  if (!filePath) {
    throw new Error("文件不存在");
  }

  const errorMessage = await shell.openPath(filePath);

  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

async function deleteStoredFilesPermanently(fileIds: number[]): Promise<void> {
  const deletedFiles = deleteFilesPermanentlyFromDatabase(fileIds);
  const checkedStoragePaths = new Set<string>();

  for (const file of deletedFiles) {
    if (
      file.storagePath &&
      !checkedStoragePaths.has(file.storagePath) &&
      !hasStoredFileReference(file.sha256)
    ) {
      checkedStoragePaths.add(file.storagePath);
      await deleteIfStillExists(file.storagePath);
      await deleteThumbnailForSha(file.sha256);
    }
  }
}

function broadcastFilesChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("files:changed");
    }
  }
}

function broadcastFileFavoriteChanged(fileId: number, favorite: boolean): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("file:favorite-changed", fileId, favorite);
    }
  }
}

function broadcastPageLayoutChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("page-layout:changed");
    }
  }
}

function broadcastImportQueueChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("import-queue:changed");
    }
  }
}

function getCombinedWorkStatus(): WorkStatus {
  const imageConversionStatus = getImageConversionWorkStatus();

  if (imageConversionStatus.active) {
    return imageConversionStatus;
  }

  const aiStatus = getAiTaggingWorkStatus();

  if (aiStatus.active) {
    return aiStatus;
  }

  if (tagTranslationWorkStatus.active) {
    return tagTranslationWorkStatus;
  }

  return getThumbnailWorkStatus();
}

function broadcastCombinedWorkStatus(): void {
  broadcastWorkStatus(getCombinedWorkStatus());
}

function broadcastWorkStatus(status: WorkStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("work-status:changed", status);
    }
  }
}

let tagTranslationWorkStatus: WorkStatus = createIdleTagTranslationWorkStatus();

function beginTagTranslationWorkStatus(total: number): void {
  if (total <= 0) {
    return;
  }

  updateTagTranslationWorkStatus(0, total);
}

function updateTagTranslationWorkStatus(
  completed: number,
  total: number,
): void {
  tagTranslationWorkStatus = {
    active: completed < total,
    message: completed < total ? "正在翻译标签" : "标签翻译完成",
    queued: Math.max(0, total - completed),
    processing: completed < total ? 1 : 0,
    completed,
  };
  broadcastCombinedWorkStatus();
}

function finishTagTranslationWorkStatus(): void {
  tagTranslationWorkStatus = createIdleTagTranslationWorkStatus();
  broadcastCombinedWorkStatus();
}

function createIdleTagTranslationWorkStatus(): WorkStatus {
  return {
    active: false,
    message: "标签翻译空闲",
    queued: 0,
    processing: 0,
    completed: 0,
  };
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  try {
    initializeDatabase();
  } catch (error) {
    console.error("Failed to initialize database:", error);

    dialog.showErrorBox(
      "数据库初始化失败",
      error instanceof Error ? error.message : "未知数据库错误",
    );
    app.quit();
    return;
  }

  await applyNetworkSettings(getNetworkSettings());
  setApiFilesChangedHandler(broadcastFilesChanged);
  await clearStaleApiUploadBatches();
  await syncApiServers();
  setThumbnailStatusListener(broadcastCombinedWorkStatus);
  setAiTaggingStatusListener(broadcastCombinedWorkStatus);
  setImageConversionStatusListener(broadcastCombinedWorkStatus);
  queueAllMissingThumbnails("low");

  protocol.handle("asteria-media", async (request) => {
    const url = new URL(request.url);
    const kind = url.hostname || "file";
    const id = Number(url.pathname.slice(1));
    const expectedSha256 = url.searchParams.get("v");

    if (!Number.isInteger(id) || id <= 0) {
      return new Response("Invalid media id", { status: 400 });
    }

    const filePath =
      kind === "import"
        ? getImportQueueFilePath(id)
        : kind === "thumbnail"
          ? ((await ensureThumbnailForFile(id, expectedSha256)) ??
            getThumbnailFallbackPath(id, expectedSha256))
          : getFileOriginalPath(id);

    if (!filePath) {
      if (kind === "thumbnail") {
        return new Response(
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#202428"/><path d="M92 72v112l88-56z" fill="#68727a"/></svg>',
          {
            headers: {
              "content-type": "image/svg+xml",
            },
          },
        );
      }

      return new Response("Media file not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("dialog:confirm", (event, options: unknown) =>
    openConfirmDialog(
      normalizeConfirmDialogOptions(options),
      BrowserWindow.fromWebContents(event.sender),
    ),
  );
  ipcMain.handle("dialog:get-state", (_event, dialogId: unknown) => {
    if (typeof dialogId !== "string") {
      return null;
    }

    return genericDialogs.get(dialogId)?.state ?? null;
  });
  ipcMain.handle(
    "dialog:resize",
    (_event, dialogId: unknown, width: unknown, height: unknown) => {
      if (
        typeof dialogId === "string" &&
        typeof width === "number" &&
        typeof height === "number"
      ) {
        resizeGenericDialog(dialogId, width, height);
      }
    },
  );
  ipcMain.handle(
    "dialog:resolve",
    (_event, dialogId: unknown, confirmed: unknown) => {
      if (typeof dialogId === "string") {
        resolveGenericDialog(dialogId, confirmed === true);
      }
    },
  );
  ipcMain.handle("theme:set-native", (_event, theme: unknown) => {
    nativeTheme.themeSource = theme === "light" ? "light" : "dark";
  });
  ipcMain.handle("database:get-status", () => getDatabaseStatus());
  ipcMain.handle("database:list-files", (_event, page: unknown) =>
    listDatabaseFiles(typeof page === "number" ? page : 1),
  );
  ipcMain.handle("browser:list-files", () => listBrowserFiles());
  ipcMain.handle("browser:search-files", (_event, query: unknown) =>
    searchBrowserFiles(typeof query === "string" ? query : ""),
  );
  ipcMain.handle("browser:list-favorites", () => listFavoriteFiles());
  ipcMain.handle(
    "file:set-favorite",
    (_event, fileId: unknown, favorite: unknown) => {
      if (typeof fileId !== "number" || typeof favorite !== "boolean") {
        throw new Error("收藏参数无效");
      }

      setFileFavorite(fileId, favorite);
      broadcastFileFavoriteChanged(fileId, favorite);
    },
  );
  ipcMain.handle("window:open-database-manager", () => {
    createDatabaseManagerWindow();
  });
  ipcMain.handle("window:open-tag-manager", () => {
    createTagManagerWindow();
  });
  ipcMain.handle("window:open-recycle-bin", () => {
    createRecycleBinWindow();
  });
  ipcMain.handle("window:open-rating-manager", () => {
    createRatingManagerWindow();
  });
  ipcMain.handle("window:open-api-manager", () => {
    createApiManagerWindow();
  });
  ipcMain.handle("window:open-hydrus-import", () => {
    createHydrusImportWindow();
  });
  ipcMain.handle("window:open-ehentai-import", () => {
    createEHentaiImportWindow();
  });
  ipcMain.handle("window:open-ai-manager", () => {
    createAiManagerWindow();
  });
  ipcMain.handle("window:open-tag-translation", () => {
    createTagTranslationWindow();
  });
  ipcMain.handle("window:open-favorites", () => {
    createFavoritesWindow();
  });
  ipcMain.handle("window:open-url-manager", (_event, fileIds: unknown) => {
    const normalizedFileIds = normalizeIpcFileIds(fileIds);

    if (normalizedFileIds.length > 0) {
      createUrlManagerWindow(normalizedFileIds);
    }
  });
  ipcMain.handle(
    "window:open-batch-tag-manager",
    (_event, fileIds: unknown) => {
      const normalizedFileIds = normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length > 0) {
        createBatchTagManagerWindow(normalizedFileIds);
      }
    },
  );
  ipcMain.handle("window:open-export", (_event, fileIds: unknown) => {
    const normalizedFileIds = normalizeIpcFileIds(fileIds);

    if (normalizedFileIds.length > 0) {
      createExportWindow(normalizedFileIds);
    }
  });
  ipcMain.handle(
    "window:open-file-rating-editor",
    (_event, fileIds: unknown, groupId: unknown) => {
      const normalizedFileIds = normalizeIpcFileIds(fileIds);

      if (
        normalizedFileIds.length > 0 &&
        typeof groupId === "number" &&
        Number.isInteger(groupId) &&
        groupId > 0
      ) {
        createFileRatingEditorWindow(normalizedFileIds, groupId);
      }
    },
  );
  ipcMain.handle("window:open-screening", (_event, fileIds: unknown) => {
    const normalizedFileIds = normalizeIpcFileIds(fileIds);

    if (normalizedFileIds.length > 0) {
      createScreeningWindow(normalizedFileIds);
    }
  });
  ipcMain.handle(
    "window:open-file-detail",
    (_event, id: unknown, sequenceIds: unknown) => {
      if (typeof id === "number" && Number.isInteger(id) && id > 0) {
        createFileDetailWindow(id, normalizeIpcFileIds(sequenceIds));
      }
    },
  );
  ipcMain.handle("window:open-settings", () => {
    createSettingsWindow();
  });
  ipcMain.handle("file:get-detail", (_event, id: unknown) => {
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return null;
    }

    return getFileDetail(id);
  });
  ipcMain.handle(
    "file-detail:get-sequence",
    (event) => fileDetailSequences.get(event.sender.id) ?? [],
  );
  ipcMain.handle("file:open-externally", (_event, fileId: unknown) => {
    if (
      typeof fileId !== "number" ||
      !Number.isInteger(fileId) ||
      fileId <= 0
    ) {
      throw new Error("文件无效");
    }

    return openStoredFileExternally(fileId);
  });
  ipcMain.handle("trash:list-files", (_event, page: unknown) =>
    listTrashedFiles(typeof page === "number" ? page : 1),
  );
  ipcMain.handle("trash:put-files", (_event, fileIds: unknown) => {
    trashFiles(normalizeIpcFileIds(fileIds));
    broadcastFilesChanged();
  });
  ipcMain.handle("trash:restore-files", (_event, fileIds: unknown) => {
    restoreFiles(normalizeIpcFileIds(fileIds));
    broadcastFilesChanged();
  });
  ipcMain.handle(
    "trash:delete-files-permanently",
    async (_event, fileIds: unknown) => {
      await deleteStoredFilesPermanently(normalizeIpcFileIds(fileIds));
      broadcastFilesChanged();
    },
  );
  ipcMain.handle(
    "file:set-domain",
    (_event, fileIds: unknown, domain: unknown) => {
      if (domain !== "pending" && domain !== "library") {
        throw new Error("文件域无效");
      }

      setFilesDomain(normalizeIpcFileIds(fileIds), domain);
      broadcastFilesChanged();
    },
  );
  ipcMain.handle("domain:list", () => listDomains());
  ipcMain.handle("url:list-file-urls", (_event, fileIds: unknown) =>
    listFileUrls(normalizeIpcFileIds(fileIds)),
  );
  ipcMain.handle(
    "url:add-file-url",
    (_event, fileIds: unknown, url: unknown) => {
      if (typeof url !== "string") {
        throw new Error("URL 无效");
      }

      return addFileUrl(normalizeIpcFileIds(fileIds), url);
    },
  );
  ipcMain.handle(
    "url:update-file-url",
    (
      _event,
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
        throw new Error("URL 无效");
      }

      return updateFileUrl(
        normalizeIpcFileIds(fileIds),
        urlId,
        previousUrl,
        nextUrl,
      );
    },
  );
  ipcMain.handle(
    "url:remove-file-url",
    (_event, fileIds: unknown, urlId: unknown, url: unknown) => {
      if (typeof urlId !== "number" || typeof url !== "string") {
        throw new Error("URL 无效");
      }

      return removeFileUrl(normalizeIpcFileIds(fileIds), urlId, url);
    },
  );
  ipcMain.handle("rating:list-groups", () => listRatingGroups());
  ipcMain.handle("rating:create-group", (_event, name: unknown) => {
    if (typeof name !== "string") {
      throw new Error("分级无效");
    }

    return createRatingGroup(name);
  });
  ipcMain.handle(
    "rating:rename-group",
    (_event, groupId: unknown, name: unknown) => {
      if (typeof groupId !== "number" || typeof name !== "string") {
        throw new Error("分级无效");
      }

      return renameRatingGroup(groupId, name);
    },
  );
  ipcMain.handle(
    "rating:set-group-active",
    (_event, groupId: unknown, active: unknown) => {
      if (typeof groupId !== "number" || typeof active !== "boolean") {
        throw new Error("分级无效");
      }

      const groups = setRatingGroupActive(groupId, active);
      broadcastFilesChanged();
      return groups;
    },
  );
  ipcMain.handle("rating:delete-group", (_event, groupId: unknown) => {
    if (typeof groupId !== "number") {
      throw new Error("分级无效");
    }

    const groups = deleteRatingGroup(groupId);
    broadcastFilesChanged();
    return groups;
  });
  ipcMain.handle("rating:list-entries", (_event, groupId: unknown) => {
    if (typeof groupId !== "number") {
      return [];
    }

    return listRatingEntries(groupId);
  });
  ipcMain.handle(
    "rating:create-entry",
    (_event, groupId: unknown, label: unknown, color: unknown) => {
      if (
        typeof groupId !== "number" ||
        typeof label !== "string" ||
        typeof color !== "string"
      ) {
        throw new Error("分级条目无效");
      }

      return createRatingEntry(groupId, label, color);
    },
  );
  ipcMain.handle(
    "rating:update-entry",
    (_event, entryId: unknown, label: unknown, color: unknown) => {
      if (
        typeof entryId !== "number" ||
        typeof label !== "string" ||
        typeof color !== "string"
      ) {
        throw new Error("分级条目无效");
      }

      const entries = updateRatingEntry(entryId, label, color);
      broadcastFilesChanged();
      return entries;
    },
  );
  ipcMain.handle("rating:delete-entry", (_event, entryId: unknown) => {
    if (typeof entryId !== "number") {
      throw new Error("分级条目无效");
    }

    const entries = deleteRatingEntry(entryId);
    broadcastFilesChanged();
    return entries;
  });
  ipcMain.handle(
    "rating:reorder-entries",
    (_event, groupId: unknown, entryIds: unknown) => {
      if (typeof groupId !== "number" || !Array.isArray(entryIds)) {
        throw new Error("分级条目顺序无效");
      }

      const entries = reorderRatingEntries(
        groupId,
        entryIds.filter(
          (entryId): entryId is number => typeof entryId === "number",
        ),
      );
      broadcastFilesChanged();
      return entries;
    },
  );
  ipcMain.handle(
    "rating:set-file-entries",
    (_event, fileIds: unknown, groupId: unknown, entryIds: unknown) => {
      if (typeof groupId !== "number" || !Array.isArray(entryIds)) {
        throw new Error("分级设置无效");
      }

      setFileRatingEntries(
        normalizeIpcFileIds(fileIds),
        groupId,
        entryIds.filter(
          (entryId): entryId is number => typeof entryId === "number",
        ),
      );
      broadcastFilesChanged();
    },
  );
  ipcMain.handle("settings:get-storage", () => getStorageSettings());
  ipcMain.handle("settings:get-network", () => getNetworkSettings());
  ipcMain.handle(
    "settings:update-network",
    async (_event, settings: unknown) => {
      const nextSettings = setNetworkSettings(
        normalizeNetworkSettings(settings),
      );
      await applyNetworkSettings(nextSettings);
      return nextSettings;
    },
  );
  ipcMain.handle("settings:select-storage-directory", () =>
    chooseStorageDirectory(),
  );
  ipcMain.handle("export:select-directory", () => chooseExportDirectory());
  ipcMain.handle("export:files", (event, options: unknown) => {
    if (!isExportOptions(options)) {
      throw new Error("导出参数无效");
    }

    return exportFiles(event.sender, options);
  });
  ipcMain.handle("export:cancel", (_event, jobId: unknown) => {
    if (typeof jobId === "string") {
      cancelExport(jobId);
    }
  });
  ipcMain.handle("api:list-permissions", () => listApiPermissions());
  ipcMain.handle("api:list-services", () => listApiServices());
  ipcMain.handle("api:create-service", async (_event, name: unknown) => {
    if (typeof name !== "string") {
      throw new Error("API 服务名称无效");
    }

    const services = createApiService(name);
    await syncApiServers();
    return services;
  });
  ipcMain.handle(
    "api:update-service",
    async (_event, serviceId: unknown, draft: unknown) => {
      if (
        typeof serviceId !== "number" ||
        !Number.isInteger(serviceId) ||
        serviceId <= 0 ||
        !isApiServiceDraft(draft)
      ) {
        throw new Error("API 服务无效");
      }

      const services = updateApiService(serviceId, draft);
      await syncApiServers();
      return services;
    },
  );
  ipcMain.handle("api:delete-service", async (_event, serviceId: unknown) => {
    if (
      typeof serviceId !== "number" ||
      !Number.isInteger(serviceId) ||
      serviceId <= 0
    ) {
      throw new Error("API 服务无效");
    }

    const services = deleteApiService(serviceId);
    await syncApiServers();
    return services;
  });
  ipcMain.handle(
    "api:get-service-availability",
    (_event, serviceId: unknown) => {
      if (
        typeof serviceId !== "number" ||
        !Number.isInteger(serviceId) ||
        serviceId <= 0
      ) {
        return {
          serviceId: 0,
          available: false,
          reason: "服务无效",
          enabled: false,
          address: "",
          port: 0,
          permissionCount: 0,
        };
      }

      return getApiServiceRuntimeAvailability(serviceId);
    },
  );
  ipcMain.handle(
    "settings:update-file-storage-path",
    (event, path: unknown) => {
      if (typeof path !== "string") {
        throw new Error("路径无效");
      }

      return updateStoragePathWithMigration(event.sender, path);
    },
  );
  ipcMain.handle(
    "settings:update-thumbnail-storage-path",
    (event, path: unknown) => {
      if (typeof path !== "string") {
        throw new Error("路径无效");
      }

      return updateThumbnailStoragePathWithMigration(event.sender, path);
    },
  );
  ipcMain.handle(
    "settings:update-convert-imported-images-to-png",
    (_event, enabled: unknown) =>
      setConvertImportedImagesToPng(enabled === true),
  );
  ipcMain.handle("thumbnail:preload", (_event, fileIds: unknown) => {
    if (!Array.isArray(fileIds)) {
      return;
    }

    queueThumbnailPreload(
      fileIds.filter((fileId): fileId is number => typeof fileId === "number"),
      "high",
    );
  });
  ipcMain.handle("work-status:get", () => getCombinedWorkStatus());
  ipcMain.handle("page-layout:list-configs", () => listPageLayoutConfigs());
  ipcMain.handle("page-layout:get-settings", () => getPageLayoutSettings());
  ipcMain.handle("page-layout:get-template", (_event, kind: unknown) =>
    getPageLayoutTemplate(kind === "newPage" ? "newPage" : "default"),
  );
  ipcMain.handle(
    "page-layout:save-config",
    (_event, name: unknown, layoutJson: unknown) => {
      if (typeof name !== "string" || typeof layoutJson !== "string") {
        throw new Error("页面配置无效");
      }

      return savePageLayoutConfig(name, layoutJson);
    },
  );
  ipcMain.handle("page-layout:create-config", () => createPageLayoutConfig());
  ipcMain.handle(
    "page-layout:rename-config",
    (_event, id: unknown, name: unknown) => {
      if (typeof id !== "string" || typeof name !== "string") {
        throw new Error("页面配置无效");
      }

      return renamePageLayoutConfig(id, name);
    },
  );
  ipcMain.handle("page-layout:delete-config", (_event, id: unknown) => {
    if (typeof id !== "string") {
      throw new Error("页面配置无效");
    }

    return deletePageLayoutConfig(id);
  });
  ipcMain.handle("page-layout:open-config", (_event, id: unknown) => {
    if (typeof id !== "string") {
      throw new Error("页面配置无效");
    }

    return openPageLayoutConfig(id);
  });
  ipcMain.handle("page-layout:set-default-config", (_event, id: unknown) => {
    if (id !== null && typeof id !== "string") {
      throw new Error("页面配置无效");
    }

    return (async () => {
      const result = await setPageLayoutSetting(
        PAGE_LAYOUT_DEFAULT_SETTING_KEY,
        id,
      );
      broadcastPageLayoutChanged();
      return result;
    })();
  });
  ipcMain.handle("page-layout:set-new-page-config", (_event, id: unknown) => {
    if (id !== null && typeof id !== "string") {
      throw new Error("页面配置无效");
    }

    return (async () => {
      const result = await setPageLayoutSetting(
        PAGE_LAYOUT_NEW_PAGE_SETTING_KEY,
        id,
      );
      broadcastPageLayoutChanged();
      return result;
    })();
  });
  ipcMain.handle("tag:list-file-tags", (_event, fileId: unknown) => {
    if (
      typeof fileId !== "number" ||
      !Number.isInteger(fileId) ||
      fileId <= 0
    ) {
      return [];
    }

    return listFileTags(fileId);
  });
  ipcMain.handle("tag:list-batch-file-tags", (_event, fileIds: unknown) =>
    listBatchFileTags(normalizeIpcFileIds(fileIds)),
  );
  ipcMain.handle("tag:search", (_event, query: unknown) =>
    searchTags(typeof query === "string" ? query : ""),
  );
  ipcMain.handle("search:hints", (_event, query: unknown) =>
    searchHints(typeof query === "string" ? query : ""),
  );
  ipcMain.handle("tag:list-styles", () => listTagStyles());
  ipcMain.handle("tag:create-style", (_event, name: unknown) => {
    if (typeof name !== "string") {
      throw new Error("标签风格名称无效");
    }

    return createTagStyle(name);
  });
  ipcMain.handle(
    "tag:rename-style",
    (_event, styleId: unknown, name: unknown) => {
      if (
        typeof styleId !== "number" ||
        !Number.isInteger(styleId) ||
        styleId <= 0 ||
        typeof name !== "string"
      ) {
        throw new Error("标签风格无效");
      }

      const styles = renameTagStyle(styleId, name);
      broadcastFilesChanged();
      return styles;
    },
  );
  ipcMain.handle("tag:set-active-style", (_event, styleId: unknown) => {
    if (
      typeof styleId !== "number" ||
      !Number.isInteger(styleId) ||
      styleId <= 0
    ) {
      throw new Error("标签风格无效");
    }

    return setActiveTagStyle(styleId);
  });
  ipcMain.handle("tag:delete-style", (_event, styleId: unknown) => {
    if (
      typeof styleId !== "number" ||
      !Number.isInteger(styleId) ||
      styleId <= 0
    ) {
      throw new Error("标签风格无效");
    }

    const result = deleteTagStyle(styleId);
    broadcastFilesChanged();
    return result;
  });
  ipcMain.handle(
    "tag:list-managed-tags",
    (_event, styleId: unknown, sortKey: unknown, direction: unknown) => {
      if (
        typeof styleId !== "number" ||
        !Number.isInteger(styleId) ||
        styleId <= 0
      ) {
        return [];
      }

      return listManagedTags(
        styleId,
        sortKey === "createdAt" || sortKey === "fileCount" ? sortKey : "name",
        direction === "desc" ? "desc" : "asc",
      );
    },
  );
  ipcMain.handle(
    "tag:create-managed-tag",
    (_event, styleId: unknown, tag: unknown) => {
      if (
        typeof styleId !== "number" ||
        !Number.isInteger(styleId) ||
        styleId <= 0 ||
        !isTagDraft(tag)
      ) {
        throw new Error("标签无效");
      }

      return createManagedTag(styleId, tag);
    },
  );
  ipcMain.handle("tag:delete-managed-tag", (_event, tagId: unknown) => {
    if (typeof tagId !== "number" || !Number.isInteger(tagId) || tagId <= 0) {
      throw new Error("标签无效");
    }

    const result = deleteManagedTag(tagId);
    broadcastFilesChanged();
    return result;
  });
  ipcMain.handle("tag:delete-managed-tags", (_event, tagIds: unknown) => {
    if (!Array.isArray(tagIds)) {
      throw new Error("标签无效");
    }

    const result = deleteManagedTags(
      tagIds.filter((tagId): tagId is number => typeof tagId === "number"),
    );
    broadcastFilesChanged();
    return result;
  });
  ipcMain.handle(
    "tag:add-file-tags",
    (_event, fileId: unknown, tags: unknown) => {
      if (
        typeof fileId !== "number" ||
        !Number.isInteger(fileId) ||
        fileId <= 0 ||
        !Array.isArray(tags)
      ) {
        return [];
      }

      const drafts = tags.filter(isTagDraft);

      const fileTags = addFileTags(fileId, drafts);
      broadcastFilesChanged();
      return fileTags;
    },
  );
  ipcMain.handle(
    "tag:remove-file-tags",
    (_event, fileId: unknown, tagIds: unknown) => {
      if (
        typeof fileId !== "number" ||
        !Number.isInteger(fileId) ||
        fileId <= 0 ||
        !Array.isArray(tagIds)
      ) {
        return [];
      }

      const fileTags = removeFileTags(
        fileId,
        tagIds.filter((tagId): tagId is number => typeof tagId === "number"),
      );
      broadcastFilesChanged();
      return fileTags;
    },
  );
  ipcMain.handle(
    "tag:add-tags-to-files",
    (_event, fileIds: unknown, tags: unknown) => {
      if (!Array.isArray(tags)) {
        return [];
      }

      const fileTags = addTagsToFiles(
        normalizeIpcFileIds(fileIds),
        tags.filter(isTagDraft),
      );
      broadcastFilesChanged();
      return fileTags;
    },
  );
  ipcMain.handle(
    "tag:remove-tags-from-files",
    (_event, fileIds: unknown, tagIds: unknown) => {
      if (!Array.isArray(tagIds)) {
        return [];
      }

      const fileTags = removeTagsFromFiles(
        normalizeIpcFileIds(fileIds),
        tagIds.filter((tagId): tagId is number => typeof tagId === "number"),
      );
      broadcastFilesChanged();
      return fileTags;
    },
  );
  ipcMain.handle("import:files", async (event) => {
    const result = await importFiles(event.sender);
    broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle("import:folder", async (event) => {
    const result = await importFolder(event.sender);
    broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle("import:paths", async (event, paths: unknown) => {
    const result = await importPaths(event.sender, paths);
    broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle("import:urls", async (event, urls: unknown) => {
    const result = await importUrls(event.sender, urls);
    broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle("import:list-queue-files", () => listImportQueueFiles());
  ipcMain.handle(
    "import:commit-queue",
    async (event, queueIds: unknown, confirmedDuplicateQueueIds: unknown) => {
      const result = await commitImportQueue(
        event.sender,
        normalizeIpcFileIds(queueIds),
        normalizeIpcFileIds(confirmedDuplicateQueueIds),
      );

      if (result.phase !== "canceled") {
        await tagUntaggedImagesWithAi(result.committedFileIds);
      }

      broadcastImportQueueChanged();
      broadcastFilesChanged();

      if (result.phase !== "canceled") {
        queueAllMissingThumbnails("normal");
      }

      return result;
    },
  );
  ipcMain.handle("import:remove-queue-files", (_event, queueIds: unknown) => {
    const result = removeImportQueueFiles(normalizeIpcFileIds(queueIds));
    broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle("import:clear-queue", () => {
    const result = clearImportQueue();
    broadcastImportQueueChanged();
    return result;
  });
  ipcMain.handle("hydrus:test-connection", (_event, options: unknown) => {
    return testHydrusConnection(normalizeHydrusImportOptions(options));
  });
  ipcMain.handle("hydrus:import", async (event, options: unknown) => {
    const result = await importFromHydrus(
      event.sender,
      normalizeHydrusImportOptions(options),
    );
    broadcastFilesChanged();
    queueAllMissingThumbnails("normal");
    return result;
  });
  ipcMain.handle("hydrus:cancel-import", () => {
    cancelHydrusImport();
  });
  ipcMain.handle("hydrus:get-settings", () => getHydrusImportSettings());
  ipcMain.handle("hydrus:update-settings", (_event, settings: unknown) =>
    setHydrusImportSettings(normalizeHydrusImportOptions(settings)),
  );
  ipcMain.handle("ehentai:test-gallery", async (_event, options: unknown) => {
    await applyNetworkSettings(getNetworkSettings());
    return testEHentaiGallery(normalizeEHentaiImportOptions(options));
  });
  ipcMain.handle("ehentai:import", async (event, options: unknown) => {
    await applyNetworkSettings(getNetworkSettings());
    const result = await importFromEHentai(
      event.sender,
      normalizeEHentaiImportOptions(options),
    );
    broadcastFilesChanged();
    queueAllMissingThumbnails("normal");
    return result;
  });
  ipcMain.handle("ehentai:cancel-import", () => {
    cancelEHentaiImport();
  });
  ipcMain.handle("ehentai:get-settings", () => getEHentaiImportSettings());
  ipcMain.handle("ehentai:update-settings", (_event, settings: unknown) =>
    setEHentaiImportSettings(normalizeEHentaiImportOptions(settings)),
  );
  ipcMain.handle("tag-translation:get-settings", () =>
    getTagTranslationSettings(),
  );
  ipcMain.handle(
    "tag-translation:update-settings",
    (_event, settings: unknown) =>
      setTagTranslationSettings(normalizeTagTranslationSettings(settings)),
  );
  ipcMain.handle("tag-translation:select-csv", () => chooseTagTranslationCsv());
  ipcMain.handle(
    "tag-translation:translate-files",
    (_event, fileIds: unknown) => {
      const normalizedFileIds = normalizeIpcFileIds(fileIds);
      beginTagTranslationWorkStatus(normalizedFileIds.length);

      try {
        const result = translateFileTags(
          normalizedFileIds,
          (completed, total) => {
            updateTagTranslationWorkStatus(completed, total);
          },
        );
        broadcastFilesChanged();
        return result;
      } finally {
        finishTagTranslationWorkStatus();
      }
    },
  );
  ipcMain.handle("ai:get-settings", () => getAiSettings());
  ipcMain.handle("ai:update-settings", (_event, settings: unknown) =>
    setAiSettings(normalizeAiSettings(settings)),
  );
  ipcMain.handle("ai:select-model-directory", () => chooseAiModelDirectory());
  ipcMain.handle("ai:detect-model", (_event, modelPath: unknown) =>
    detectAiModel(typeof modelPath === "string" ? modelPath : ""),
  );
  ipcMain.handle(
    "ai:detect-models",
    (_event, modelPath: unknown, selectedModelName: unknown) =>
      detectAiModels(
        typeof modelPath === "string" ? modelPath : "",
        typeof selectedModelName === "string" ? selectedModelName : "",
      ),
  );
  ipcMain.handle(
    "ai:download-default-model",
    async (event, modelPath: unknown) => {
      const normalizedPath =
        typeof modelPath === "string" ? modelPath.trim() : "";
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (!normalizedPath) {
        await openAlertDialog(
          {
            title: "模型路径为空",
            message: "请先配置模型路径。",
            confirmText: "确定",
          },
          parentWindow,
        );
        return detectAiModel("");
      }

      if (await defaultAiModelExists(normalizedPath)) {
        await openAlertDialog(
          {
            title: "默认模型已存在",
            message: "模型路径下已经存在默认模型。",
            confirmText: "确定",
          },
          parentWindow,
        );
        return detectAiModel(normalizedPath);
      }

      const progressDialogId = openProgressDialog(
        {
          title: "下载默认模型",
          total: 200,
          processed: 0,
          message: "准备下载默认模型",
          completed: false,
        },
        parentWindow,
      );

      try {
        const result = await downloadDefaultAiModel(
          normalizedPath,
          (progress) => {
            const filePercent =
              progress.totalBytes > 0
                ? Math.min(
                    99,
                    Math.floor(
                      (progress.downloadedBytes / progress.totalBytes) * 100,
                    ),
                  )
                : 0;

            updateProgressDialog(progressDialogId, {
              title: "下载默认模型",
              total: progress.totalFiles * 100,
              processed: Math.min(
                progress.totalFiles * 100,
                progress.completedFiles * 100 + filePercent,
              ),
              message: `正在下载 ${progress.fileName}`,
              completed: false,
            });
          },
        );

        updateProgressDialog(progressDialogId, {
          title: "下载默认模型",
          total: 200,
          processed: 200,
          message: "默认模型下载完成",
          completed: true,
        });

        return result;
      } catch (error) {
        updateProgressDialog(progressDialogId, {
          title: "下载默认模型",
          total: 200,
          processed: 0,
          message: "默认模型下载失败",
          completed: true,
        });

        await openAlertDialog(
          {
            title: "默认模型下载失败",
            message:
              error instanceof Error ? error.message : "默认模型下载失败",
            confirmText: "确定",
          },
          parentWindow,
        );

        return detectAiModel(normalizedPath);
      }
    },
  );
  ipcMain.handle(
    "ai:tag-files",
    async (event, fileIds: unknown, overwrite: unknown) => {
      const normalizedFileIds = normalizeIpcFileIds(fileIds);

      if (normalizedFileIds.length === 0) {
        await openAlertDialog(
          {
            title: "人工智能打标",
            message: "没有可打标文件。",
            confirmText: "确定",
          },
          BrowserWindow.fromWebContents(event.sender),
        );
        return {
          total: 0,
          tagged: 0,
          skipped: 0,
          failed: 0,
          failures: [],
        };
      }

      const result = await tagFilesWithAi(
        normalizedFileIds,
        overwrite === true,
      );
      broadcastFilesChanged();

      await openAlertDialog(
        {
          title: "人工智能打标",
          message: buildAiTaggingMessage(result),
          confirmText: "确定",
        },
        BrowserWindow.fromWebContents(event.sender),
      );

      return result;
    },
  );
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopApiServers();
  closeDatabase();
});
