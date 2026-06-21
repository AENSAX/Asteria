import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
  type NativeImage,
  type WebContents,
} from "electron";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, rm, stat, unlink } from "node:fs/promises";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  closeDatabase,
  addFileTags,
  addTagParent,
  addTagParents,
  addTagSibling,
  addTagSiblings,
  addFileUrl,
  addTagsToFiles,
  createApiService,
  deleteAppSetting,
  deleteApiService,
  deleteAllTrashedFilesPermanently,
  deleteFilesPermanently as deleteFilesPermanentlyFromDatabase,
  createRatingEntry,
  createRatingGroup,
  getAiSettings,
  getHydrusImportSettings,
  getFileDetail,
  getFileOriginalPath,
  getFileThumbnailSource,
  getNetworkSettings,
  getTagTranslationSettings,
  getTagRelationTree,
  getAppSetting,
  getDatabaseStatus,
  hasStoredFileReference,
  hasStoredPathReference,
  getStorageSettings,
  initializeDatabase,
  createManagedTag,
  createManagedTags,
  createTagStyle,
  deleteManagedTag,
  deleteManagedTags,
  deleteTagStyle,
  listDomains,
  listApiPermissions,
  listApiServices,
  listBatchEffectiveFileTags,
  listFilesForStorageMigration,
  listFavoriteFilePage,
  listFavoriteFiles,
  listFileParentTags,
  listFileTags,
  listFileUrls,
  listBatchFileTags,
  listBrowserFileIds,
  listBrowserFilePage,
  listBrowserFiles,
  listBrowserFilesByIds,
  listDatabaseFiles,
  listManagedTags,
  listTagParents,
  listTagSiblings,
  listRatingEntries,
  listRatingGroups,
  listTrashedFiles,
  listTagStyles,
  removeFileTags,
  removeTagParent,
  removeTagParents,
  removeTagSibling,
  removeTagSiblings,
  removeFileUrl,
  removeTagsFromFiles,
  deleteRatingEntry,
  deleteRatingGroup,
  previewManagedTagRename,
  renameManagedTag,
  renameRatingGroup,
  reorderRatingEntries,
  restoreAllTrashedFiles,
  restoreFiles,
  searchTags,
  searchBrowserFilePage,
  searchHints,
  renameTagStyle,
  setActiveTagStyle,
  setAppSetting,
  setAiSettings,
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
  DatabaseFileRecord,
  PageLayoutConfigRecord,
  PageLayoutSettings,
  StorageSettings,
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
  getHydrusImportWorkStatus,
  importFromHydrus,
  setHydrusImportStatusListener,
  testHydrusConnection,
} from "./hydrusImportService.js";
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
  getThumbnailPath,
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
import {
  createAsteriaWindow,
  createChildWindow,
  loadRenderer,
  setupWindowDiagnostics,
  showWhenReady,
} from "./windows/windowFactory.js";
import {
  createAiManagerWindow,
  createApiManagerWindow,
  createBatchOperationWindow,
  createBatchTagManagerWindow,
  createDatabaseManagerWindow,
  createExportWindow,
  createFavoritesWindow,
  createHydrusImportWindow,
  createRatingManagerWindow,
  createRecycleBinWindow,
  createScreeningWindow,
  createSettingsWindow,
  createTagManagerWindow,
  createTagRelationTreeWindow,
  createTagTranslationWindow,
  createUrlManagerWindow,
} from "./windows/childWindows.js";
import { createDialogManager } from "./windows/dialogs.js";
import { createFileDetailWindowManager } from "./windows/fileDetailWindows.js";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers.js";
import { createWorkStatusManager } from "./app/workStatus.js";
import {
  broadcastFileFavoriteChanged,
  broadcastFilesChanged,
  broadcastImportQueueChanged,
  broadcastPageLayoutChanged,
  broadcastSettingsChanged,
} from "./app/broadcasts.js";
import {
  mainT,
  readWindowLanguageId,
  type MainLanguageId,
  type MainTranslationKey,
} from "./i18n.js";

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

