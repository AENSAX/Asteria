import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Actions,
  DockLocation,
  Layout,
  Model,
  TabNode,
  type IJsonModel,
} from "flexlayout-react";
import { parse } from "jsonc-parser";
import defaultPageTemplateText from "../../../config/page-templates/default-page.jsonc?raw";
import type {
  ImportProgress,
  ImportQueueFileRecord,
  PageLayoutSettings,
  SortDirection,
  TagRecord,
  WorkStatus,
} from "../../shared/ipc";
import { ActionFeedbackButton } from "./components/ActionFeedbackButton";
import { useStandaloneWindowShortcuts } from "./hooks/useStandaloneWindowShortcuts";
import { useWindowTitle } from "./hooks/useWindowTitle";
import { readDroppedImportData } from "./utils/dropImport";
import { parseIdList } from "./utils/ids";
import {
  applyLanguage,
  listenLanguageSettingsChanged,
  useLanguage,
  type TranslationFunction,
} from "./utils/language";
import { applyTheme, listenThemeSettingsChanged } from "./utils/themes";
import { DatabaseManagerView } from "./views/DatabaseManagerView";
import {
  FileBrowserView,
  type BrowserSortDirection,
  type BrowserSortKey,
  type BrowserViewState,
} from "./views/FileBrowserView";
import { ImportView } from "./views/ImportView";
import {
  buildSearchExpression,
  SearchView,
  type SearchAppendTagRequest,
  type SearchFilter,
  type SearchInputState,
  type SearchInputToken,
  type SearchOperator,
} from "./views/SearchView";
import {
  TagListView,
  type TagListFilterMode,
  type TagListViewState,
} from "./views/TagListView";
import { AiManagerWindow } from "./windows/AiManagerWindow";
import { ApiManagerWindow } from "./windows/ApiManagerWindow";
import { BatchOperationWindow } from "./windows/BatchOperationWindow";
import { BatchTagManagerWindow } from "./windows/BatchTagManagerWindow";
import { DialogWindow } from "./windows/DialogWindow";
import { EHentaiImportWindow } from "./windows/EHentaiImportWindow";
import { ExportWindow } from "./windows/ExportWindow";
import { FavoritesWindow } from "./windows/FavoritesWindow";
import {
  FileDetailWindow,
  ScreeningDetailWindow,
} from "./windows/FileDetailWindow";
import { FileRatingEditorWindow } from "./windows/FileRatingEditorWindow";
import { HydrusImportWindow } from "./windows/HydrusImportWindow";
import { RecycleBinWindow } from "./windows/RecycleBinWindow";
import { RatingManagerWindow } from "./windows/RatingManagerWindow";
import { SettingsWindow } from "./windows/SettingsWindow";
import { TagManagerWindow } from "./windows/TagManagerWindow";
import { TagTranslationWindow } from "./windows/TagTranslationWindow";
import { UrlManagerWindow } from "./windows/UrlManagerWindow";
import "flexlayout-react/style/dark.css";

type MenuName = "file" | "page" | "view" | "database" | "service" | "extension";
type ViewComponent =
  | "empty-page"
  | "file-import"
  | "file-browser"
  | "search"
  | "tag-list";
type OpenableViewComponent = Exclude<ViewComponent, "empty-page">;
type PageTitleMode = "default" | "custom";

interface PageItem {
  id: string;
  title: string;
  titleMode: PageTitleMode;
  model: Model;
  searchFilters: SearchFilter[];
  searchInputState: SearchInputState;
  searchAppendTagRequest: SearchAppendTagRequest | null;
  viewRefreshSequenceByTabId: Record<string, number>;
  importQueueActive: boolean;
  selectedBrowserFileIds: number[];
  browserViewState: BrowserViewState;
  tagListViewState: TagListViewState;
}

interface SavedPageItem {
  id: string;
  title: string;
  titleMode: PageTitleMode;
  modelJson: IJsonModel;
  searchFilters: SearchFilter[];
  searchInputState: SearchInputState;
  importQueueActive: boolean;
  browserViewState: BrowserViewState;
  tagListViewState: TagListViewState;
}

interface SavedWorkbenchState {
  activePageId: string;
  pages: SavedPageItem[];
}

const WORKBENCH_STATE_KEY = "asteria.workbench-state.v1";
const emptySearchInputState: SearchInputState = {
  tokens: [],
  text: "",
};
const defaultBrowserViewState: BrowserViewState = {
  sortKey: "importedAt",
  sortDirection: "desc",
};
const defaultTagListViewState: TagListViewState = {
  direction: "asc",
  namespaceFirst: false,
  filterMode: "all",
};

const standaloneWindowClass = "h-full min-h-0 min-w-0 bg-(--bg)";
const emptyPageClass =
  "grid h-full min-h-0 min-w-0 place-items-center bg-(--panel) text-(--muted)";
const menuButtonClass =
  "h-full min-w-12 cursor-default border-0 bg-transparent px-3 text-[11px] hover:bg-(--panel-strong)";
const activeMenuButtonClass = `${menuButtonClass} bg-(--panel-strong)`;
const menuDropdownClass =
  "absolute left-0 top-full z-10 min-w-[132px] border border-(--line-strong) bg-(--panel) p-1 [&>button]:h-[26px] [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2.5 [&>button]:text-left [&>button]:text-[11px] [&>button:disabled]:text-(--disabled-ink) [&>button:hover:not(:disabled)]:bg-(--accent-weak)";
const pageTabClass =
  "group relative flex h-[30px] min-w-[132px] max-w-[220px] items-stretch border-r border-(--line) bg-transparent text-(--muted)";
const activePageTabClass = `group bg-(--panel) text-(--ink) relative flex h-[30px] min-w-[132px] max-w-[220px] items-stretch border-r border-(--line)`;
const pageTabTitleClass =
  "min-w-0 flex-1 cursor-default overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent px-2 pr-7 text-left text-[11px] text-inherit";
const pageTabCloseClass = "page-tab-close";
const contextMenuClass =
  "fixed z-30 w-[142px] border border-(--line-strong) bg-(--panel) p-1 [&>button]:block [&>button]:h-6 [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-left [&>button]:text-[11px] [&>button]:text-(--ink) [&>button:hover]:bg-(--accent-weak)";
const contextMenuRenameClass =
  "grid grid-cols-[minmax(0,1fr)_48px] gap-1 [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>input]:outline-0 [&>input::placeholder]:text-(--disabled-ink)";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function getPageTitle(pageNumber: number, t: TranslationFunction): string {
  return t("app.pageName", { index: pageNumber });
}

