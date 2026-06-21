import { useMemo, useReducer, useRef, useState } from "react";
import { Actions, DockLocation, Layout, TabNode } from "flexlayout-react";
import type { Action } from "flexlayout-react";
import defaultPageTemplateText from "../../../config/page-templates/default-page.jsonc?raw";
import type { ImportProgress, TagRecord, WorkStatus } from "../../shared/ipc";
import { PageTabs } from "./app/PageTabs";
import { StandaloneWindowRouter } from "./app/StandaloneWindowRouter";
import {
  WorkbenchContextMenus,
  type PageTabContextMenuState,
  type ViewTabContextMenuState,
} from "./app/WorkbenchContextMenus";
import {
  EmptyPagePlaceholder,
  renderWorkbenchView,
} from "./app/WorkbenchViewFactory";
import {
  WorkbenchMenuBar,
  type WorkbenchMenuName,
} from "./app/WorkbenchMenuBar";
import { WorkStatusBar } from "./app/WorkStatusBar";
import { useWorkbenchExternalEvents } from "./app/useWorkbenchExternalEvents";
import { useWorkbenchInitializer } from "./app/useWorkbenchInitializer";
import { useWorkbenchLanguageSync } from "./app/useWorkbenchLanguageSync";
import { useWorkbenchMenuDismiss } from "./app/useWorkbenchMenuDismiss";
import { useWorkbenchPageLayout } from "./app/useWorkbenchPageLayout";
import { useWorkbenchStatePersistence } from "./app/useWorkbenchStatePersistence";
import { createPageItemFromTemplate } from "./app/workbenchPageFactory";
import { createWorkbenchImportHandlers } from "./app/workbenchImport";
import { createWorkbenchWindowActions } from "./app/workbenchWindowActions";
import {
  createPageModel,
  createViewTab,
  findFirstTabsetId,
  findViewTabId,
  readWorkbenchCountersFromPages,
  type OpenableViewComponent,
} from "./app/workbenchModel";
import {
  createSavedWorkbenchState,
  defaultBrowserViewState,
  defaultTagListViewState,
  emptySearchInputState,
  normalizeSearchInputTokens,
} from "./app/workbenchState";
import {
  createIdleProgress,
  createIdleWorkStatus,
} from "./app/workbenchStatus";
import type { PageItem } from "./app/workbenchTypes";
import { useLanguage } from "./utils/language";
import type { BrowserViewState } from "./views/FileBrowserView";
import {
  type SearchInputState,
  type SearchInputToken,
} from "./views/SearchView";
import type { TagListViewState } from "./views/TagListView";
import "flexlayout-react/style/dark.css";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function App(): JSX.Element {
  const query = new URLSearchParams(window.location.search);
  const windowMode = query.get("window");

  if (windowMode) {
    return <StandaloneWindowRouter query={query} windowMode={windowMode} />;
  }

  return <WorkbenchApp />;
}