const PAGE_LAYOUT_DEFAULT_SETTING_KEY = "page_layout_default_config_id";
const PAGE_LAYOUT_NEW_PAGE_SETTING_KEY = "page_layout_new_page_config_id";
const PAGE_LAYOUT_FILE_EXTENSION = ".jsonc";

const {
  openConfirmDialog,
  openAlertDialog,
  openProgressDialog,
  updateProgressDialog,
  getDialogState,
  resizeGenericDialog,
  resolveGenericDialog,
} = createDialogManager({ readLanguageId: readWindowLanguageId });

const { createFileDetailWindow, getFileDetailSequence } =
  createFileDetailWindowManager({ normalizeFileIds: normalizeIpcFileIds });

const {
  getCombinedWorkStatus,
  broadcastCombinedWorkStatus,
  beginTagTranslationWorkStatus,
  updateTagTranslationWorkStatus,
  finishTagTranslationWorkStatus,
} = createWorkStatusManager({
  getImageConversionWorkStatus,
  getAiTaggingWorkStatus,
  getHydrusImportWorkStatus,
  getThumbnailWorkStatus,
});

type StorageMigrationOutcome =
  | "migrated"
  | "adopted"
  | "alreadyCurrent"
  | "missing";
type StorageMigrationResult = Record<StorageMigrationOutcome, number>;
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

function createFileRatingEditorWindow(
  fileIds: number[],
  groupId: number,
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  const group = listRatingGroups().find((item) => item.id === groupId);
  return createChildWindow({
    width: 420,
    height: 360,
    minWidth: 320,
    minHeight: 240,
    title: group
      ? mainT(languageId, "window.fileRatingEditorWithGroup", {
          name: group.name,
        })
      : mainT(languageId, "window.fileRatingEditor"),
    windowMode: "file-rating-editor",
    query: {
      ids: fileIds.join(","),
      groupId: String(groupId),
    },
  });
}

function confirmMainWindowClose(window: BrowserWindow): void {
  let confirmOpen = false;
  let confirmed = false;

  window.on("close", (event) => {
    if (confirmed) {
      return;
    }

    event.preventDefault();

    if (confirmOpen) {
      return;
    }

    confirmOpen = true;
    void confirmMainWindowCloseRequest(window)
      .then(({ childWindows, confirmed: userConfirmed }) => {
        if (!userConfirmed) {
          return;
        }

        confirmed = true;
        closeChildWindows(childWindows);
        window.close();
      })
      .finally(() => {
        confirmOpen = false;
      });
  });
}