function getPageNumber(pageId: string): number {
  return Number(pageId.match(/^page-(\d+)$/)?.[1] ?? 0);
}

function isDefaultPageTitle(title: string, pageNumber: number): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  return (
    normalizedTitle === `页面 ${pageNumber}`.toLowerCase() ||
    normalizedTitle === `page ${pageNumber}`.toLowerCase()
  );
}

function inferPageTitleMode(title: string, pageId: string): PageTitleMode {
  const pageNumber = getPageNumber(pageId);

  return pageNumber > 0 && isDefaultPageTitle(title, pageNumber)
    ? "default"
    : "custom";
}

function isViewComponent(value: unknown): value is ViewComponent {
  return (
    value === "empty-page" ||
    value === "file-import" ||
    value === "file-browser" ||
    value === "search" ||
    value === "tag-list"
  );
}

function getViewTabTitle(
  component: ViewComponent,
  t: TranslationFunction,
): string {
  if (component === "empty-page") {
    return t("app.emptyPage");
  }

  if (component === "file-import") {
    return t("app.action.import");
  }

  if (component === "file-browser") {
    return t("app.action.browser");
  }

  if (component === "search") {
    return t("app.action.search");
  }

  return t("app.action.tags");
}

function syncViewTabTitles(
  page: PageItem,
  t: TranslationFunction,
): PageItem {
  const renames: Array<{ id: string; title: string }> = [];

  page.model.visitNodes((node) => {
    if (node.getType() !== "tab" || !(node instanceof TabNode)) {
      return;
    }

    const component = node.getComponent();

    if (!isViewComponent(component)) {
      return;
    }

    const title = getViewTabTitle(component, t);

    if (node.getName() !== title) {
      renames.push({ id: node.getId(), title });
    }
  });

  for (const rename of renames) {
    page.model.doAction(Actions.renameTab(rename.id, rename.title));
  }

  return renames.length > 0 ? { ...page } : page;
}

function createPageModel(templateText = defaultPageTemplateText): Model {
  try {
    return Model.fromJson(parse(templateText) as IJsonModel);
  } catch {
    return Model.fromJson(parse(defaultPageTemplateText) as IJsonModel);
  }
}

function createIdleProgress(t: TranslationFunction): ImportProgress {
  return {
    phase: "idle",
    batchId: null,
    total: 0,
    processed: 0,
    imported: 0,
    duplicated: 0,
    failed: 0,
    chunkIndex: 0,
    chunkTotal: 0,
    currentFile: null,
    message: t("app.status.waitingImport"),
  };
}

function createIdleWorkStatus(t: TranslationFunction): WorkStatus {
  return {
    active: false,
    message: t("app.status.ready"),
    queued: 0,
    processing: 0,
    completed: 0,
  };
}

function StandaloneWindowFrame({
  children,
  title,
}: {
  children: JSX.Element;
  title: string;
}): JSX.Element {
  useWindowTitle(title);

  return <main className={standaloneWindowClass}>{children}</main>;
}

function createViewTab(
  component: OpenableViewComponent,
  viewId: number,
  t: TranslationFunction,
): Record<string, string> {
  return {
    type: "tab",
    id: `view-${component}-${viewId}`,
    name: getViewTabTitle(component, t),
    component,
  };
}

function findFirstTabsetId(model: Model): string | null {
  let tabsetId: string | null = null;

  model.visitNodes((node) => {
    if (!tabsetId && node.getType() === "tabset") {
      tabsetId = node.getId();
    }
  });

  return tabsetId;
}

