import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import type {
  AiSettings,
  BrowserFileRecord,
  ImportQueueFileRecord,
  RatingEntryRecord,
  RatingGroupRecord,
  TagTranslationSettings,
} from "../../../shared/ipc";
import { FileContextMenu } from "../components/FileContextMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { FileRatingStack } from "../components/FileRatingStack";
import { Icon } from "../components/Icon";
import { useBoxSelection } from "../hooks/useBoxSelection";
import { useMultiSelection } from "../hooks/useMultiSelection";
import { useShortcut } from "../hooks/useShortcut";
import {
  listenInterfaceSettingsChanged,
  loadInterfaceSettings,
} from "../utils/interfaceSettings";
import { filesChangedAffectsBrowserPage } from "../utils/filesChanged";
import { confirmDuplicateImports } from "../utils/importConfirm";
import { markInternalFileDrag } from "../utils/internalFileDrag";
import {
  isAudioExtension,
  isImageExtension,
  isVideoExtension,
} from "../utils/media";
import { useLanguage } from "../utils/language";

interface FileBrowserViewProps {
  searchQuery: string;
  refreshSequence: number;
  importQueueMode: boolean;
  importQueueKey: string;
  state: BrowserViewState;
  onImportQueueEmpty: () => void;
  onSelectionChange: (fileIds: number[]) => void;
  onStateChange: (state: BrowserViewState) => void;
}

type BrowserDisplayFile = BrowserFileRecord | ImportQueueFileRecord;
interface BrowserGalleryItem {
  file: BrowserDisplayFile;
  index: number;
  width: number;
  height: number;
}

interface BrowserGalleryRow {
  items: BrowserGalleryItem[];
  top: number;
  height: number;
}

interface BrowserRuntimeDimensions {
  width: number;
  height: number;
}

interface BrowserGalleryDraftItem {
  file: BrowserDisplayFile;
  index: number;
  ratio: number;
}

export type BrowserSortKey = "importedAt" | "updatedAt";
export type BrowserSortDirection = "asc" | "desc";

export interface BrowserViewState {
  sortKey: BrowserSortKey;
  sortDirection: BrowserSortDirection;
}

const DECODED_PREVIEW_CACHE_LIMIT = 384;
const BROWSER_GALLERY_GAP = 12;
const BROWSER_VIRTUAL_OVERSCAN_PX = 900;
const THUMBNAIL_PRELOAD_BATCH_SIZE = 64;
const THUMBNAIL_PRELOAD_BATCH_DELAY_MS = 40;
const defaultAiSettings: AiSettings = {
  modelPath: "",
  modelName: "",
  generalThreshold: 0.35,
  characterThreshold: 0.75,
  autoTagUntaggedImagesOnImport: false,
  enableImageRetagContextMenu: false,
  enableImageAppendTagContextMenu: false,
};
const decodedPreviewCache = new Map<
  string,
  {
    image: HTMLImageElement;
    lastViewedAt: number;
  }
>();
const browserRootClass =
  "grid h-full min-h-0 min-w-0 overflow-hidden grid-rows-[minmax(0,1fr)_24px] bg-(--panel)";
const browserGridClass =
  "relative min-h-0 overflow-auto p-3";
const browserGalleryViewportClass = "relative";
const browserGalleryRowClass =
  "browser-gallery-row absolute top-0 left-0 flex items-start gap-3";
const browserCellClass =
  "browser-file-cell relative inline-grid cursor-default";
const browserCellPendingClass = "pending";
const importBadgeClass =
  "absolute right-1 bottom-1 z-[2] border border-(--line-strong) bg-(--surface-bg) px-1.5 leading-5 text-[10px] text-(--muted)";
const importBadgeDuplicateClass = "border-(--warning) text-(--warning-ink)";
const browserMediaClass =
  "browser-file-media grid place-items-center [&>span]:text-(--muted)";
const browserStatusClass =
  "flex h-6 min-w-0 items-center justify-end gap-1.5 border-t border-(--line) bg-(--surface-bg) px-2 text-(--muted)";
const browserSelectClass =
  "h-[18px] min-w-[72px] border border-(--line-strong) bg-(--surface-inset-bg) text-(--ink)";
const browserPagerClass = "inline-flex min-w-0 items-center gap-1";
const browserPagerButtonClass = "ui-button ui-button-compact ui-icon-button";
const browserPagerInputClass =
  "h-[18px] w-[42px] border border-(--line-strong) bg-(--surface-inset-bg) px-1 text-(--ink) leading-4";
const contextMenuClass = "context-menu";