async function confirmMainWindowCloseRequest(window: BrowserWindow): Promise<{
  childWindows: BrowserWindow[];
  confirmed: boolean;
}> {
  const languageId = await readWindowLanguageId(window);
  const childWindows = listChildWindows(window);
  const message = buildMainCloseConfirmMessage(childWindows, languageId);
  const confirmed = await openConfirmDialog(
    {
      title: getMainCloseConfirmTitle(languageId),
      message,
      confirmText: getMainCloseConfirmText(languageId),
      cancelText: getMainCancelText(languageId),
    },
    window,
  );

  return { childWindows, confirmed };
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

function buildMainCloseConfirmMessage(
  childWindows: BrowserWindow[],
  languageId: MainLanguageId,
): string {
  const tasks = [
    ...formatChildWindowTasks(childWindows, languageId),
    ...formatActiveWorkStatusTask(languageId),
  ];

  if (tasks.length === 0) {
    return getMainCloseQuestion(languageId);
  }

  return `${getMainCloseQuestionWithTasks(languageId)}\n${tasks
    .map((task) => `- ${task}`)
    .join("\n")}`;
}

function formatChildWindowTasks(
  childWindows: BrowserWindow[],
  languageId: MainLanguageId,
): string[] {
  const titleCounts = new Map<string, number>();

  for (const childWindow of childWindows) {
    const title =
      childWindow.getTitle().trim() ||
      mainT(languageId, "main.close.untitledWindow");
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  return [...titleCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([title, count]) => {
      const countText = count > 1 ? ` × ${count}` : "";

      return `${mainT(languageId, "main.close.childWindow")}${title}${countText}`;
    });
}

function formatActiveWorkStatusTask(languageId: MainLanguageId): string[] {
  const status = getCombinedWorkStatus();

  if (!status.active) {
    return [];
  }

  const statusMessage = status.messageKey
    ? mainT(
        languageId,
        status.messageKey as MainTranslationKey,
        status.messageValues,
      )
    : status.message;
  const messageParts = [
    statusMessage,
    mainT(languageId, "main.close.queue"),
    status.queued,
    mainT(languageId, "main.close.processing"),
    status.processing,
    mainT(languageId, "main.close.completed"),
    status.completed,
  ];

  return [messageParts.join(" ")];
}

function getMainCloseConfirmTitle(languageId: MainLanguageId): string {
  return mainT(languageId, "main.close.confirm");
}

function getMainCloseConfirmText(languageId: MainLanguageId): string {
  return mainT(languageId, "main.close.exit");
}

function getMainCancelText(languageId: MainLanguageId): string {
  return mainT(languageId, "common.cancel");
}

function getMainCloseQuestion(languageId: MainLanguageId): string {
  return mainT(languageId, "main.close.question");
}

function getMainCloseQuestionWithTasks(languageId: MainLanguageId): string {
  return mainT(languageId, "main.close.questionWithTasks");
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

async function chooseDirectory(
  sender: Electron.WebContents,
  titleKey: MainTranslationKey,
): Promise<string | null> {
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const languageId = await readWindowLanguageId(parentWindow);
  const options = {
    title: mainT(languageId, titleKey),
    properties: ["openDirectory", "createDirectory"],
  } as Electron.OpenDialogOptions;
  const selection = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  return selection.filePaths[0] ?? null;
}

async function chooseStorageDirectory(
  sender: Electron.WebContents,
): Promise<string | null> {
  return chooseDirectory(sender, "nativeDialog.selectFileStoragePath");
}

async function chooseExportDirectory(
  sender: Electron.WebContents,
): Promise<string | null> {
  return chooseDirectory(sender, "nativeDialog.selectExportPath");
}

async function chooseAiModelDirectory(
  sender: Electron.WebContents,
): Promise<string | null> {
  return chooseDirectory(sender, "nativeDialog.selectAiModelPath");
}

async function chooseTagTranslationCsv(
  sender: Electron.WebContents,
): Promise<string | null> {
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const languageId = await readWindowLanguageId(parentWindow);
  const options = {
    title: mainT(languageId, "nativeDialog.selectTagTranslationCsv"),
    properties: ["openFile"],
    filters: [
      { name: "CSV", extensions: ["csv"] },
      { name: mainT(languageId, "nativeDialog.allFiles"), extensions: ["*"] },
    ],
  } as Electron.OpenDialogOptions;
  const selection = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  return selection.filePaths[0] ?? null;
}

async function updateStoragePathWithMigration(
  sender: Electron.WebContents,
  nextPath: string,
): Promise<StorageSettings> {
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const languageId = await readWindowLanguageId(parentWindow);
  const normalizedNextPath = nextPath.trim();

  if (!normalizedNextPath) {
    throw new Error(mainT(languageId, "settings.file.emptyPath"));
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
  const progressDialogId = openProgressDialog(
    {
      title: "正在迁移",
      titleKey: "settings.file.migrationRunning",
      total,
      processed: 0,
      message: "正在迁移",
      messageKey: "settings.file.migrationRunning",
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
        titleKey: "settings.file.migrationRunning",
        total,
        processed: index + 1,
        message: buildStorageMigrationProgressMessage(result),
        messageKey: "settings.file.migrationProgress",
        messageValues: createStorageMigrationMessageValues(result),
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
      titleKey: "settings.file.migrationRunning",
      total,
      processed: total,
      message: buildStorageMigrationCompleteMessage(result),
      messageKey: "settings.file.migrationComplete",
      messageValues: createStorageMigrationMessageValues(result),
      completed: true,
    });

    return settings;
  } catch (error) {
    updateProgressDialog(progressDialogId, {
      title: "正在迁移",
      titleKey: "settings.file.migrationRunning",
      total,
      processed: total,
      message: error instanceof Error ? error.message : "迁移失败",
      ...(error instanceof Error
        ? {}
        : { messageKey: "settings.file.migrationFailed" }),
      completed: true,
    });
    throw error;
  }
}

async function updateThumbnailStoragePathWithMigration(
  sender: Electron.WebContents,
  nextPath: string,
): Promise<StorageSettings> {
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const languageId = await readWindowLanguageId(parentWindow);
  const normalizedNextPath = nextPath.trim();

  if (!normalizedNextPath) {
    throw new Error(mainT(languageId, "settings.file.emptyPath"));
  }

  const currentSettings = getStorageSettings();

  if (
    resolve(currentSettings.thumbnailStoragePath) ===
    resolve(normalizedNextPath)
  ) {
    return currentSettings;
  }

  await mkdir(normalizedNextPath, { recursive: true });

  const progressDialogId = openProgressDialog(
    {
      title: "正在迁移",
      titleKey: "settings.file.migrationRunning",
      total: 1,
      processed: 0,
      message: "正在迁移缩略图缓存",
      messageKey: "settings.file.thumbnailMigrationRunning",
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
      titleKey: "settings.file.migrationRunning",
      total: 1,
      processed: 1,
      message: sourceExists
        ? "缩略图缓存迁移完成"
        : "原缩略图缓存缺失，已使用新位置",
      messageKey: sourceExists
        ? "settings.file.thumbnailMigrationComplete"
        : "settings.file.thumbnailMigrationMissing",
      completed: true,
    });

    return settings;
  } catch (error) {
    updateProgressDialog(progressDialogId, {
      title: "正在迁移",
      titleKey: "settings.file.migrationRunning",
      total: 1,
      processed: 1,
      message: error instanceof Error ? error.message : "缩略图缓存迁移失败",
      ...(error instanceof Error
        ? {}
        : { messageKey: "settings.file.thumbnailMigrationFailed" }),
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
        splitterSize: 1,
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

function createStorageMigrationMessageValues(
  result: StorageMigrationResult,
): Record<StorageMigrationOutcome, number> {
  return {
    migrated: result.migrated,
    adopted: result.adopted,
    alreadyCurrent: result.alreadyCurrent,
    missing: result.missing,
  };
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

// 透明 1x1 兜底图标：startDrag 的 icon 是必填项，缺省时拖拽无法发起
const TRANSPARENT_DRAG_ICON_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function resolveExistingFilePaths(fileIds: number[]): string[] {
  return fileIds
    .map((fileId) => getFileOriginalPath(fileId))
    .filter(
      (filePath): filePath is string =>
        Boolean(filePath) && existsSync(filePath as string),
    );
}

function startFileDrag(sender: WebContents, fileIds: number[]): void {
  const files = resolveExistingFilePaths(fileIds);
  const [firstFile] = files;

  if (!firstFile) {
    return;
  }

  sender.startDrag({
    file: firstFile,
    files,
    icon: resolveFileDragIcon(fileIds),
  });
}

function resolveFileDragIcon(fileIds: number[]): NativeImage {
  for (const fileId of fileIds) {
    const source = getFileThumbnailSource(fileId);

    if (!source) {
      continue;
    }

    const icon = nativeImage.createFromPath(getThumbnailPath(source.sha256));

    if (!icon.isEmpty()) {
      return icon.resize({ height: 64 });
    }
  }

  return nativeImage.createFromDataURL(TRANSPARENT_DRAG_ICON_URL);
}

async function createMediaFileResponse(
  request: Request,
  filePath: string,
): Promise<Response> {
  let fileStat: Awaited<ReturnType<typeof stat>>;

  try {
    fileStat = await stat(filePath);
  } catch {
    return new Response("Media file not found", { status: 404 });
  }

  if (!fileStat.isFile()) {
    return new Response("Media file not found", { status: 404 });
  }

  const fileSize = fileStat.size;
  const range = parseHttpRange(request.headers.get("range"), fileSize);
  const headers = new Headers({
    "accept-ranges": "bytes",
    "content-type": getMediaContentType(filePath),
  });

  if (!range) {
    headers.set("content-length", String(fileSize));
    return new Response(createFileReadableStream(filePath), {
      headers,
    });
  }

  if (range.invalid) {
    headers.set("content-range", `bytes */${fileSize}`);
    return new Response(null, {
      status: 416,
      headers,
    });
  }

  const contentLength = range.end - range.start + 1;
  headers.set("content-length", String(contentLength));
  headers.set("content-range", `bytes ${range.start}-${range.end}/${fileSize}`);

  return new Response(
    createFileReadableStream(filePath, {
      start: range.start,
      end: range.end,
    }),
    {
      status: 206,
      headers,
    },
  );
}

function createFileReadableStream(
  filePath: string,
  options?: { start: number; end: number },
): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(filePath, options)) as ReadableStream<
    Uint8Array
  >;
}

function parseHttpRange(
  rangeHeader: string | null,
  fileSize: number,
): { start: number; end: number; invalid?: false } | { invalid: true } | null {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());

  if (!match || fileSize <= 0) {
    return { invalid: true };
  }

  const [, startText, endText] = match;

  if (!startText && !endText) {
    return { invalid: true };
  }

  if (!startText) {
    const suffixLength = Number(endText);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { invalid: true };
    }

    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : fileSize - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return { invalid: true };
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
  };
}

function getMediaContentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (lowerPath.endsWith(".webm")) {
    return "video/webm";
  }

  if (lowerPath.endsWith(".ogg") || lowerPath.endsWith(".ogv")) {
    return "video/ogg";
  }

  if (lowerPath.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (lowerPath.endsWith(".wav")) {
    return "audio/wav";
  }

  if (lowerPath.endsWith(".flac")) {
    return "audio/flac";
  }

  if (lowerPath.endsWith(".m4a")) {
    return "audio/mp4";
  }

  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerPath.endsWith(".png")) {
    return "image/png";
  }

  if (lowerPath.endsWith(".gif")) {
    return "image/gif";
  }

  if (lowerPath.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerPath.endsWith(".avif")) {
    return "image/avif";
  }

  if (lowerPath.endsWith(".bmp")) {
    return "image/bmp";
  }

  return "application/octet-stream";
}

async function deleteStoredFilesPermanently(fileIds: number[]): Promise<void> {
  const deletedFiles = deleteFilesPermanentlyFromDatabase(fileIds);
  await deleteStoredFileArtifacts(deletedFiles);
}

async function deleteAllStoredFilesPermanently(): Promise<number> {
  const deletedFiles = deleteAllTrashedFilesPermanently();
  await deleteStoredFileArtifacts(deletedFiles);
  return deletedFiles.length;
}

async function deleteStoredFileArtifacts(
  deletedFiles: DatabaseFileRecord[],
): Promise<void> {
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
  setHydrusImportStatusListener(broadcastCombinedWorkStatus);
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

    if (kind === "file" || kind === "import") {
      return createMediaFileResponse(request, filePath);
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });

  registerIpcHandlers(ipcMain, {
    getAppVersion: () => app.getVersion(),
    openConfirmDialog,
    openAlertDialog,
    getDialogState,
    resizeGenericDialog,
    resolveGenericDialog,
    getStorageSettings,
    getNetworkSettings,
    setNetworkSettings,
    applyNetworkSettings,
    chooseStorageDirectory,
    updateStoragePathWithMigration,
    updateThumbnailStoragePathWithMigration,
    setConvertImportedImagesToPng,
    listPageLayoutConfigs,
    getPageLayoutSettings,
    getPageLayoutTemplate,
    savePageLayoutConfig,
    createPageLayoutConfig,
    renamePageLayoutConfig,
    deletePageLayoutConfig,
    openPageLayoutConfig,
    setDefaultPageLayoutConfig: async (id) => {
      const result = await setPageLayoutSetting(
        PAGE_LAYOUT_DEFAULT_SETTING_KEY,
        id,
      );
      broadcastPageLayoutChanged();
      return result;
    },
    setNewPageLayoutConfig: async (id) => {
      const result = await setPageLayoutSetting(
        PAGE_LAYOUT_NEW_PAGE_SETTING_KEY,
        id,
      );
      broadcastPageLayoutChanged();
      return result;
    },
    getDatabaseStatus,
    listDatabaseFiles,
    listBrowserFileIds,
    listBrowserFilePage,
    listBrowserFiles,
    listBrowserFilesByIds,
    searchBrowserFilePage,
    listFavoriteFilePage,
    listFavoriteFiles,
    setFileFavorite,
    broadcastFileFavoriteChanged,
    getFileDetail,
    getFileDetailSequence,
    openStoredFileExternally,
    startFileDrag,
    listTrashedFiles,
    trashFiles,
    restoreFiles,
    restoreAllTrashedFiles,
    deleteStoredFilesPermanently,
    deleteAllStoredFilesPermanently,
    setFilesDomain,
    listDomains,
    broadcastFilesChanged,
    broadcastSettingsChanged,
    normalizeIpcFileIds,
    readWindowLanguageId,
    createAiManagerWindow,
    createApiManagerWindow,
    createBatchOperationWindow,
    createBatchTagManagerWindow,
    createDatabaseManagerWindow,
    createExportWindow,
    createFavoritesWindow,
    createFileDetailWindow,
    createFileRatingEditorWindow,
    createHydrusImportWindow,
    createRatingManagerWindow,
    createRecycleBinWindow,
    createScreeningWindow,
    createSettingsWindow,
    createTagManagerWindow,
    createTagRelationTreeWindow,
    createTagTranslationWindow,
    createUrlManagerWindow,
    listFileUrls,
    addFileUrl,
    updateFileUrl,
    removeFileUrl,
    listRatingGroups,
    createRatingGroup,
    renameRatingGroup,
    setRatingGroupActive,
    deleteRatingGroup,
    listRatingEntries,
    createRatingEntry,
    updateRatingEntry,
    deleteRatingEntry,
    reorderRatingEntries,
    setFileRatingEntries,
    chooseExportDirectory,
    exportFiles,
    cancelExport,
    listApiPermissions,
    listApiServices,
    createApiService,
    updateApiService,
    deleteApiService,
    getApiServiceRuntimeAvailability,
    syncApiServers,
    queueThumbnailPreload,
    getCombinedWorkStatus,
    listFileTags,
    listFileParentTags,
    listBatchFileTags,
    listBatchEffectiveFileTags,
    searchTags,
    searchHints,
    listTagStyles,
    createTagStyle,
    renameTagStyle,
    setActiveTagStyle,
    deleteTagStyle,
    listManagedTags,
    listTagParents,
    listTagSiblings,
    getTagRelationTree,
    addTagParent,
    addTagParents,
    removeTagParent,
    removeTagParents,
    addTagSibling,
    addTagSiblings,
    removeTagSibling,
    removeTagSiblings,
    createManagedTag,
    createManagedTags,
    renameManagedTag,
    previewManagedTagRename,
    deleteManagedTag,
    deleteManagedTags,
    addFileTags,
    removeFileTags,
    addTagsToFiles,
    removeTagsFromFiles,
    importFiles,
    importFolder,
    importPaths,
    importUrls,
    listImportQueueFiles,
    commitImportQueue,
    removeImportQueueFiles,
    clearImportQueue,
    testHydrusConnection,
    importFromHydrus,
    cancelHydrusImport,
    getHydrusImportSettings,
    setHydrusImportSettings,
    tagUntaggedImagesWithAi,
    queueAllMissingThumbnails,
    broadcastImportQueueChanged,
    getTagTranslationSettings,
    setTagTranslationSettings,
    chooseTagTranslationCsv,
    translateFileTags,
    beginTagTranslationWorkStatus,
    updateTagTranslationWorkStatus,
    finishTagTranslationWorkStatus,
    getAiSettings,
    setAiSettings,
    chooseAiModelDirectory,
    detectAiModel,
    detectAiModels,
    defaultAiModelExists,
    downloadDefaultAiModel,
    tagFilesWithAi,
    openProgressDialog,
    updateProgressDialog,
  });
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