function WorkbenchApp(): JSX.Element {
  const { languageId, t } = useLanguage();
  const [openMenu, setOpenMenu] = useState<WorkbenchMenuName | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>(() =>
    createIdleProgress(t),
  );
  const [workStatus, setWorkStatus] = useState<WorkStatus>(() =>
    createIdleWorkStatus(t),
  );
  const [pages, setPages] = useState<PageItem[]>(() => [
    createPageItemFromTemplate({
      pageNumber: 1,
      t,
      templateText: defaultPageTemplateText,
      title: t("app.pageName", { index: 1 }),
    }),
  ]);
  const { pageTemplateText, reloadPageLayoutState } =
    useWorkbenchPageLayout(defaultPageTemplateText);
  const [workbenchLoaded, setWorkbenchLoaded] = useState(false);
  const [viewContextMenu, setViewContextMenu] =
    useState<ViewTabContextMenuState | null>(null);
  const [pageContextMenu, setPageContextMenu] =
    useState<PageTabContextMenuState | null>(null);
  const [activePageId, setActivePageId] = useState("page-1");
  const [, refreshLayout] = useReducer((value: number) => value + 1, 0);
  const pageCounterRef = useRef(2);
  const viewCounterRef = useRef(1);
  const searchAppendCounterRef = useRef(1);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activePage = pages.find((page) => page.id === activePageId) ?? null;
  const { queueWorkbenchStateSave } = useWorkbenchStatePersistence<PageItem>({
    activePageId,
    createSavedState: createSavedWorkbenchState,
    languageId,
    pages,
    workbenchLoaded,
  });

  const percent = useMemo(() => {
    if (progress.total === 0) {
      return 0;
    }

    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress.processed, progress.total]);

  const isImporting =
    progress.phase === "selecting" || progress.phase === "importing";
  const closeMenu = (): void => setOpenMenu(null);
  const {
    cancelImportQueueFromActivePage,
    commitImportQueueFromActivePage,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    startFileImport,
    startFolderImport,
  } = createWorkbenchImportHandlers<PageItem>({
    activateImportQueuePreview,
    closeMenu,
    createIdleProgress,
    deactivateActivePageImportQueue,
    getActiveImportQueueKey,
    isImporting,
    openImportView,
    progress,
    setDragActive,
    setProgress,
    t,
  });
  const windowActions = createWorkbenchWindowActions({
    closeMenu,
    openImportView,
    openView,
  });
  useWorkbenchExternalEvents({
    createIdleProgress,
    reloadPageLayoutState,
    setProgress,
    setWorkStatus,
    syncImportQueueLockFromMain,
    t,
  });
  useWorkbenchInitializer({
    reloadPageLayoutState,
    setActivePageId,
    setPages,
    setWorkbenchLoaded,
    syncCountersFromPages,
    t,
  });
  useWorkbenchLanguageSync<PageItem>({
    languageId,
    setPages,
    setProgress,
    setWorkStatus,
    t,
  });
  useWorkbenchMenuDismiss({
    menuRef,
    setOpenMenu,
    setPageContextMenu,
    setViewContextMenu,
  });

  async function syncImportQueueLockFromMain(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const queueStates = new Map(
      await Promise.all(
        pages.map(async (page) => [
          page.id,
          (await window.asteria.listImportQueueFiles(page.id)).length > 0,
        ] as const),
      ),
    );

    setPages((currentPages) =>
      currentPages.map((page) => ({
        ...page,
        importQueueActive: queueStates.get(page.id) ?? page.importQueueActive,
      })),
    );
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
    void window.asteria?.clearImportQueue(pageId);
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

    updatePage(pageId, (page) => ({
      ...page,
      title: nextTitle,
      titleMode: "custom",
    }));

    return true;
  }

  function updatePage(
    pageId: string,
    updater: (page: PageItem) => PageItem,
  ): void {
    setPages((currentPages) =>
      currentPages.map((page) => (page.id === pageId ? updater(page) : page)),
    );
  }

  function updateActivePage(updater: (page: PageItem) => PageItem): void {
    if (!activePage) {
      return;
    }

    updatePage(activePage.id, updater);
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

    return createPageItemFromTemplate({
      pageNumber,
      t,
      templateText: pageTemplateText.newPage,
      title: t("app.pageName", { index: pageNumber }),
    });
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
      updatePage(resetPage.id, () => resetPage);
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

    const targetPage = page ?? getOrCreateActivePage();
    const queueFiles = await window.asteria.listImportQueueFiles(targetPage.id);

    if (queueFiles.length === 0) {
      return;
    }

    updatePage(targetPage.id, (currentPage) => ({
      ...currentPage,
      importQueueActive: true,
      searchFilters: [],
    }));
    openViewOnPage(targetPage, "file-browser");
  }

  function deactivateActivePageImportQueue(): void {
    updateActivePage((page) => ({ ...page, importQueueActive: false }));
  }

  function getActiveImportQueueKey(): string | null {
    return activePage?.id ?? null;
  }

  function pageHasView(
    page: PageItem,
    component: OpenableViewComponent,
  ): boolean {
    return findViewTabId(page.model, component) !== null;
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

    updatePage(page.id, (currentPage) => ({
      ...currentPage,
      searchFilters: [
        ...currentPage.searchFilters,
        { tokens: normalizedTokens },
      ],
    }));

    if (!pageHasView(page, "file-browser")) {
      openView("file-browser");
    }
  }

  function removeActivePageSearchFilters(indexes: number[]): void {
    const removingIndexes = new Set(indexes);

    updateActivePage((page) => ({
      ...page,
      searchFilters: page.searchFilters.filter(
        (_, currentIndex) => !removingIndexes.has(currentIndex),
      ),
    }));
  }

  function updateActivePageSearchInput(state: SearchInputState): void {
    updateActivePage((page) => ({ ...page, searchInputState: state }));
  }

  function updateActivePageBrowserSelection(fileIds: number[]): void {
    updateActivePage((page) => ({ ...page, selectedBrowserFileIds: fileIds }));
  }

  function updateActivePageBrowserViewState(state: BrowserViewState): void {
    updateActivePage((page) => ({ ...page, browserViewState: state }));
  }

  function updateActivePageTagListViewState(state: TagListViewState): void {
    updateActivePage((page) => ({ ...page, tagListViewState: state }));
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

    updatePage(page.id, (currentPage) => ({
      ...currentPage,
      searchAppendTagRequest: nextRequest,
    }));
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
    updatePage(pageId, (page) => ({
      ...page,
      viewRefreshSequenceByTabId: {
        ...page.viewRefreshSequenceByTabId,
        [tabId]: (page.viewRefreshSequenceByTabId[tabId] ?? 0) + 1,
      },
    }));
  }

  function syncCountersFromPages(nextPages: PageItem[]): void {
    const { nextPageCounter, nextViewCounter } =
      readWorkbenchCountersFromPages(nextPages);
    pageCounterRef.current = nextPageCounter;
    viewCounterRef.current = nextViewCounter;
  }

  function handleLayoutAction(action: Action): Action | undefined {
    if (
      action.type === Actions.DELETE_TAB &&
      typeof action.data.node === "string" &&
      activePage &&
      findViewTabId(activePage.model, "file-import") === action.data.node
    ) {
      void window.asteria?.clearImportQueue(activePage.id);
      updateActivePage((page) => ({ ...page, importQueueActive: false }));
    }

    return action;
  }

  function viewFactory(node: TabNode): JSX.Element {
    return renderWorkbenchView({
      activePage,
      defaultBrowserViewState,
      defaultSearchInputState: emptySearchInputState,
      defaultTagListViewState,
      dragActive,
      node,
      percent,
      progress,
      t,
      onAppendSearchTag: appendTagToActivePageSearch,
      onBrowserSelectionChange: updateActivePageBrowserSelection,
      onBrowserStateChange: updateActivePageBrowserViewState,
      onCancelImportQueue: cancelImportQueueFromActivePage,
      onCommitImportQueue: commitImportQueueFromActivePage,
      onDeactivateImportQueue: deactivateActivePageImportQueue,
      onRemoveSearchFilters: removeActivePageSearchFilters,
      onSearch: addActivePageSearchFilter,
      onSearchInputChange: updateActivePageSearchInput,
      onTagListStateChange: updateActivePageTagListViewState,
    });
  }

  return (
    <div className="grid h-full min-h-0 min-w-0 overflow-hidden grid-rows-[28px_30px_minmax(0,1fr)_20px]">
      <WorkbenchMenuBar
        activePageAvailable={Boolean(activePage)}
        isImporting={isImporting}
        menuRef={menuRef}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        onCreatePage={createPage}
        onOpenAiManager={windowActions.openAiManager}
        onOpenApiManager={windowActions.openApiManager}
        onOpenBrowser={windowActions.openBrowser}
        onOpenDatabaseManager={windowActions.openDatabaseManager}
        onOpenFavorites={windowActions.openFavorites}
        onOpenFileImportView={windowActions.openFileImportView}
        onOpenHydrusImport={windowActions.openHydrusImport}
        onOpenRatingManager={windowActions.openRatingManager}
        onOpenRecycleBin={windowActions.openRecycleBin}
        onOpenSearch={windowActions.openSearch}
        onOpenSettings={windowActions.openSettings}
        onOpenTagList={windowActions.openTagList}
        onOpenTagManager={windowActions.openTagManager}
        onOpenTagTranslation={windowActions.openTagTranslation}
        onSaveActivePageLayout={saveActivePageLayout}
        onStartFileImport={startFileImport}
        onStartFolderImport={startFolderImport}
      />

      <PageTabs
        activePageId={activePageId}
        pages={pages}
        onClosePage={closePage}
        onOpenContextMenu={openPageTabContextMenu}
        onSelectPage={setActivePageId}
        onTabMouseDown={handlePageTabMouseDown}
      />

      <main
        className={cx(
          "relative min-h-0 min-w-0 overflow-hidden bg-(--bg) p-2",
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
            onAction={handleLayoutAction}
            onContextMenu={openViewTabContextMenu}
            onModelChange={queueWorkbenchStateSave}
          />
        ) : (
          <EmptyPagePlaceholder />
        )}
      </main>

      <WorkbenchContextMenus
        pageContextMenu={pageContextMenu}
        setPageContextMenu={setPageContextMenu}
        viewContextMenu={viewContextMenu}
        onRefreshViewTab={refreshViewTab}
        onRenamePage={renamePage}
        onSavePageTitle={savePageTitle}
      />
      <WorkStatusBar status={workStatus} />
    </div>
  );
}