export function App(): JSX.Element {
  const { t } = useLanguage();
  const query = new URLSearchParams(window.location.search);
  const windowMode = query.get("window");
  useStandaloneWindowShortcuts({ enabled: Boolean(windowMode) });

  if (windowMode === "database-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.viewDatabase")}>
        <DatabaseManagerView />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "file-detail") {
    return (
      <StandaloneWindowFrame title={t("window.fileDetail.title")}>
        <FileDetailWindow fileId={Number(query.get("id"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "screening") {
    return (
      <StandaloneWindowFrame title={t("window.screening.title")}>
        <ScreeningDetailWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "settings") {
    return (
      <StandaloneWindowFrame title={t("app.action.settings")}>
        <SettingsWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.manageTags")}>
        <TagManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "recycle-bin") {
    return (
      <StandaloneWindowFrame title={t("app.action.recycleBin")}>
        <RecycleBinWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "rating-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.rating")}>
        <RatingManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "api-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.api")}>
        <ApiManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "hydrus-import") {
    return (
      <StandaloneWindowFrame title={t("app.action.hydrusImport")}>
        <HydrusImportWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "ehentai-import") {
    return (
      <StandaloneWindowFrame title={t("app.action.ehentaiImport")}>
        <EHentaiImportWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "ai-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.ai")}>
        <AiManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-translation") {
    return (
      <StandaloneWindowFrame title={t("app.action.tagTranslation")}>
        <TagTranslationWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "favorites") {
    return (
      <StandaloneWindowFrame title={t("app.action.favorites")}>
        <FavoritesWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "url-manager") {
    return (
      <StandaloneWindowFrame title={t("window.url.title")}>
        <UrlManagerWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "batch-tag-manager") {
    return (
      <StandaloneWindowFrame title={t("window.batchTagManager.title")}>
        <BatchTagManagerWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "batch-operation") {
    return (
      <main className={standaloneWindowClass}>
        <BatchOperationWindow fileIds={parseIdList(query.get("ids"))} />
      </main>
    );
  }

  if (windowMode === "file-rating-editor") {
    return (
      <StandaloneWindowFrame title={t("window.fileRatingEditor.title")}>
        <FileRatingEditorWindow
          fileIds={parseIdList(query.get("ids"))}
          groupId={Number(query.get("groupId"))}
        />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "export") {
    return (
      <StandaloneWindowFrame title={t("common.export")}>
        <ExportWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "dialog") {
    return (
      <main className={standaloneWindowClass}>
        <DialogWindow dialogId={query.get("dialogId") ?? ""} />
      </main>
    );
  }

  return <WorkbenchApp />;
}

function WorkbenchApp(): JSX.Element {
  const { languageId, t } = useLanguage();
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>(() =>
    createIdleProgress(t),
  );
  const [workStatus, setWorkStatus] = useState<WorkStatus>(() =>
    createIdleWorkStatus(t),
  );
  const [pages, setPages] = useState<PageItem[]>(() => [
    {
      id: "page-1",
      title: t("app.pageName", { index: 1 }),
      titleMode: "default",
      model: createPageModel(),
      searchFilters: [],
      searchInputState: emptySearchInputState,
      searchAppendTagRequest: null,
      viewRefreshSequenceByTabId: {},
      importQueueActive: false,
      selectedBrowserFileIds: [],
      browserViewState: defaultBrowserViewState,
      tagListViewState: defaultTagListViewState,
    },
  ]);
  const [pageTemplateText, setPageTemplateText] = useState({
    default: defaultPageTemplateText,
    newPage: defaultPageTemplateText,
  });
  const [pageLayoutSettings, setPageLayoutSettings] =
    useState<PageLayoutSettings>({
      defaultConfigId: null,
      newPageConfigId: null,
    });
  const [workbenchLoaded, setWorkbenchLoaded] = useState(false);
  const [viewContextMenu, setViewContextMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
    tabId: string;
  } | null>(null);
  const [pageContextMenu, setPageContextMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
    title: string;
    renaming: boolean;
  } | null>(null);
  const [activePageId, setActivePageId] = useState("page-1");
  const [, refreshLayout] = useReducer((value: number) => value + 1, 0);
  const pageCounterRef = useRef(2);
  const viewCounterRef = useRef(1);
  const searchAppendCounterRef = useRef(1);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef(pages);
  const activePageIdRef = useRef(activePageId);
  const activePage = pages.find((page) => page.id === activePageId) ?? null;

  const percent = useMemo(() => {
    if (progress.total === 0) {
      return 0;
    }

    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress.processed, progress.total]);

  const isImporting =
    progress.phase === "selecting" || progress.phase === "importing";

  useEffect(() => {
    setProgress((current) =>
      current.phase === "idle" ? createIdleProgress(t) : current,
    );
    setWorkStatus((current) =>
      current.active ? current : createIdleWorkStatus(t),
    );
  }, [languageId, t]);

  useEffect(() => {
    setPages((currentPages) => {
      let changed = false;
      const nextPages = currentPages.map((page) => {
        let nextPage = page;

        if (page.titleMode !== "default") {
          const syncedPage = syncViewTabTitles(nextPage, t);
          changed = changed || syncedPage !== nextPage;
          return syncedPage;
        }

        const nextTitle = getPageTitle(getPageNumber(page.id), t);

        if (page.title !== nextTitle) {
          changed = true;
          nextPage = { ...page, title: nextTitle };
        }

        const syncedPage = syncViewTabTitles(nextPage, t);
        changed = changed || syncedPage !== nextPage;
        return syncedPage;
      });

      return changed ? nextPages : currentPages;
    });
  }, [languageId, t]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    void initializeWorkbench();

    function saveBeforeClose(): void {
      saveWorkbenchState();
    }

    window.addEventListener("beforeunload", saveBeforeClose);

    return () => {
      window.removeEventListener("beforeunload", saveBeforeClose);
    };
  }, []);

  useEffect(
    () =>
      listenThemeSettingsChanged((settings) => {
        applyTheme(settings.themeId);
      }),
    [],
  );

  useEffect(
    () =>
      listenLanguageSettingsChanged((settings) => {
        applyLanguage(settings.languageId);
      }),
    [],
  );

  useEffect(() => {
    if (workbenchLoaded) {
      saveWorkbenchState();
    }
  }, [pages, activePageId, workbenchLoaded]);

  useEffect(() => {
    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return undefined;
    }

    return window.asteria.onImportProgress((nextProgress) => {
      setProgress(nextProgress);
    });
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    void window.asteria.getWorkStatus().then(setWorkStatus);

    return window.asteria.onWorkStatusChanged((nextStatus) => {
      setWorkStatus(nextStatus);
    });
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onImportQueueChanged(() => {
      void syncImportQueueLockFromMain();
    });
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onPageLayoutChanged(() => {
      void reloadPageLayoutState();
    });
  }, []);

  useEffect(() => {
    function closeMenu(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }

      if (
        !(event.target as Element | null)?.closest(".view-tab-context-menu")
      ) {
        setViewContextMenu(null);
      }

      if (
        !(event.target as Element | null)?.closest(".page-tab-context-menu")
      ) {
        setPageContextMenu(null);
      }
    }

    window.addEventListener("mousedown", closeMenu);

    return () => {
      window.removeEventListener("mousedown", closeMenu);
    };
  }, []);

  async function initializeWorkbench(): Promise<void> {
    const pageLayoutState = await loadPageLayoutState();
    setPageTemplateText(pageLayoutState.templateText);
    setPageLayoutSettings(pageLayoutState.settings);

    const savedState = readSavedWorkbenchState();
    const hasImportQueue = window.asteria
      ? (await window.asteria.listImportQueueFiles()).length > 0
      : false;

    if (savedState && savedState.pages.length > 0) {
      const restoredPages = savedState.pages.map((page, index) => {
        const restoredPage: PageItem = {
          id: page.id,
          title:
            page.titleMode === "default"
              ? getPageTitle(getPageNumber(page.id), t)
              : page.title,
          titleMode: page.titleMode,
          model: Model.fromJson(page.modelJson),
          searchFilters: page.searchFilters,
          searchInputState: page.searchInputState,
          searchAppendTagRequest: null,
          viewRefreshSequenceByTabId: {},
          importQueueActive:
            page.importQueueActive ||
            (hasImportQueue &&
              (page.id === savedState.activePageId ||
                (!savedState.activePageId && index === 0))),
          selectedBrowserFileIds: [],
          browserViewState: page.browserViewState,
          tagListViewState: page.tagListViewState,
        };

        return syncViewTabTitles(restoredPage, t);
      });

      setPages(restoredPages);
      setActivePageId(
        restoredPages.some((page) => page.id === savedState.activePageId)
          ? savedState.activePageId
          : (restoredPages[0]?.id ?? ""),
      );
      syncCountersFromPages(restoredPages);
    } else {
      const page = createPageItemFromTemplate(
        1,
        t("app.pageName", { index: 1 }),
        pageLayoutState.templateText.default,
      );
      page.importQueueActive = hasImportQueue;
      setPages([page]);
      setActivePageId(page.id);
      pageCounterRef.current = 2;
      syncCountersFromPages([page]);
    }

    setWorkbenchLoaded(true);
  }

  async function reloadPageLayoutState(): Promise<void> {
    const pageLayoutState = await loadPageLayoutState();
    setPageTemplateText(pageLayoutState.templateText);
    setPageLayoutSettings(pageLayoutState.settings);
  }

  async function loadPageLayoutState(): Promise<{
    settings: PageLayoutSettings;
    templateText: { default: string; newPage: string };
  }> {
    let defaultTemplate = defaultPageTemplateText;
    let newPageTemplate = defaultPageTemplateText;
    let settings: PageLayoutSettings = {
      defaultConfigId: null,
      newPageConfigId: null,
    };

    if (window.asteria) {
      try {
        const [loadedSettings, loadedDefaultTemplate, loadedNewPageTemplate] =
          await Promise.all([
            window.asteria.getPageLayoutSettings(),
            window.asteria.getPageLayoutTemplate("default"),
            window.asteria.getPageLayoutTemplate("newPage"),
          ]);
        settings = loadedSettings;
        defaultTemplate = loadedDefaultTemplate;
        newPageTemplate = loadedNewPageTemplate;
      } catch {
        defaultTemplate = defaultPageTemplateText;
        newPageTemplate = defaultPageTemplateText;
      }
    }

    return {
      settings,
      templateText: {
        default: defaultTemplate,
        newPage: newPageTemplate,
      },
    };
  }

  async function syncImportQueueLockFromMain(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const hasImportQueue =
      (await window.asteria.listImportQueueFiles()).length > 0;

    if (!hasImportQueue) {
      setPages((currentPages) =>
        currentPages.map((page) => ({ ...page, importQueueActive: false })),
      );
    }
  }

  async function startFileImport(): Promise<void> {
    setOpenMenu(null);
    const importPage = openImportView();

    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return;
    }

    if (isImporting) {
      return;
    }

    setProgress({
      ...createIdleProgress(t),
      phase: "selecting",
      message: t("app.status.waitingSelectFiles"),
    });

    try {
      const result = await window.asteria.importFiles();
      setProgress(result);
      await activateImportQueuePreview(importPage);
    } catch (error) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("app.status.importFailed"),
      });
    }
  }

  async function startFolderImport(): Promise<void> {
    setOpenMenu(null);
    const importPage = openImportView();

    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return;
    }

    if (isImporting) {
      return;
    }

    setProgress({
      ...createIdleProgress(t),
      phase: "selecting",
      message: t("app.status.waitingSelectFolder"),
    });

    try {
      const result = await window.asteria.importFolder();
      setProgress(result);
      await activateImportQueuePreview(importPage);
    } catch (error) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("app.status.importFailed"),
      });
    }
  }

  async function importDroppedData(
    dataTransfer: DataTransfer,
    importPage: PageItem | null,
  ): Promise<void> {
    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return;
    }

    if (isImporting) {
      return;
    }

    const droppedData = readDroppedImportData(dataTransfer);
    const paths = droppedData.files
      .map((file) => window.asteria.getPathForFile(file))
      .filter((path) => path.length > 0);
    const urls = droppedData.urls;

    if (paths.length === 0 && urls.length === 0) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.noDroppedPathOrUrl"),
      });
      return;
    }

    setProgress({
      ...createIdleProgress(t),
      phase: "importing",
      message: t("app.status.scanDroppedContent"),
    });

    try {
      let result: ImportProgress | null = null;

      if (paths.length > 0) {
        result = await window.asteria.importPaths(paths);
      }

      if (urls.length > 0) {
        result = await window.asteria.importUrls(urls);
      }

      if (!result) {
        return;
      }

      setProgress(result);
      await activateImportQueuePreview(importPage);
    } catch (error) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("app.status.importFailed"),
      });
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault();

    if (!isImporting) {
      setDragActive(true);
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault();
    setDragActive(false);
    const importPage = openImportView();
    void importDroppedData(event.dataTransfer, importPage);
  }

  async function openDatabaseManager(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openDatabaseManagerWindow();
  }

  async function openTagManager(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openTagManagerWindow();
  }

  async function openRecycleBin(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openRecycleBinWindow();
  }

  async function openSettings(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openSettingsWindow();
  }

  async function openRatingManager(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openRatingManagerWindow();
  }

  async function openApiManager(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openApiManagerWindow();
  }

  async function openFavorites(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openFavoritesWindow();
  }

  async function openHydrusImport(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openHydrusImportWindow();
  }

  async function openEHentaiImport(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openEHentaiImportWindow();
  }

  async function openAiManager(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openAiManagerWindow();
  }

  async function openTagTranslation(): Promise<void> {
    setOpenMenu(null);
    await window.asteria?.openTagTranslationWindow();
  }

  function openBrowser(): void {
    setOpenMenu(null);
    openView("file-browser");
  }

  function openSearch(): void {
    setOpenMenu(null);
    openView("search");
  }

  function openTagList(): void {
    setOpenMenu(null);
    openView("tag-list");
  }

  function openFileImportView(): void {
    setOpenMenu(null);
    openImportView();
  }

  function createPage(): void {
    const page = createPageItem();

    setOpenMenu(null);
    setPages((currentPages) => [...currentPages, page]);
    setActivePageId(page.id);
  }

  async function saveActivePageLayout(): Promise<void> {
    if (!activePage || !window.asteria) {
      return;
    }

    const layoutJson = JSON.stringify(activePage.model.toJson(), null, 2);
    await window.asteria.savePageLayoutConfig(activePage.title, layoutJson);
  }

  function closePage(
    pageId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ): void {
    event.stopPropagation();
    closePageById(pageId);
  }

  function closePageById(pageId: string): void {
    setPageContextMenu(null);
    setPages((currentPages) => {
      const closingIndex = currentPages.findIndex((page) => page.id === pageId);
      const nextPages = currentPages.filter((page) => page.id !== pageId);

      if (activePageId === pageId) {
        const nextActivePage =
          nextPages[Math.min(closingIndex, nextPages.length - 1)] ?? null;
        setActivePageId(nextActivePage?.id ?? "");
      }

      return nextPages;
    });
  }

  function handlePageTabMouseDown(
    event: React.MouseEvent<HTMLDivElement>,
    pageId: string,
  ): void {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closePageById(pageId);
  }

  function openPageTabContextMenu(
    event: React.MouseEvent<HTMLElement>,
    page: PageItem,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenu(null);
    setViewContextMenu(null);
    setPageContextMenu({
      x: event.clientX,
      y: event.clientY,
      pageId: page.id,
      title: page.title,
      renaming: false,
    });
  }

  function renamePage(pageId: string, title: string): void {
    if (!savePageTitle(pageId, title)) {
      return;
    }

    setPageContextMenu(null);
  }

  function savePageTitle(pageId: string, title: string): boolean {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return false;
    }

    setPages((currentPages) =>
      currentPages.map((page) =>
        page.id === pageId
          ? { ...page, title: nextTitle, titleMode: "custom" }
          : page,
      ),
    );

    return true;
  }

  function getOrCreateActivePage(): PageItem {
    if (activePage) {
      return activePage;
    }

    const page = createPageItem();
    setPages((currentPages) => [...currentPages, page]);
    setActivePageId(page.id);
    return page;
  }

  function createPageItem(): PageItem {
    const pageNumber = pageCounterRef.current;
    pageCounterRef.current += 1;

    return createPageItemFromTemplate(
      pageNumber,
      t("app.pageName", { index: pageNumber }),
      pageTemplateText.newPage,
    );
  }

  function createImportPage(): PageItem {
    const pageNumber = pageCounterRef.current;
    pageCounterRef.current += 1;

    return createPageItemFromTemplate(
      pageNumber,
      t("app.pageName", { index: pageNumber }),
      pageTemplateText.default,
    );
  }

  function createPageItemFromTemplate(
    pageNumber: number,
    title: string,
    templateText: string,
    titleMode: PageTitleMode = "default",
  ): PageItem {
    const page: PageItem = {
      id: `page-${pageNumber}`,
      title,
      titleMode,
      model: createPageModel(templateText),
      searchFilters: [],
      searchInputState: emptySearchInputState,
      searchAppendTagRequest: null,
      viewRefreshSequenceByTabId: {},
      importQueueActive: false,
      selectedBrowserFileIds: [],
      browserViewState: defaultBrowserViewState,
      tagListViewState: defaultTagListViewState,
    };

    return syncViewTabTitles(page, t);
  }

  function openView(component: OpenableViewComponent): void {
    openViewOnPage(getOrCreateActivePage(), component);
  }

  function openViewOnPage(
    page: PageItem,
    component: OpenableViewComponent,
  ): void {
    const existingTabId = findViewTabId(page.model, component);

    if (existingTabId) {
      page.model.doAction(Actions.selectTab(existingTabId));
      refreshLayout();
      return;
    }

    let targetTabsetId = findFirstTabsetId(page.model);

    if (!targetTabsetId) {
      const resetPage = {
        ...page,
        model: createPageModel(pageTemplateText.newPage),
      };

      page = resetPage;
      targetTabsetId = findFirstTabsetId(resetPage.model);
      setPages((currentPages) =>
        currentPages.map((currentPage) =>
          currentPage.id === resetPage.id ? resetPage : currentPage,
        ),
      );
    }

    if (!targetTabsetId) {
      return;
    }

    const viewId = viewCounterRef.current;
    viewCounterRef.current += 1;
    const tab = createViewTab(component, viewId, t);

    page.model.doAction(
      Actions.addNode(tab, targetTabsetId, DockLocation.CENTER, -1, true),
    );
    page.model.doAction(Actions.deleteTab("view-placeholder"));
    refreshLayout();
  }

  function openImportView(): PageItem {
    if (pageLayoutSettings.defaultConfigId) {
      const page = createImportPage();
      setPages((currentPages) => [...currentPages, page]);
      setActivePageId(page.id);
      openViewOnPage(page, "file-import");
      return page;
    }

    const page = getOrCreateActivePage();
    openViewOnPage(page, "file-import");
    return page;
  }

  async function activateImportQueuePreview(
    page: PageItem | null,
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const queueFiles = await window.asteria.listImportQueueFiles();

    if (queueFiles.length === 0) {
      return;
    }

    const targetPage = page ?? getOrCreateActivePage();
    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === targetPage.id
          ? { ...currentPage, importQueueActive: true, searchFilters: [] }
          : currentPage,
      ),
    );
    openViewOnPage(targetPage, "file-browser");
  }

  async function commitImportQueueFromActivePage(
    queueFiles: ImportQueueFileRecord[],
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const confirmedDuplicateIds: number[] = [];

    for (const file of queueFiles) {
      if (!file.duplicate) {
        continue;
      }

      const confirmed = await window.asteria.confirmDialog({
        title: t("app.status.duplicateConfirmTitle"),
        message: t("app.status.duplicateConfirmMessage", {
          domainName: file.duplicate.domainName,
        }),
      });

      if (confirmed) {
        confirmedDuplicateIds.push(file.id);
      }
    }

    const result = await window.asteria.commitImportQueue(
      queueFiles.map((file) => file.id),
      confirmedDuplicateIds,
    );
    setProgress(result);

    if (result.remainingQueue.length === 0) {
      deactivateActivePageImportQueue();
    }
  }

  async function cancelImportQueueFromActivePage(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const wasImporting = progress.phase === "importing";
    const result = await window.asteria.clearImportQueue();
    setProgress(result);

    if (!wasImporting) {
      deactivateActivePageImportQueue();
    }
  }

  function deactivateActivePageImportQueue(): void {
    if (!activePage) {
      return;
    }

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === activePage.id
          ? { ...currentPage, importQueueActive: false }
          : currentPage,
      ),
    );
  }

  function pageHasView(
    page: PageItem,
    component: OpenableViewComponent,
  ): boolean {
    return findViewTabId(page.model, component) !== null;
  }

  function findViewTabId(
    model: Model,
    component: OpenableViewComponent,
  ): string | null {
    let tabId: string | null = null;

    model.visitNodes((node) => {
      if (
        !tabId &&
        node.getType() === "tab" &&
        node instanceof TabNode &&
        node.getComponent() === component
      ) {
        tabId = node.getId();
      }
    });

    return tabId;
  }

  function addActivePageSearchFilter(tokens: SearchInputToken[]): void {
    const page = getOrCreateActivePage();
    const normalizedTokens = normalizeSearchInputTokens(tokens);

    if (
      page.importQueueActive ||
      !normalizedTokens.some((token) => token.kind === "tag")
    ) {
      return;
    }

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === page.id
          ? {
              ...currentPage,
              searchFilters: [
                ...currentPage.searchFilters,
                { tokens: normalizedTokens },
              ],
            }
          : currentPage,
      ),
    );

    if (!pageHasView(page, "file-browser")) {
      openView("file-browser");
    }
  }

  function removeActivePageSearchFilters(indexes: number[]): void {
    if (!activePage) {
      return;
    }

    const removingIndexes = new Set(indexes);

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === activePage.id
          ? {
              ...currentPage,
              searchFilters: currentPage.searchFilters.filter(
                (_, currentIndex) => !removingIndexes.has(currentIndex),
              ),
            }
          : currentPage,
      ),
    );
  }

  function updateActivePageSearchInput(state: SearchInputState): void {
    if (!activePage) {
      return;
    }

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === activePage.id
          ? { ...currentPage, searchInputState: state }
          : currentPage,
      ),
    );
  }

  function updateActivePageBrowserSelection(fileIds: number[]): void {
    if (!activePage) {
      return;
    }

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === activePage.id
          ? { ...currentPage, selectedBrowserFileIds: fileIds }
          : currentPage,
      ),
    );
  }

  function updateActivePageBrowserViewState(state: BrowserViewState): void {
    if (!activePage) {
      return;
    }

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === activePage.id
          ? { ...currentPage, browserViewState: state }
          : currentPage,
      ),
    );
  }

  function updateActivePageTagListViewState(state: TagListViewState): void {
    if (!activePage) {
      return;
    }

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === activePage.id
          ? { ...currentPage, tagListViewState: state }
          : currentPage,
      ),
    );
  }

  function appendTagToActivePageSearch(tag: TagRecord): void {
    const page = getOrCreateActivePage();

    if (page.importQueueActive) {
      openView("search");
      return;
    }

    const nextRequest = {
      sequence: searchAppendCounterRef.current,
      tag,
    };
    searchAppendCounterRef.current += 1;

    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === page.id
          ? { ...currentPage, searchAppendTagRequest: nextRequest }
          : currentPage,
      ),
    );
    openView("search");
  }

  function openViewTabContextMenu(
    node: unknown,
    event: React.MouseEvent<HTMLElement>,
  ): void {
    const candidate = node as { getType?: () => string; getId?: () => string };

    if (candidate.getType?.() !== "tab" || !candidate.getId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setOpenMenu(null);
    setViewContextMenu({
      x: event.clientX,
      y: event.clientY,
      pageId: activePageId,
      tabId: candidate.getId(),
    });
  }

  function refreshViewTab(pageId: string, tabId: string): void {
    setViewContextMenu(null);
    setPages((currentPages) =>
      currentPages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }

        return {
          ...page,
          viewRefreshSequenceByTabId: {
            ...page.viewRefreshSequenceByTabId,
            [tabId]: (page.viewRefreshSequenceByTabId[tabId] ?? 0) + 1,
          },
        };
      }),
    );
  }

  function saveWorkbenchState(): void {
    const state: SavedWorkbenchState = {
      activePageId: activePageIdRef.current,
      pages: pagesRef.current.map((page) => ({
        id: page.id,
        title: page.title,
        titleMode: page.titleMode,
        modelJson: page.model.toJson(),
        searchFilters: page.searchFilters,
        searchInputState: page.searchInputState,
        importQueueActive: page.importQueueActive,
        browserViewState: page.browserViewState,
        tagListViewState: page.tagListViewState,
      })),
    };

    window.localStorage.setItem(WORKBENCH_STATE_KEY, JSON.stringify(state));
  }

  function readSavedWorkbenchState(): SavedWorkbenchState | null {
    const rawState = window.localStorage.getItem(WORKBENCH_STATE_KEY);

    if (!rawState) {
      return null;
    }

    try {
      const state = JSON.parse(rawState) as Partial<SavedWorkbenchState>;

      if (!Array.isArray(state.pages)) {
        return null;
      }

      return {
        activePageId:
          typeof state.activePageId === "string" ? state.activePageId : "",
        pages: state.pages
          .map((page) => normalizeSavedPage(page))
          .filter((page): page is SavedPageItem => page !== null),
      };
    } catch {
      return null;
    }
  }

  function normalizeSavedPage(value: unknown): SavedPageItem | null {
    const page = value as
      | (Partial<SavedPageItem> & { searchQuery?: unknown })
      | null;

    if (
      !page ||
      typeof page.id !== "string" ||
      typeof page.title !== "string" ||
      !page.modelJson
    ) {
      return null;
    }

    const searchInputState = page.searchInputState;

    return {
      id: page.id,
      title: page.title,
      titleMode:
        page.titleMode === "default" || page.titleMode === "custom"
          ? page.titleMode
          : inferPageTitleMode(page.title, page.id),
      modelJson: page.modelJson,
      searchFilters: normalizeSearchFilters(
        page.searchFilters,
        page.searchQuery,
      ),
      searchInputState:
        searchInputState &&
        Array.isArray(searchInputState.tokens) &&
        typeof searchInputState.text === "string"
          ? searchInputState
          : emptySearchInputState,
      importQueueActive: page.importQueueActive === true,
      browserViewState: normalizeBrowserViewState(page.browserViewState),
      tagListViewState: normalizeTagListViewState(page.tagListViewState),
    };
  }

  function normalizeSearchFilters(
    filters: unknown,
    legacyQuery: unknown,
  ): SearchFilter[] {
    if (Array.isArray(filters)) {
      return filters
        .map(normalizeSearchFilter)
        .filter((filter): filter is SearchFilter => filter !== null);
    }

    return typeof legacyQuery === "string" && legacyQuery.trim() ? [] : [];
  }

  function normalizeSearchFilter(value: unknown): SearchFilter | null {
    if (typeof value === "string") {
      return null;
    }

    const filter = value as Partial<SearchFilter> | null;

    if (!filter || !Array.isArray(filter.tokens)) {
      return null;
    }

    const tokens = normalizeSearchInputTokens(filter.tokens);

    return tokens.some((token) => token.kind === "tag") ? { tokens } : null;
  }

  function normalizeSearchInputTokens(
    tokens: SearchInputToken[],
  ): SearchInputToken[] {
    return tokens
      .map((token): SearchInputToken | null => {
        if (token.kind === "operator" && isSearchOperator(token.value)) {
          return { kind: "operator", value: token.value };
        }

        if (token.kind === "tag") {
          return { kind: "tag", token: token.token };
        }

        return null;
      })
      .filter((token): token is SearchInputToken => token !== null);
  }

  function isSearchOperator(value: unknown): value is SearchOperator {
    return (
      value === "+" ||
      value === "-" ||
      value === "/" ||
      value === "(" ||
      value === ")"
    );
  }

  function buildCombinedSearchQuery(filters: SearchFilter[]): string {
    return filters
      .map((filter) => buildSearchExpression(filter.tokens, ""))
      .filter((filter) => filter.trim().length > 0)
      .map((filter) => `(${filter})`)
      .join("+");
  }

  function normalizeBrowserViewState(value: unknown): BrowserViewState {
    const state = value as Partial<BrowserViewState> | null;
    const sortKey: BrowserSortKey =
      state?.sortKey === "updatedAt" || state?.sortKey === "importedAt"
        ? state.sortKey
        : defaultBrowserViewState.sortKey;
    const sortDirection: BrowserSortDirection =
      state?.sortDirection === "asc" || state?.sortDirection === "desc"
        ? state.sortDirection
        : defaultBrowserViewState.sortDirection;

    return { sortKey, sortDirection };
  }

  function normalizeTagListViewState(value: unknown): TagListViewState {
    const state = value as Partial<TagListViewState> | null;
    const direction: SortDirection =
      state?.direction === "asc" || state?.direction === "desc"
        ? state.direction
        : defaultTagListViewState.direction;
    const filterMode: TagListFilterMode =
      state?.filterMode === "all" ||
      state?.filterMode === "namespace" ||
      state?.filterMode === "plain" ||
      state?.filterMode === "selection"
        ? state.filterMode
        : defaultTagListViewState.filterMode;

    return {
      direction,
      filterMode,
      namespaceFirst: state?.namespaceFirst === true,
    };
  }

  function syncCountersFromPages(nextPages: PageItem[]): void {
    let maxPageNumber = 1;
    let maxViewNumber = 0;

    for (const page of nextPages) {
      const pageNumber = Number(page.id.match(/^page-(\d+)$/)?.[1] ?? 0);
      maxPageNumber = Math.max(maxPageNumber, pageNumber);

      page.model.visitNodes((node) => {
        if (node.getType() !== "tab") {
          return;
        }

        const viewNumber = Number(
          node.getId().match(/^view-[^-]+(?:-[^-]+)*-(\d+)$/)?.[1] ?? 0,
        );
        maxViewNumber = Math.max(maxViewNumber, viewNumber);
      });
    }

    pageCounterRef.current = maxPageNumber + 1;
    viewCounterRef.current = maxViewNumber + 1;
  }

  function viewFactory(node: TabNode): JSX.Element {
    const component = node.getComponent() as ViewComponent;
    const refreshSequence =
      activePage?.viewRefreshSequenceByTabId[node.getId()] ?? 0;

    if (component === "empty-page") {
      return <section className={emptyPageClass}>{t("app.emptyPage")}</section>;
    }

    if (component === "file-import") {
      return (
        <ImportView
          dragActive={dragActive}
          percent={percent}
          progress={progress}
          onCancelQueue={() => void cancelImportQueueFromActivePage()}
          onCommitQueue={(queueFiles) =>
            void commitImportQueueFromActivePage(queueFiles)
          }
        />
      );
    }

    if (component === "file-browser") {
      return (
        <FileBrowserView
          importQueueMode={Boolean(activePage?.importQueueActive)}
          refreshSequence={refreshSequence}
          searchQuery={buildCombinedSearchQuery(
            activePage?.searchFilters ?? [],
          )}
          state={activePage?.browserViewState ?? defaultBrowserViewState}
          onImportQueueEmpty={deactivateActivePageImportQueue}
          onSelectionChange={updateActivePageBrowserSelection}
          onStateChange={updateActivePageBrowserViewState}
        />
      );
    }

    if (component === "search") {
      return (
        <SearchView
          appendTagRequest={activePage?.searchAppendTagRequest ?? null}
          inputState={activePage?.searchInputState ?? emptySearchInputState}
          refreshSequence={refreshSequence}
          filters={activePage?.searchFilters ?? []}
          onInputStateChange={updateActivePageSearchInput}
          onRemoveFilters={removeActivePageSearchFilters}
          onSearch={addActivePageSearchFilter}
          locked={Boolean(activePage?.importQueueActive)}
        />
      );
    }

    if (component === "tag-list") {
      return (
        <TagListView
          locked={Boolean(activePage?.importQueueActive)}
          refreshSequence={refreshSequence}
          selectedFileIds={activePage?.selectedBrowserFileIds ?? []}
          state={activePage?.tagListViewState ?? defaultTagListViewState}
          onAppendSearchTag={appendTagToActivePageSearch}
          onStateChange={updateActivePageTagListViewState}
        />
      );
    }

    return (
      <div className="grid h-full place-items-center text-(--muted)">
        {t("app.unknownView")}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[620px] min-w-[920px] grid-rows-[28px_30px_minmax(0,1fr)_20px]">
      <header className="flex items-stretch border-b border-(--line) bg-(--app-bar-bg)">
        <div className="flex" ref={menuRef}>
          <div className="relative">
            <button
              className={
                openMenu === "file" ? activeMenuButtonClass : menuButtonClass
              }
              type="button"
              onClick={() =>
                setOpenMenu((menu) => (menu === "file" ? null : "file"))
              }
            >
              {t("app.menu.file")}
            </button>

            {openMenu === "file" ? (
              <div className={menuDropdownClass}>
                <button
                  disabled={isImporting}
                  title={t("app.action.importFilesTitle")}
                  type="button"
                  onClick={startFileImport}
                >
                  {t("app.action.importFiles")}
                </button>
                <button
                  disabled={isImporting}
                  title={t("app.action.importFolderTitle")}
                  type="button"
                  onClick={startFolderImport}
                >
                  {t("app.action.importFolder")}
                </button>
                <button type="button" onClick={() => void openSettings()}>
                  {t("app.action.settings")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={
                openMenu === "page" ? activeMenuButtonClass : menuButtonClass
              }
              type="button"
              onClick={() =>
                setOpenMenu((menu) => (menu === "page" ? null : "page"))
              }
            >
              {t("app.menu.page")}
            </button>

            {openMenu === "page" ? (
              <div className={menuDropdownClass}>
                <button type="button" onClick={createPage}>
                  {t("app.action.newPage")}
                </button>
                <ActionFeedbackButton
                  afterFeedback={() => setOpenMenu(null)}
                  disabled={!activePage}
                  label={t("app.action.saveLayout")}
                  onAction={saveActivePageLayout}
                />
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={
                openMenu === "view" ? activeMenuButtonClass : menuButtonClass
              }
              type="button"
              onClick={() =>
                setOpenMenu((menu) => (menu === "view" ? null : "view"))
              }
            >
              {t("app.menu.view")}
            </button>

            {openMenu === "view" ? (
              <div className={menuDropdownClass}>
                <button type="button" onClick={openFileImportView}>
                  {t("app.action.import")}
                </button>
                <button type="button" onClick={openBrowser}>
                  {t("app.action.browser")}
                </button>
                <button type="button" onClick={openSearch}>
                  {t("app.action.search")}
                </button>
                <button type="button" onClick={openTagList}>
                  {t("app.action.tags")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={
                openMenu === "database"
                  ? activeMenuButtonClass
                  : menuButtonClass
              }
              type="button"
              onClick={() =>
                setOpenMenu((menu) => (menu === "database" ? null : "database"))
              }
            >
              {t("app.menu.database")}
            </button>

            {openMenu === "database" ? (
              <div className={menuDropdownClass}>
                <button
                  type="button"
                  onClick={() => void openDatabaseManager()}
                >
                  {t("app.action.viewDatabase")}
                </button>
                <button type="button" onClick={() => void openTagManager()}>
                  {t("app.action.manageTags")}
                </button>
                <button type="button" onClick={() => void openRecycleBin()}>
                  {t("app.action.recycleBin")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={
                openMenu === "service" ? activeMenuButtonClass : menuButtonClass
              }
              type="button"
              onClick={() =>
                setOpenMenu((menu) => (menu === "service" ? null : "service"))
              }
            >
              {t("app.menu.service")}
            </button>

            {openMenu === "service" ? (
              <div className={menuDropdownClass}>
                <button type="button" onClick={() => void openRatingManager()}>
                  {t("app.action.rating")}
                </button>
                <button type="button" onClick={() => void openApiManager()}>
                  API
                </button>
                <button type="button" onClick={() => void openFavorites()}>
                  {t("app.action.favorites")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={
                openMenu === "extension"
                  ? activeMenuButtonClass
                  : menuButtonClass
              }
              type="button"
              onClick={() =>
                setOpenMenu((menu) =>
                  menu === "extension" ? null : "extension",
                )
              }
            >
              {t("app.menu.extension")}
            </button>

            {openMenu === "extension" ? (
              <div className={menuDropdownClass}>
                <button type="button" onClick={() => void openHydrusImport()}>
                  {t("app.action.hydrusImport")}
                </button>
                <button type="button" onClick={() => void openEHentaiImport()}>
                  {t("app.action.ehentaiImport")}
                </button>
                <button type="button" onClick={() => void openAiManager()}>
                  {t("app.action.ai")}
                </button>
                <button type="button" onClick={() => void openTagTranslation()}>
                  {t("app.action.tagTranslation")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav
        className="flex min-w-0 items-stretch border-b border-(--line) bg-(--page-tabbar-bg)"
        aria-label={t("app.pageList")}
      >
        {pages.map((page) => (
          <div
            className={
              page.id === activePageId ? activePageTabClass : pageTabClass
            }
            key={page.id}
            onContextMenu={(event) => openPageTabContextMenu(event, page)}
            onMouseDown={(event) => handlePageTabMouseDown(event, page.id)}
          >
            <button
              className={pageTabTitleClass}
              type="button"
              onClick={() => setActivePageId(page.id)}
            >
              {page.title}
            </button>
            <button
              className={cx(
                pageTabCloseClass,
                page.id === activePageId && "page-tab-close-active",
              )}
              type="button"
              onClick={(event) => closePage(page.id, event)}
              title={t("common.close")}
            >
              ×
            </button>
          </div>
        ))}
      </nav>

      <main
        className={cx(
          "relative min-h-0 min-w-0 bg-(--bg) p-2",
          dragActive &&
            "bg-(--selection-bg) [&_.module-view]:border-(--accent)",
        )}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {activePage ? (
          <Layout
            factory={viewFactory}
            model={activePage.model}
            onContextMenu={openViewTabContextMenu}
            onModelChange={() => saveWorkbenchState()}
          />
        ) : (
          <section className={emptyPageClass}>{t("app.noOpenPage")}</section>
        )}
      </main>

      {viewContextMenu ? (
        <div
          className={`${contextMenuClass} view-tab-context-menu`}
          style={{ left: viewContextMenu.x, top: viewContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() =>
              refreshViewTab(viewContextMenu.pageId, viewContextMenu.tabId)
            }
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}

      {pageContextMenu ? (
        <div
          className={`${contextMenuClass} page-tab-context-menu w-[184px]`}
          style={{ left: pageContextMenu.x, top: pageContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {pageContextMenu.renaming ? (
            <div className={contextMenuRenameClass}>
              <input
                aria-label={t("app.pageNameInput")}
                autoFocus
                placeholder={t("app.pageNamePlaceholder")}
                value={pageContextMenu.title}
                onChange={(event) =>
                  setPageContextMenu((menu) =>
                    menu ? { ...menu, title: event.target.value } : menu,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    renamePage(pageContextMenu.pageId, pageContextMenu.title);
                  }

                  if (event.key === "Escape") {
                    setPageContextMenu(null);
                  }
                }}
              />
              <ActionFeedbackButton
                afterFeedback={() => setPageContextMenu(null)}
                label={t("common.save")}
                onAction={() => {
                  if (
                    !savePageTitle(
                      pageContextMenu.pageId,
                      pageContextMenu.title,
                    )
                  ) {
                    throw new Error(t("app.pageNameEmpty"));
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setPageContextMenu((menu) =>
                  menu ? { ...menu, renaming: true } : menu,
                )
              }
            >
              {t("common.rename")}
            </button>
          )}
        </div>
      ) : null}
      <footer className="flex h-5 min-w-0 items-center border-t border-(--line) bg-(--statusbar-bg) px-2 text-[10px] text-(--muted)">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {formatWorkStatus(workStatus, t)}
        </span>
      </footer>
    </div>
  );
}

function formatWorkStatus(
  status: WorkStatus,
  t: TranslationFunction,
): string {
  if (!status.active) {
    return status.message || t("app.status.ready");
  }

  return t("app.workStatus", {
    message: status.message,
    queued: status.queued,
    processing: status.processing,
    completed: status.completed,
  });
}
