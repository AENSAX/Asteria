import type { BrowserWindow } from "electron";
import type { MainLanguageId } from "../i18n.js";
import { mainT } from "../i18n.js";
import { createChildWindow } from "./windowFactory.js";

export function createDatabaseManagerWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: mainT(languageId, "window.databaseManager"),
    windowMode: "database-manager",
  });
}

export function createTagManagerWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: mainT(languageId, "window.tagManager"),
    windowMode: "tag-manager",
  });
}

export function createTagRelationTreeWindow(
  tagIds: number[],
  kind: "parent" | "sibling" = "parent",
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 680,
    minWidth: 720,
    minHeight: 460,
    title: mainT(
      languageId,
      kind === "sibling"
        ? "window.tagRelationTreeSibling"
        : "window.tagRelationTree",
    ),
    windowMode: "tag-relation-tree",
    query: {
      ids: tagIds.join(","),
      kind,
    },
  });
}

export function createRecycleBinWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: mainT(languageId, "window.recycleBin"),
    windowMode: "recycle-bin",
  });
}

export function createRatingManagerWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: mainT(languageId, "window.ratingManager"),
    windowMode: "rating-manager",
  });
}

export function createApiManagerWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 900,
    height: 560,
    minWidth: 680,
    minHeight: 420,
    title: mainT(languageId, "window.apiManager"),
    windowMode: "api-manager",
  });
}

export function createHydrusImportWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 820,
    height: 560,
    minWidth: 640,
    minHeight: 420,
    title: mainT(languageId, "window.hydrusImport"),
    autoHideMenuBar: true,
    singleton: true,
    windowMode: "hydrus-import",
  });
}

export function createAiManagerWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 700,
    height: 430,
    minWidth: 560,
    minHeight: 340,
    title: mainT(languageId, "window.aiManager"),
    singleton: true,
    windowMode: "ai-manager",
  });
}

export function createTagTranslationWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 720,
    height: 220,
    minWidth: 560,
    minHeight: 190,
    title: mainT(languageId, "window.tagTranslation"),
    autoHideMenuBar: true,
    singleton: true,
    windowMode: "tag-translation",
  });
}

export function createFavoritesWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: mainT(languageId, "window.favorites"),
    windowMode: "favorites",
  });
}

export function createUrlManagerWindow(
  fileIds: number[],
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 760,
    height: 520,
    minWidth: 560,
    minHeight: 360,
    title: mainT(languageId, "window.urlManager"),
    windowMode: "url-manager",
    query: { ids: fileIds.join(",") },
  });
}

export function createBatchTagManagerWindow(
  fileIds: number[],
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 760,
    height: 560,
    minWidth: 560,
    minHeight: 380,
    title: mainT(languageId, "window.batchTagManager"),
    windowMode: "batch-tag-manager",
    query: { ids: fileIds.join(",") },
  });
}

export function createBatchOperationWindow(
  fileIds: number[],
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 980,
    height: 680,
    minWidth: 760,
    minHeight: 500,
    title: mainT(languageId, "window.batchOperation"),
    windowMode: "batch-operation",
    query: { ids: fileIds.join(",") },
  });
}

export function createExportWindow(
  fileIds: number[],
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 620,
    height: 520,
    minWidth: 480,
    minHeight: 420,
    title: mainT(languageId, "window.export"),
    windowMode: "export",
    query: { ids: fileIds.join(",") },
  });
}

export function createScreeningWindow(
  fileIds: number[],
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: mainT(languageId, "window.screening"),
    windowMode: "screening",
    query: { ids: fileIds.join(",") },
  });
}

export function createSettingsWindow(
  languageId: MainLanguageId = "zh-CN",
): BrowserWindow {
  return createChildWindow({
    width: 820,
    height: 520,
    minWidth: 640,
    minHeight: 420,
    title: mainT(languageId, "window.settings"),
    windowMode: "settings",
  });
}