export function FileBrowserView({
  importQueueMode,
  importQueueKey,
  onImportQueueEmpty,
  onSelectionChange,
  onStateChange,
  refreshSequence,
  searchQuery,
  state,
}: FileBrowserViewProps): JSX.Element {
  const { t } = useLanguage();
  const [files, setFiles] = useState<BrowserDisplayFile[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings);
  const [tagTranslationSettings, setTagTranslationSettings] =
    useState<TagTranslationSettings | null>(null);
  const [activeRatingGroups, setActiveRatingGroups] = useState<
    RatingGroupRecord[]
  >([]);
  const [ratingEntriesByGroupId, setRatingEntriesByGroupId] = useState<
    Map<number, RatingEntryRecord[]>
  >(new Map());
  const [message, setMessage] = useState(() => t("common.loading"));
  const [pendingFileIds, setPendingFileIds] = useState<number[]>([]);
  const [lastPendingFileId, setLastPendingFileId] = useState<number | null>(
    null,
  );
  const [visiblePreviewIds, setVisiblePreviewIds] = useState<number[]>([]);
  const [cachedPreviewUrls, setCachedPreviewUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [pageSize, setPageSize] = useState(
    () => loadInterfaceSettings().browserPageSize,
  );
  const [previewSize, setPreviewSize] = useState(
    () => loadInterfaceSettings().browserPreviewSize,
  );
  const [gridWidth, setGridWidth] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [runtimeDimensions, setRuntimeDimensions] = useState<
    Record<number, BrowserRuntimeDimensions>
  >({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [totalFileCount, setTotalFileCount] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileIds: number[];
    canAiRetag: boolean;
    canAiAppendTag: boolean;
    canTranslateTags: boolean;
    canBatchOperate: boolean;
    canScreening: boolean;
  } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const deferredPressFileIdRef = useRef<number | null>(null);
  const pendingRuntimeDimensionsRef = useRef<
    Record<number, BrowserRuntimeDimensions>
  >({});
  const runtimeDimensionsFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const thumbnailPreloadTimerRef = useRef<number | null>(null);
  const thumbnailPreloadRunRef = useRef(0);
  const sortedFiles = useMemo(
    () =>
      importQueueMode
        ? sortBrowserFiles(files, state.sortKey, state.sortDirection)
        : files,
    [files, importQueueMode, state.sortDirection, state.sortKey],
  );
  const effectiveTotalCount = importQueueMode ? sortedFiles.length : totalFileCount;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (clampedPage - 1) * pageSize;
  const pageFiles = useMemo(
    () =>
      importQueueMode
        ? sortedFiles.slice(pageStartIndex, pageStartIndex + pageSize)
        : sortedFiles,
    [importQueueMode, pageSize, pageStartIndex, sortedFiles],
  );
  const pageFileIdSignature = useMemo(
    () => pageFiles.map((file) => file.id).join(","),
    [pageFiles],
  );
  const galleryRows = useMemo(
    () =>
      createPositionedGalleryRows(
        pageFiles,
        gridWidth,
        previewSize,
        runtimeDimensions,
      ),
    [gridWidth, pageFiles, previewSize, runtimeDimensions],
  );
  const virtualGallery = useMemo(
    () => createVirtualGallery(galleryRows, scrollTop, gridHeight),
    [galleryRows, gridHeight, scrollTop],
  );
  const visiblePreviewIdSet = useMemo(
    () => new Set(visiblePreviewIds),
    [visiblePreviewIds],
  );
  const visiblePreviewFiles = useMemo(
    () => virtualGallery.rows.flatMap((row) => row.items.map((item) => item.file)),
    [virtualGallery.rows],
  );
  const pageEndIndex = pageStartIndex + pageFiles.length;
  const boxSelection = useBoxSelection({
    containerRef: gridRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: pendingFileIds,
    startOnlyOutsideItems: true,
    onSelect: setPendingFileIds,
    onLastSelectedId: setLastPendingFileId,
  });
  const fileSelection = useMultiSelection({
    items: pageFiles,
    getId: (file) => file.id,
    selectedIds: pendingFileIds,
    lastSelectedId: lastPendingFileId,
    onSelect: setPendingFileIds,
    onLastSelectedId: setLastPendingFileId,
    leftButtonOnly: true,
    allowNativeDrag: true,
  });

  useEffect(() => {
    void loadBrowserFiles();
  }, [
    clampedPage,
    importQueueMode,
    pageSize,
    refreshSequence,
    searchQuery,
    state.sortDirection,
    state.sortKey,
  ]);

  useEffect(
    () =>
      listenInterfaceSettingsChanged((settings) => {
        setPageSize(settings.browserPageSize);
        setPreviewSize(settings.browserPreviewSize);
      }),
    [],
  );

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(
    () => () => {
      if (runtimeDimensionsFrameRef.current !== null) {
        window.cancelAnimationFrame(runtimeDimensionsFrameRef.current);
      }

      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      if (thumbnailPreloadTimerRef.current !== null) {
        window.clearTimeout(thumbnailPreloadTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    onSelectionChangeRef.current(pendingFileIds);
  }, [pendingFileIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    importQueueMode,
    pageSize,
    searchQuery,
    state.sortDirection,
    state.sortKey,
  ]);

  useEffect(() => {
    setPageInputValue(String(clampedPage));
  }, [clampedPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const grid = gridRef.current;

    if (grid) {
      grid.scrollTop = 0;
    }

    setScrollTop(0);
    pendingScrollTopRef.current = 0;

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }

    cancelScheduledThumbnailPreload();
    setVisiblePreviewIds([]);
    pendingRuntimeDimensionsRef.current = {};

    if (runtimeDimensionsFrameRef.current !== null) {
      window.cancelAnimationFrame(runtimeDimensionsFrameRef.current);
      runtimeDimensionsFrameRef.current = null;
    }

    setPendingFileIds((currentIds) =>
      currentIds.filter((id) => pageFiles.some((file) => file.id === id)),
    );
    setLastPendingFileId((currentId) =>
      currentId !== null && pageFiles.some((file) => file.id === currentId)
        ? currentId
        : null,
    );
    setContextMenu(null);
    setBlankContextMenu(null);
  }, [clampedPage, pageFileIdSignature]);

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      setGridWidth(0);
      setGridHeight(0);
      return undefined;
    }

    function updateGridSize(): void {
      const currentGrid = gridRef.current;

      if (!currentGrid) {
        setGridWidth(0);
        setGridHeight(0);
        return;
      }

      setGridWidth(Math.max(0, currentGrid.clientWidth - 24));
      setGridHeight(currentGrid.clientHeight);
    }

    updateGridSize();

    const observer = new ResizeObserver(updateGridSize);
    observer.observe(grid);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const nextVisiblePreviewIds = visiblePreviewFiles.map((file) => file.id);
    setVisiblePreviewIds((currentIds) =>
      areNumberArraysEqual(currentIds, nextVisiblePreviewIds)
        ? currentIds
        : nextVisiblePreviewIds,
    );
  }, [visiblePreviewFiles]);

  useEffect(() => {
    if (visiblePreviewFiles.length === 0) {
      cancelScheduledThumbnailPreload();
      return;
    }

    const thumbnailFileIds = visiblePreviewFiles
      .filter(usesThumbnailPreview)
      .map((file) => file.id);

    scheduleThumbnailPreload(thumbnailFileIds);
    warmDecodedPreviewCache(visiblePreviewFiles);
    setCachedPreviewUrls(getDecodedPreviewCacheUrls());
  }, [visiblePreviewFiles]);

  useShortcut("select-all", () => {
    const fileIds = pageFiles.map((file) => file.id);
    setPendingFileIds(fileIds);
    setLastPendingFileId(fileIds[fileIds.length - 1] ?? null);
  });
  useShortcut(
    "remove-selected",
    () => void trashSelectedFiles(pendingFileIds),
    { enabled: !importQueueMode && pendingFileIds.length > 0 },
  );
  useShortcut("browser-previous-page", () => changePage(-1), {
    enabled: totalPages > 1,
  });
  useShortcut("browser-next-page", () => changePage(1), {
    enabled: totalPages > 1,
  });

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    const unsubscribeFilesChanged = window.asteria.onFilesChanged((payload) => {
      const pageFileIds = pageFileIdSignature
        ? pageFileIdSignature.split(",").map((fileId) => Number(fileId))
        : [];

      if (
        filesChangedAffectsBrowserPage(payload, pageFileIds, searchQuery !== "")
      ) {
        void loadBrowserFiles();
      }
    });

    const unsubscribeFavoriteChanged = window.asteria.onFileFavoriteChanged(
      (fileId, favorite) => {
        setFiles((currentFiles) =>
          patchFileFavorite(currentFiles, fileId, favorite),
        );
      },
    );

    const unsubscribeImportQueueChanged = window.asteria.onImportQueueChanged(
      () => {
        if (importQueueMode) {
          void loadBrowserFiles();
        }
      },
    );

    return () => {
      unsubscribeFilesChanged();
      unsubscribeFavoriteChanged();
      unsubscribeImportQueueChanged();
    };
  }, [importQueueMode, pageFileIdSignature, searchQuery]);

  useEffect(() => {
    if (!window.asteria || importQueueMode) {
      return undefined;
    }

    void loadMenuSettings();

    return window.asteria.onSettingsChanged(() => {
      void loadMenuSettings();
    });
  }, [importQueueMode]);

  useEffect(() => {
    function handleWindowMouseDown(event: MouseEvent): void {
      const targetElement =
        event.target instanceof Element ? event.target : null;

      if (event.button === 0 && !targetElement?.closest(".context-menu")) {
        setContextMenu(null);
        setBlankContextMenu(null);
      }

      if (isScrollbarMouseTarget(event.target, event.clientX, event.clientY)) {
        return;
      }

      if (targetElement?.closest(".browser-file-cell, .context-menu")) {
        return;
      }

      if (targetElement?.closest("[data-workbench-view]")) {
        return;
      }

      clearFileSelection();
    }

    window.addEventListener("mousedown", handleWindowMouseDown, true);

    return () => {
      window.removeEventListener("mousedown", handleWindowMouseDown, true);
    };
  }, []);

  async function loadMenuSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const [nextAiSettings, nextTagTranslationSettings] = await Promise.all([
      window.asteria.getAiSettings(),
      window.asteria.getTagTranslationSettings(),
    ]);
    setAiSettings(nextAiSettings);
    setTagTranslationSettings(nextTagTranslationSettings);
  }

  async function loadBrowserFiles(): Promise<void> {
    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    setMessage(t("window.browser.loading"));

    try {
      const nextFiles = importQueueMode
        ? await window.asteria.listImportQueueFiles(importQueueKey)
        : searchQuery
          ? await window.asteria.searchBrowserFilePage({
              query: searchQuery,
              page: clampedPage,
              pageSize,
              sortKey: state.sortKey,
              sortDirection: state.sortDirection,
            })
          : await window.asteria.listBrowserFilePage({
              page: clampedPage,
              pageSize,
              sortKey: state.sortKey,
              sortDirection: state.sortDirection,
            });
      const nextDisplayFiles = Array.isArray(nextFiles)
        ? nextFiles
        : nextFiles.files;
      const nextTotalCount = Array.isArray(nextFiles)
        ? nextFiles.length
        : nextFiles.total;
      const nextRatingGroups = importQueueMode
        ? []
        : await window.asteria.listRatingGroups();
      const nextActiveRatingGroups = nextRatingGroups.filter(
        (group) => group.isActive,
      );
      const nextRatingEntriesByGroupId = new Map<
        number,
        RatingEntryRecord[]
      >();

      await Promise.all(
        nextActiveRatingGroups.map(async (group) => {
          nextRatingEntriesByGroupId.set(
            group.id,
            await window.asteria.listRatingEntries(group.id),
          );
        }),
      );
      setFiles(nextDisplayFiles);
      setTotalFileCount(nextTotalCount);
      setVisiblePreviewIds([]);
      setActiveRatingGroups(nextActiveRatingGroups);
      setRatingEntriesByGroupId(nextRatingEntriesByGroupId);
      setPendingFileIds((currentIds) =>
        currentIds.filter((id) =>
          nextDisplayFiles.some((file) => file.id === id),
        ),
      );
      setMessage(
        importQueueMode
          ? t("window.browser.pendingCount", { count: nextTotalCount })
          : searchQuery
            ? t("window.browser.resultCount", { count: nextTotalCount })
            : t("window.browser.fileCount", { count: nextTotalCount }),
      );
    } catch (error) {
      setFiles([]);
      setTotalFileCount(0);
      setVisiblePreviewIds([]);
      setMessage(
        error instanceof Error ? error.message : t("window.browser.loadFailed"),
      );
    }
  }

  async function openFileDetail(id: number): Promise<void> {
    if (importQueueMode) {
      return;
    }

    await window.asteria?.openFileDetailWindow(
      id,
      sortedFiles.map((file) => file.id),
    );
  }

  function clearFileSelection(): void {
    setPendingFileIds((currentIds) =>
      currentIds.length > 0 ? [] : currentIds,
    );
    setLastPendingFileId((currentId) =>
      currentId === null ? currentId : null,
    );
    deferredPressFileIdRef.current = null;
  }

  function isScrollbarMouseTarget(
    target: EventTarget | null,
    clientX: number,
    clientY: number,
  ): boolean {
    const element = target instanceof HTMLElement ? target : null;

    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const verticalScrollbarWidth = element.offsetWidth - element.clientWidth;
    const horizontalScrollbarHeight = element.offsetHeight - element.clientHeight;
    const isVerticalScrollbar =
      verticalScrollbarWidth > 0 &&
      element.scrollHeight > element.clientHeight &&
      clientX >= rect.right - verticalScrollbarWidth &&
      clientX <= rect.right;
    const isHorizontalScrollbar =
      horizontalScrollbarHeight > 0 &&
      element.scrollWidth > element.clientWidth &&
      clientY >= rect.bottom - horizontalScrollbarHeight &&
      clientY <= rect.bottom;

    return isVerticalScrollbar || isHorizontalScrollbar;
  }

  function isBrowserBlankArea(
    target: EventTarget | null,
    container: HTMLElement,
  ): boolean {
    if (target === container) {
      return true;
    }

    const element = target instanceof Element ? target : null;

    if (!element || element.closest(".browser-file-cell")) {
      return false;
    }

    return Boolean(element.closest("[data-browser-gallery-blank]"));
  }

  async function toggleFavorite(file: BrowserDisplayFile): Promise<void> {
    if (importQueueMode || isImportQueueFile(file) || !window.asteria) {
      return;
    }

    const nextFavorite = !file.isFavorite;
    setFiles((currentFiles) =>
      patchFileFavorite(currentFiles, file.id, nextFavorite),
    );

    try {
      await window.asteria.setFileFavorite(file.id, nextFavorite);
    } catch (error) {
      setFiles((currentFiles) =>
        patchFileFavorite(currentFiles, file.id, Boolean(file.isFavorite)),
      );
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.browser.favoriteFailed"),
      );
    }
  }

  function handleBrowserFilePress(
    event: React.MouseEvent<HTMLElement>,
    file: BrowserDisplayFile,
    index: number,
  ): void {
    const isPlainLeftPress =
      event.button === 0 && !event.ctrlKey && !event.shiftKey;

    if (isPlainLeftPress && pendingFileIds.includes(file.id)) {
      // 已选中项的普通按下不立即改选区：立即折叠会在拖拽开始前破坏多选，
      // 折叠/打开延迟到 click（拖拽发生时 click 不会触发）
      event.stopPropagation();
      deferredPressFileIdRef.current = file.id;
      return;
    }

    deferredPressFileIdRef.current = null;
    fileSelection.handleItemMouseDown(event, file, index);
  }

  function handleBrowserFileClick(file: BrowserDisplayFile): void {
    if (deferredPressFileIdRef.current !== file.id) {
      return;
    }

    deferredPressFileIdRef.current = null;

    if (
      !importQueueMode &&
      pendingFileIds.length === 1 &&
      pendingFileIds[0] === file.id
    ) {
      void openFileDetail(file.id);
      return;
    }

    setPendingFileIds([file.id]);
    setLastPendingFileId(file.id);
  }

  function handleBrowserFileDragStart(
    event: React.DragEvent<HTMLElement>,
    file: BrowserDisplayFile,
  ): void {
    event.preventDefault();
    deferredPressFileIdRef.current = null;

    if (importQueueMode || isImportQueueFile(file) || !window.asteria) {
      return;
    }

    const draggedFileIds = pendingFileIds.includes(file.id)
      ? pendingFileIds
      : [file.id];

    markInternalFileDrag();
    window.asteria.startFileDrag(draggedFileIds);
  }

  function handleBrowserGridMouseDown(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    if (
      isScrollbarMouseTarget(event.target, event.clientX, event.clientY)
    ) {
      return;
    }

    if (isBrowserBlankArea(event.target, event.currentTarget)) {
      clearFileSelection();
      setContextMenu(null);
      setBlankContextMenu(null);
    }
  }

  function handleBrowserGridScroll(
    event: React.UIEvent<HTMLDivElement>,
  ): void {
    pendingScrollTopRef.current = event.currentTarget.scrollTop;

    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop((currentScrollTop) =>
        currentScrollTop === pendingScrollTopRef.current
          ? currentScrollTop
          : pendingScrollTopRef.current,
      );
    });
  }

  function cancelScheduledThumbnailPreload(): void {
    thumbnailPreloadRunRef.current += 1;

    if (thumbnailPreloadTimerRef.current !== null) {
      window.clearTimeout(thumbnailPreloadTimerRef.current);
      thumbnailPreloadTimerRef.current = null;
    }
  }

  function scheduleThumbnailPreload(fileIds: number[]): void {
    if (!window.asteria || fileIds.length === 0) {
      cancelScheduledThumbnailPreload();
      return;
    }

    cancelScheduledThumbnailPreload();
    const runId = thumbnailPreloadRunRef.current;
    const normalizedFileIds = uniquePositiveIntegers(fileIds);
    let offset = 0;

    function preloadNextBatch(): void {
      if (runId !== thumbnailPreloadRunRef.current || !window.asteria) {
        return;
      }

      const batch = normalizedFileIds.slice(
        offset,
        offset + THUMBNAIL_PRELOAD_BATCH_SIZE,
      );
      offset += THUMBNAIL_PRELOAD_BATCH_SIZE;

      if (batch.length > 0) {
        void window.asteria.preloadThumbnails(batch);
      }

      if (offset < normalizedFileIds.length) {
        thumbnailPreloadTimerRef.current = window.setTimeout(
          preloadNextBatch,
          THUMBNAIL_PRELOAD_BATCH_DELAY_MS,
        );
      } else {
        thumbnailPreloadTimerRef.current = null;
      }
    }

    thumbnailPreloadTimerRef.current = window.setTimeout(
      preloadNextBatch,
      THUMBNAIL_PRELOAD_BATCH_DELAY_MS,
    );
  }

  function handleBrowserGridMouseDownCapture(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    if (
      isScrollbarMouseTarget(event.target, event.clientX, event.clientY)
    ) {
      return;
    }

    boxSelection.handleMouseDownCapture(event);
  }

  function handleBrowserGridContextMenu(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    if (!isBrowserBlankArea(event.target, event.currentTarget)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    clearFileSelection();
    setBlankContextMenu({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleBrowserFileContextMenu(
    event: React.MouseEvent<HTMLElement>,
    file: BrowserDisplayFile,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const fileIds =
      pendingFileIds.includes(file.id) && pendingFileIds.length > 1
        ? pendingFileIds
        : [file.id];
    const selectedFiles = pageFiles.filter((item) => fileIds.includes(item.id));

    if (fileIds.length === 1) {
      setPendingFileIds([file.id]);
      setLastPendingFileId(file.id);
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      fileIds,
      canAiRetag:
        !importQueueMode &&
        aiSettings.enableImageRetagContextMenu &&
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (item) =>
            !isImportQueueFile(item) && isImageExtension(item.extension ?? ""),
        ),
      canAiAppendTag:
        !importQueueMode &&
        aiSettings.enableImageAppendTagContextMenu &&
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (item) =>
            !isImportQueueFile(item) && isImageExtension(item.extension ?? ""),
        ),
      canTranslateTags:
        !importQueueMode &&
        Boolean(tagTranslationSettings?.enableContextMenuTranslation) &&
        selectedFiles.length > 0 &&
        selectedFiles.every((item) => !isImportQueueFile(item)),
      canBatchOperate:
        !importQueueMode &&
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (item) =>
            !isImportQueueFile(item) && isImageExtension(item.extension ?? ""),
        ),
      canScreening:
        !importQueueMode &&
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (item) => !isImportQueueFile(item) && item.domain === "pending",
        ),
    });
  }

  async function openUrlManager(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openUrlManagerWindow(fileIds);
  }

  async function openBatchTagManager(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openBatchTagManagerWindow(fileIds);
  }

  async function openBatchOperation(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openBatchOperationWindow(fileIds);
  }

  async function openExportWindow(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openExportWindow(fileIds);
  }

  async function tagWithAi(
    fileIds: number[],
    overwrite: boolean,
  ): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);

    try {
      await window.asteria?.tagFilesWithAi(fileIds, overwrite);
      await loadBrowserFiles();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function translateTags(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);

    try {
      await window.asteria?.translateFileTags(fileIds);
      await loadBrowserFiles();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function openScreening(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openScreeningWindow(fileIds);
  }

  async function openExternally(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);

    const fileId = fileIds[0];

    if (fileId) {
      await window.asteria?.openFileExternally(fileId);
    }
  }

  async function trashSelectedFiles(fileIds: number[]): Promise<void> {
    if (importQueueMode || !window.asteria) {
      return;
    }

    setContextMenu(null);

    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.trashFiles", { count: fileIds.length }),
    });

    if (!confirmed) {
      return;
    }

    try {
      await window.asteria.trashFiles(fileIds);
      setPendingFileIds([]);
      setLastPendingFileId(null);
      await loadBrowserFiles();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function commitQueueFiles(fileIds: number[]): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setContextMenu(null);
    const queueFiles = pageFiles.filter(
      (file): file is ImportQueueFileRecord =>
        isImportQueueFile(file) && fileIds.includes(file.id),
    );

    try {
      const confirmedDuplicateIds = await confirmDuplicateImports(
        queueFiles,
        t,
      );

      if (confirmedDuplicateIds === null) {
        return;
      }

      const result = await window.asteria.commitImportQueue(
        fileIds,
        confirmedDuplicateIds,
        importQueueKey,
      );
      setPendingFileIds([]);
      setLastPendingFileId(null);
      setFiles(result.remainingQueue);

      if (result.remainingQueue.length === 0) {
        onImportQueueEmpty();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function removeQueueFiles(fileIds: number[]): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setContextMenu(null);

    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.removeQueueFiles", { count: fileIds.length }),
    });

    if (!confirmed) {
      return;
    }

    try {
      await window.asteria.removeImportQueueFiles(fileIds, importQueueKey);
      setPendingFileIds([]);
      setLastPendingFileId(null);
      await loadBrowserFiles();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function openRatingDialog(
    fileIds: number[],
    group: RatingGroupRecord,
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setContextMenu(null);
    await window.asteria.openFileRatingEditorWindow(fileIds, group.id);
  }

  async function setQuickRating(
    file: BrowserDisplayFile,
    group: RatingGroupRecord,
    entry: RatingEntryRecord,
  ): Promise<void> {
    if (importQueueMode || isImportQueueFile(file) || !window.asteria) {
      return;
    }

    setFiles((currentFiles) =>
      patchFileRating(currentFiles, file.id, group, entry),
    );

    try {
      await window.asteria.setFileRatingEntries([file.id], group.id, [
        entry.id,
      ]);
    } catch (error) {
      await loadBrowserFiles();
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  function changePage(offset: -1 | 1): void {
    setCurrentPage((page) => Math.min(totalPages, Math.max(1, page + offset)));
  }

  function commitPageInput(): void {
    const parsed = Number(pageInputValue);
    const nextPage =
      pageInputValue.trim() !== "" && Number.isInteger(parsed)
        ? Math.min(totalPages, Math.max(1, parsed))
        : clampedPage;

    setCurrentPage(nextPage);
    setPageInputValue(String(nextPage));
  }

  function handlePreviewImageLoad(
    fileId: number,
    event: SyntheticEvent<HTMLImageElement>,
  ): void {
    const image = event.currentTarget;
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    if (!width || !height || width <= 0 || height <= 0) {
      return;
    }

    pendingRuntimeDimensionsRef.current[fileId] = { width, height };
    scheduleRuntimeDimensionsFlush();
  }

  function scheduleRuntimeDimensionsFlush(): void {
    if (runtimeDimensionsFrameRef.current !== null) {
      return;
    }

    runtimeDimensionsFrameRef.current = window.requestAnimationFrame(() => {
      runtimeDimensionsFrameRef.current = null;
      flushRuntimeDimensions();
    });
  }

  function flushRuntimeDimensions(): void {
    const pendingEntries = Object.entries(pendingRuntimeDimensionsRef.current);
    pendingRuntimeDimensionsRef.current = {};

    if (pendingEntries.length === 0) {
      return;
    }

    setRuntimeDimensions((current) => {
      let changed = false;
      const nextDimensions = { ...current };

      for (const [fileIdText, dimensions] of pendingEntries) {
        const fileId = Number(fileIdText);
        const existing = current[fileId];

        if (
          existing?.width === dimensions.width &&
          existing.height === dimensions.height
        ) {
          continue;
        }

        nextDimensions[fileId] = dimensions;
        changed = true;
      }

      return changed ? nextDimensions : current;
    });
  }

  return (
    <section className={browserRootClass}>
      <div
        className={browserGridClass}
        ref={gridRef}
        style={
          {
            "--browser-preview-size": `${previewSize}px`,
          } as CSSProperties
        }
        onContextMenu={handleBrowserGridContextMenu}
        onMouseDownCapture={handleBrowserGridMouseDownCapture}
        onMouseDown={handleBrowserGridMouseDown}
        onScroll={handleBrowserGridScroll}
      >
        {pageFiles.length > 0 ? (
          <div
            className={browserGalleryViewportClass}
            data-browser-gallery-blank
            style={{ height: `${virtualGallery.totalHeight}px` }}
          >
            {virtualGallery.rows.map((row) => (
              <div
                className={browserGalleryRowClass}
                key={row.items[0]?.file.id ?? row.top}
                style={{
                  height: `${row.height}px`,
                  transform: `translateY(${row.top}px)`,
                }}
              >
                {row.items.map(({ file, height, index, width }) => (
                  <article
                    className={`${browserCellClass} ${pendingFileIds.includes(file.id) ? browserCellPendingClass : ""}`}
                    data-box-select-id={file.id}
                    draggable={!importQueueMode && !isImportQueueFile(file)}
                    key={file.id}
                    style={{
                      height: `${height}px`,
                      width: `${width}px`,
                    }}
                    onClick={() => handleBrowserFileClick(file)}
                    onDragStart={(event) =>
                      handleBrowserFileDragStart(event, file)
                    }
                    onMouseDown={(event) =>
                      handleBrowserFilePress(event, file, index)
                    }
                    onContextMenu={(event) =>
                      handleBrowserFileContextMenu(event, file)
                    }
                  >
                    {isImportQueueFile(file) ? (
                      <div
                        className={`${importBadgeClass} ${file.duplicate ? importBadgeDuplicateClass : ""}`}
                        title={
                          file.status === "failed"
                            ? (file.errorMessage ?? undefined)
                            : undefined
                        }
                      >
                        {file.duplicate
                          ? t("window.import.duplicate")
                          : file.status === "failed"
                            ? t("window.import.failed")
                            : t("window.browser.pending")}
                      </div>
                    ) : (
                      <>
                        <FileRatingStack
                          entriesByGroupId={ratingEntriesByGroupId}
                          groups={activeRatingGroups}
                          interactive
                          ratings={file.ratings}
                          onChange={(group, entry) =>
                            void setQuickRating(file, group, entry)
                          }
                        />
                        <FavoriteButton
                          active={Boolean(file.isFavorite)}
                          onToggle={() => void toggleFavorite(file)}
                        />
                      </>
                    )}
                    <div className={browserMediaClass}>
                      {renderBrowserMedia(
                        file,
                        visiblePreviewIdSet.has(file.id) ||
                          isPreviewCached(file, cachedPreviewUrls),
                        handlePreviewImageLoad,
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-(--muted)">{t("window.browser.noRecords")}</div>
        )}
        {boxSelection.selectionBox ? (
          <div
            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
            style={boxSelection.selectionBox}
          />
        ) : null}
      </div>

      <footer className={browserStatusClass}>
        <label className="inline-flex min-w-0 items-center gap-1">
          <span>{t("window.browser.sort")}</span>
          <select
            className={browserSelectClass}
            aria-label={t("window.browser.sortField")}
            disabled={importQueueMode}
            value={state.sortKey}
            onChange={(event) =>
              onStateChange({
                ...state,
                sortKey: event.target.value as BrowserSortKey,
              })
            }
          >
            <option value="importedAt">{t("window.browser.importedAt")}</option>
            <option value="updatedAt">{t("window.browser.updatedAt")}</option>
          </select>
        </label>
        <select
          className={browserSelectClass}
          aria-label={t("window.browser.sortDirection")}
          disabled={importQueueMode}
          value={state.sortDirection}
          onChange={(event) =>
            onStateChange({
              ...state,
              sortDirection: event.target.value as BrowserSortDirection,
            })
          }
        >
          <option value="desc">{t("window.browser.desc")}</option>
          <option value="asc">{t("window.browser.asc")}</option>
        </select>
        <div className={browserPagerClass}>
          <button
            aria-label={t("window.browser.firstPage")}
            className={browserPagerButtonClass}
            disabled={clampedPage <= 1}
            title={t("window.browser.firstPage")}
            type="button"
            onClick={() => setCurrentPage(1)}
          >
            <Icon name="chevrons-left" />
          </button>
          <button
            aria-label={t("window.browser.previousPage")}
            className={browserPagerButtonClass}
            disabled={clampedPage <= 1}
            title={t("window.browser.previousPage")}
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            <Icon name="chevron-left" />
          </button>
          <input
            className={browserPagerInputClass}
            aria-label={t("window.browser.pageInput")}
            max={totalPages}
            min={1}
            type="number"
            value={pageInputValue}
            onBlur={commitPageInput}
            onChange={(event) => setPageInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitPageInput();
              }
            }}
          />
          <span>/ {totalPages}</span>
          <button
            aria-label={t("window.browser.nextPage")}
            className={browserPagerButtonClass}
            disabled={clampedPage >= totalPages}
            title={t("window.browser.nextPage")}
            type="button"
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
          >
            <Icon name="chevron-right" />
          </button>
          <button
            aria-label={t("window.browser.lastPage")}
            className={browserPagerButtonClass}
            disabled={clampedPage >= totalPages}
            title={t("window.browser.lastPage")}
            type="button"
            onClick={() => setCurrentPage(totalPages)}
          >
            <Icon name="chevrons-right" />
          </button>
        </div>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {message}
          {effectiveTotalCount > 0
            ? ` · ${pageStartIndex + 1}-${pageEndIndex} / ${effectiveTotalCount}`
            : ""}
        </span>
      </footer>

      {blankContextMenu ? (
        <div
          className={contextMenuClass}
          style={{ left: blankContextMenu.x, top: blankContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setBlankContextMenu(null);
              void loadBrowserFiles();
            }}
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}

      {contextMenu && importQueueMode ? (
        <div
          className={contextMenuClass}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => void commitQueueFiles(contextMenu.fileIds)}
          >
            {t("app.action.import")}
          </button>
          <button
            type="button"
            onClick={() => void removeQueueFiles(contextMenu.fileIds)}
          >
            {t("common.delete")}
          </button>
        </div>
      ) : null}

      {contextMenu && !importQueueMode ? (
        <FileContextMenu
          activeRatingGroups={activeRatingGroups}
          canAiAppendTag={contextMenu.canAiAppendTag}
          canAiRetag={contextMenu.canAiRetag}
          canBatchOperate={contextMenu.canBatchOperate}
          canManageTags={contextMenu.fileIds.length > 1}
          canOpenExternally={contextMenu.fileIds.length === 1}
          canScreening={contextMenu.canScreening}
          canTranslateTags={contextMenu.canTranslateTags}
          fileIds={contextMenu.fileIds}
          x={contextMenu.x}
          y={contextMenu.y}
          onManageTags={(fileIds) => void openBatchTagManager(fileIds)}
          onManageUrl={(fileIds) => void openUrlManager(fileIds)}
          onBatchOperate={(fileIds) => void openBatchOperation(fileIds)}
          onAiAppendTag={(fileIds) => void tagWithAi(fileIds, false)}
          onAiRetag={(fileIds) => void tagWithAi(fileIds, true)}
          onTranslateTags={(fileIds) => void translateTags(fileIds)}
          onExport={(fileIds) => void openExportWindow(fileIds)}
          onOpenExternally={(fileIds) => void openExternally(fileIds)}
          onOpenRating={(fileIds, group) =>
            void openRatingDialog(fileIds, group)
          }
          onOpenScreening={(fileIds) => void openScreening(fileIds)}
          onTrash={(fileIds) => void trashSelectedFiles(fileIds)}
        />
      ) : null}
    </section>
  );
}

function createPositionedGalleryRows(
  files: BrowserDisplayFile[],
  availableWidth: number,
  targetRowHeight: number,
  runtimeDimensions: Record<number, BrowserRuntimeDimensions>,
): BrowserGalleryRow[] {
  if (files.length === 0) {
    return [];
  }

  const rowWidth = Math.max(targetRowHeight, availableWidth);
  const rows: BrowserGalleryRow[] = [];
  let currentRow: BrowserGalleryDraftItem[] = [];
  let currentRatio = 0;
  let top = 0;

  function pushRow(items: BrowserGalleryItem[]): void {
    const height = items[0]?.height ?? targetRowHeight;
    rows.push({ items, top, height });
    top += height + BROWSER_GALLERY_GAP;
  }

  files.forEach((file, index) => {
    const ratio = getBrowserFileAspectRatio(file, runtimeDimensions[file.id]);
    currentRow.push({ file, index, ratio });
    currentRatio += ratio;

    const gapWidth = Math.max(0, currentRow.length - 1) * BROWSER_GALLERY_GAP;
    const naturalRowWidth = currentRatio * targetRowHeight + gapWidth;

    if (naturalRowWidth >= rowWidth) {
      pushRow(createGalleryRow(currentRow, rowWidth, targetRowHeight, true));
      currentRow = [];
      currentRatio = 0;
    }
  });

  if (currentRow.length > 0) {
    pushRow(createGalleryRow(currentRow, rowWidth, targetRowHeight, false));
  }

  return rows;
}

function createVirtualGallery(
  rows: BrowserGalleryRow[],
  scrollTop: number,
  viewportHeight: number,
): { rows: BrowserGalleryRow[]; totalHeight: number } {
  if (rows.length === 0) {
    return { rows: [], totalHeight: 0 };
  }

  const lastRow = rows[rows.length - 1];

  if (!lastRow) {
    return { rows: [], totalHeight: 0 };
  }

  const totalHeight = lastRow.top + lastRow.height;
  const viewportStart = Math.max(0, scrollTop - BROWSER_VIRTUAL_OVERSCAN_PX);
  const viewportEnd =
    scrollTop + Math.max(1, viewportHeight) + BROWSER_VIRTUAL_OVERSCAN_PX;
  const startIndex = findFirstGalleryRowAfter(rows, viewportStart);
  const endIndex = findFirstGalleryRowAtOrAfter(rows, viewportEnd);

  return {
    rows: rows.slice(startIndex, endIndex),
    totalHeight,
  };
}

function findFirstGalleryRowAfter(
  rows: BrowserGalleryRow[],
  viewportStart: number,
): number {
  let low = 0;
  let high = rows.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const row = rows[middle];

    if (row && row.top + row.height < viewportStart) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function findFirstGalleryRowAtOrAfter(
  rows: BrowserGalleryRow[],
  viewportEnd: number,
): number {
  let low = 0;
  let high = rows.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const row = rows[middle];

    if (row && row.top <= viewportEnd) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function areNumberArraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function uniquePositiveIntegers(values: number[]): number[] {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  );
}

function createGalleryRow(
  files: BrowserGalleryDraftItem[],
  availableWidth: number,
  targetRowHeight: number,
  justify: boolean,
): BrowserGalleryItem[] {
  const gapWidth = Math.max(0, files.length - 1) * BROWSER_GALLERY_GAP;
  const ratioSum = files.reduce((total, item) => total + item.ratio, 0);
  const rowHeight =
    justify && ratioSum > 0
      ? Math.max(64, Math.round((availableWidth - gapWidth) / ratioSum))
      : targetRowHeight;

  return files.map(({ file, index, ratio }) => ({
    file,
    index,
    height: rowHeight,
    width: Math.max(40, Math.round(rowHeight * ratio)),
  }));
}

function getBrowserFileAspectRatio(
  file: BrowserDisplayFile,
  runtimeDimensions?: BrowserRuntimeDimensions,
): number {
  if (
    runtimeDimensions &&
    runtimeDimensions.width > 0 &&
    runtimeDimensions.height > 0
  ) {
    return clampAspectRatio(runtimeDimensions.width / runtimeDimensions.height);
  }

  if (file.width && file.height && file.width > 0 && file.height > 0) {
    return clampAspectRatio(file.width / file.height);
  }

  const extension = file.extension?.toLowerCase() ?? "";

  if (isVideoExtension(extension)) {
    return 16 / 9;
  }

  return 1;
}

function clampAspectRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }

  return Math.min(4, Math.max(0.25, ratio));
}

function renderBrowserMedia(
  file: BrowserDisplayFile,
  shouldLoadPreview: boolean,
  onImageLoad: (
    fileId: number,
    event: SyntheticEvent<HTMLImageElement>,
  ) => void,
): JSX.Element {
  const extension = file.extension?.toLowerCase() ?? "";

  if (isImageExtension(extension)) {
    const previewUrl =
      "thumbnailUrl" in file ? file.thumbnailUrl : file.mediaUrl;

    return shouldLoadPreview ? (
      <img
        alt={file.fileName}
        loading="lazy"
        src={previewUrl}
        onLoad={(event) => onImageLoad(file.id, event)}
      />
    ) : (
      <span />
    );
  }

  if (isVideoExtension(extension)) {
    if ("thumbnailUrl" in file) {
      return shouldLoadPreview ? (
        <img
          alt={file.fileName}
          loading="lazy"
          src={file.thumbnailUrl}
          onLoad={(event) => onImageLoad(file.id, event)}
        />
      ) : (
        <span />
      );
    }

    return shouldLoadPreview ? (
      <video muted preload="metadata" src={file.mediaUrl} />
    ) : (
      <span />
    );
  }

  if (isAudioExtension(extension)) {
    return shouldLoadPreview ? (
      <audio controls preload="metadata" src={file.mediaUrl} />
    ) : (
      <span />
    );
  }

  return <span>{extension || "file"}</span>;
}

function sortBrowserFiles(
  files: BrowserDisplayFile[],
  sortKey: BrowserSortKey,
  direction: BrowserSortDirection,
): BrowserDisplayFile[] {
  if (files.some(isImportQueueFile)) {
    return files;
  }

  const multiplier = direction === "asc" ? 1 : -1;

  return [...files].sort((left, right) => {
    const leftValue = getBrowserSortValue(left, sortKey);
    const rightValue = getBrowserSortValue(right, sortKey);

    return (
      compareText(leftValue, rightValue) * multiplier ||
      (left.id - right.id) * multiplier
    );
  });
}

function getBrowserSortValue(
  file: BrowserDisplayFile,
  sortKey: BrowserSortKey,
): string {
  if (isImportQueueFile(file)) {
    return "";
  }

  return sortKey === "updatedAt" ? file.updatedAt : file.importedAt;
}

function patchFileFavorite(
  files: BrowserDisplayFile[],
  fileId: number,
  favorite: boolean,
): BrowserDisplayFile[] {
  let changed = false;
  const nextFiles = files.map((file) => {
    if (
      isImportQueueFile(file) ||
      file.id !== fileId ||
      file.isFavorite === favorite
    ) {
      return file;
    }

    changed = true;
    return { ...file, isFavorite: favorite };
  });

  return changed ? nextFiles : files;
}

function patchFileRating(
  files: BrowserDisplayFile[],
  fileId: number,
  group: RatingGroupRecord,
  entry: RatingEntryRecord,
): BrowserDisplayFile[] {
  let changed = false;
  const nextFiles = files.map((file) => {
    if (isImportQueueFile(file) || file.id !== fileId) {
      return file;
    }

    changed = true;
    return {
      ...file,
      ratings: [
        ...file.ratings.filter((rating) => rating.groupId !== group.id),
        {
          groupId: group.id,
          groupName: group.name,
          entryId: entry.id,
          label: entry.label,
          color: entry.color,
        },
      ],
    };
  });

  return changed ? nextFiles : files;
}

function warmDecodedPreviewCache(files: BrowserDisplayFile[]): void {
  const viewedAt = Date.now();

  for (const file of files) {
    if (!usesThumbnailPreview(file) || !("thumbnailUrl" in file)) {
      continue;
    }

    if (decodedPreviewCache.has(file.thumbnailUrl)) {
      touchDecodedPreview(file.thumbnailUrl, viewedAt);
      continue;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = file.thumbnailUrl;
    decodedPreviewCache.set(file.thumbnailUrl, {
      image,
      lastViewedAt: viewedAt,
    });
    trimDecodedPreviewCache();

    if (typeof image.decode === "function") {
      void image.decode().catch(() => {
        decodedPreviewCache.delete(file.thumbnailUrl);
      });
    }
  }
}

function usesThumbnailPreview(file: BrowserDisplayFile): boolean {
  const extension = file.extension?.toLowerCase() ?? "";
  return (
    isImageExtension(extension) ||
    (isVideoExtension(extension) && "thumbnailUrl" in file)
  );
}

function isPreviewCached(
  file: BrowserDisplayFile,
  cachedUrls: Set<string>,
): boolean {
  const previewUrl = getBrowserPreviewUrl(file);
  return Boolean(previewUrl && cachedUrls.has(previewUrl));
}

function getBrowserPreviewUrl(file: BrowserDisplayFile): string | null {
  if (!usesThumbnailPreview(file)) {
    return null;
  }

  return "thumbnailUrl" in file ? file.thumbnailUrl : file.mediaUrl;
}

function touchDecodedPreview(url: string, viewedAt: number): void {
  const entry = decodedPreviewCache.get(url);

  if (!entry) {
    return;
  }

  decodedPreviewCache.delete(url);
  decodedPreviewCache.set(url, { ...entry, lastViewedAt: viewedAt });
}

function trimDecodedPreviewCache(): void {
  while (decodedPreviewCache.size > DECODED_PREVIEW_CACHE_LIMIT) {
    const oldestKey = findOldestDecodedPreviewKey();

    if (!oldestKey) {
      return;
    }

    decodedPreviewCache.delete(oldestKey);
  }
}

function findOldestDecodedPreviewKey(): string | null {
  let oldestKey: string | null = null;
  let oldestViewedAt = Number.POSITIVE_INFINITY;

  for (const [url, entry] of decodedPreviewCache) {
    if (entry.lastViewedAt < oldestViewedAt) {
      oldestKey = url;
      oldestViewedAt = entry.lastViewedAt;
    }
  }

  return oldestKey;
}

function getDecodedPreviewCacheUrls(): Set<string> {
  return new Set(decodedPreviewCache.keys());
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function isImportQueueFile(
  file: BrowserDisplayFile,
): file is ImportQueueFileRecord {
  return "duplicate" in file && "status" in file;
}
