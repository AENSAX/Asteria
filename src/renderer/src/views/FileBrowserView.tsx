import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiSettings,
  BrowserFileRecord,
  ImportQueueFileRecord,
  RatingGroupRecord,
} from "../../../shared/ipc";
import { FileContextMenu } from "../components/FileContextMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { FileRatingStack } from "../components/FileRatingStack";
import { useBoxSelection } from "../hooks/useBoxSelection";
import { useShortcut } from "../hooks/useShortcut";
import { mergeIds } from "../utils/ids";
import {
  listenInterfaceSettingsChanged,
  loadInterfaceSettings,
} from "../utils/interfaceSettings";
import { filesChangedAffectsBrowserPage } from "../utils/filesChanged";
import { isImageExtension, isVideoExtension } from "../utils/media";
import { getFileDomainDisplayName, useLanguage } from "../utils/language";

interface FileBrowserViewProps {
  searchQuery: string;
  refreshSequence: number;
  importQueueMode: boolean;
  state: BrowserViewState;
  onImportQueueEmpty: () => void;
  onSelectionChange: (fileIds: number[]) => void;
  onStateChange: (state: BrowserViewState) => void;
}

type BrowserDisplayFile = BrowserFileRecord | ImportQueueFileRecord;
export type BrowserSortKey = "importedAt" | "updatedAt";
export type BrowserSortDirection = "asc" | "desc";

export interface BrowserViewState {
  sortKey: BrowserSortKey;
  sortDirection: BrowserSortDirection;
}

const BROWSER_GRID_GAP = 8;
const BROWSER_GRID_PADDING = 8;
const BROWSER_PREVIEW_OVERSCAN_ROWS = 1;
const DECODED_PREVIEW_CACHE_LIMIT = 384;
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
  "grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_24px] bg-(--panel)";
const browserGridClass =
  "relative grid min-h-0 content-start justify-start gap-2 overflow-auto p-2";
const browserCellClass =
  "browser-file-cell relative grid overflow-hidden border border-(--line) bg-(--surface-bg) cursor-default";
const browserCellPendingClass = "pending";
const importBadgeClass =
  "absolute right-1 bottom-1 z-[2] border border-(--line-strong) bg-(--surface-bg) px-1.5 leading-5 text-[10px] text-(--muted)";
const importBadgeDuplicateClass = "border-(--warning) text-(--warning-ink)";
const browserMediaClass =
  "grid h-full w-full place-items-center overflow-hidden [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>span]:text-(--muted)";
const browserStatusClass =
  "flex h-6 min-w-0 items-center justify-end gap-1.5 border-t border-(--line) bg-(--surface-bg) px-2 text-(--muted)";
const browserSelectClass =
  "h-[18px] min-w-[72px] border border-(--line-strong) bg-(--surface-inset-bg) text-(--ink)";
const browserPagerClass = "inline-flex min-w-0 items-center gap-1";
const browserPagerButtonClass = "ui-button ui-button-compact min-w-[38px]";
const browserPagerInputClass =
  "h-[18px] w-[42px] border border-(--line-strong) bg-(--surface-inset-bg) px-1 text-(--ink) leading-4";
const contextMenuClass =
  "fixed z-30 w-[142px] border border-(--line-strong) bg-(--panel) p-1 [&>button]:block [&>button]:h-6 [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-left [&>button]:text-[11px] [&>button]:text-(--ink) [&>button:hover]:bg-(--accent-weak)";

export function FileBrowserView({
  importQueueMode,
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
  const [activeRatingGroups, setActiveRatingGroups] = useState<
    RatingGroupRecord[]
  >([]);
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
  const [currentPage, setCurrentPage] = useState(1);
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
  const previewFrameRef = useRef<number | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
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
  const pageEndIndex = pageStartIndex + pageFiles.length;
  const boxSelection = useBoxSelection({
    containerRef: gridRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: pendingFileIds,
    onSelect: setPendingFileIds,
    onLastSelectedId: setLastPendingFileId,
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
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const grid = gridRef.current;

    if (grid) {
      grid.scrollTop = 0;
    }

    setVisiblePreviewIds([]);
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
      setVisiblePreviewIds([]);
      return undefined;
    }

    function updateVisiblePreviews(): void {
      previewFrameRef.current = null;
      const currentGrid = gridRef.current;

      if (!currentGrid) {
        setVisiblePreviewIds([]);
        return;
      }

      setVisiblePreviewIds(
        calculateVisiblePreviewIds(currentGrid, pageFiles, previewSize),
      );
    }

    function scheduleVisiblePreviewUpdate(): void {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }

      previewFrameRef.current = requestAnimationFrame(updateVisiblePreviews);
    }

    updateVisiblePreviews();
    grid.addEventListener("scroll", scheduleVisiblePreviewUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleVisiblePreviewUpdate);

    return () => {
      grid.removeEventListener("scroll", scheduleVisiblePreviewUpdate);
      window.removeEventListener("resize", scheduleVisiblePreviewUpdate);

      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
    };
  }, [pageFiles, previewSize]);

  useEffect(() => {
    if (visiblePreviewIds.length === 0) {
      return;
    }

    const visibleFiles = pageFiles.filter((file) =>
      visiblePreviewIds.includes(file.id),
    );
    const thumbnailFileIds = visibleFiles
      .filter(usesThumbnailPreview)
      .map((file) => file.id);

    if (thumbnailFileIds.length > 0) {
      void window.asteria?.preloadThumbnails(thumbnailFileIds);
    }

    warmDecodedPreviewCache(visibleFiles);
    setCachedPreviewUrls(getDecodedPreviewCacheUrls());
  }, [pageFiles, visiblePreviewIds]);

  useShortcut("select-all", () => {
    const fileIds = pageFiles.map((file) => file.id);
    setPendingFileIds(fileIds);
    setLastPendingFileId(fileIds[fileIds.length - 1] ?? null);
  });
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
    function closeContextMenu(): void {
      setContextMenu(null);
      setBlankContextMenu(null);
    }

    window.addEventListener("mousedown", closeContextMenu);

    return () => {
      window.removeEventListener("mousedown", closeContextMenu);
    };
  }, []);

  async function loadBrowserFiles(): Promise<void> {
    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    setMessage(t("window.browser.loading"));

    try {
      const nextFiles = importQueueMode
        ? await window.asteria.listImportQueueFiles()
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
      const [nextRatingGroups, nextAiSettings] = importQueueMode
        ? ([[], defaultAiSettings] as const)
        : await Promise.all([
            window.asteria.listRatingGroups(),
            window.asteria.getAiSettings(),
          ]);
      setFiles(nextDisplayFiles);
      setTotalFileCount(nextTotalCount);
      setVisiblePreviewIds([]);
      setActiveRatingGroups(nextRatingGroups.filter((group) => group.isActive));
      setAiSettings(nextAiSettings);
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

  function handleBrowserGridMouseDown(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    if (event.target === event.currentTarget) {
      setPendingFileIds([]);
      setLastPendingFileId(null);
      setContextMenu(null);
      setBlankContextMenu(null);
    }
  }

  function handleBrowserGridMouseDownCapture(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    boxSelection.handleMouseDownCapture(event);
  }

  function handleBrowserGridContextMenu(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setPendingFileIds([]);
    setLastPendingFileId(null);
    setBlankContextMenu({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleBrowserFileMouseDown(
    event: React.MouseEvent<HTMLElement>,
    file: BrowserDisplayFile,
    index: number,
  ): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const isPending = pendingFileIds.includes(file.id);

    if (event.shiftKey && lastPendingFileId !== null) {
      const anchorIndex = pageFiles.findIndex(
        (item) => item.id === lastPendingFileId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = pageFiles.slice(start, end + 1).map((item) => item.id);

        setPendingFileIds((currentIds) =>
          event.ctrlKey ? mergeIds(currentIds, rangeIds) : rangeIds,
        );
        return;
      }
    }

    if (event.ctrlKey) {
      setPendingFileIds((currentIds) =>
        isPending
          ? currentIds.filter((id) => id !== file.id)
          : [...currentIds, file.id],
      );
      setLastPendingFileId(file.id);
      return;
    }

    if (isPending && pendingFileIds.length === 1 && !importQueueMode) {
      void openFileDetail(file.id);
      return;
    }

    setPendingFileIds([file.id]);
    setLastPendingFileId(file.id);
  }

  async function handleBrowserFileContextMenu(
    event: React.MouseEvent<HTMLElement>,
    file: BrowserDisplayFile,
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const menuX = event.clientX;
    const menuY = event.clientY;
    const fileIds =
      pendingFileIds.includes(file.id) && pendingFileIds.length > 1
        ? pendingFileIds
        : [file.id];
    const selectedFiles = pageFiles.filter((item) => fileIds.includes(item.id));
    const latestAiSettings =
      !importQueueMode && window.asteria
        ? await window.asteria.getAiSettings()
        : aiSettings;
    const latestTagTranslationSettings =
      !importQueueMode && window.asteria
        ? await window.asteria.getTagTranslationSettings()
        : null;

    if (fileIds.length === 1) {
      setPendingFileIds([file.id]);
      setLastPendingFileId(file.id);
    }

    setAiSettings(latestAiSettings);
    setContextMenu({
      x: menuX,
      y: menuY,
      fileIds,
      canAiRetag:
        !importQueueMode &&
        latestAiSettings.enableImageRetagContextMenu &&
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (item) =>
            !isImportQueueFile(item) && isImageExtension(item.extension ?? ""),
        ),
      canAiAppendTag:
        !importQueueMode &&
        latestAiSettings.enableImageAppendTagContextMenu &&
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (item) =>
            !isImportQueueFile(item) && isImageExtension(item.extension ?? ""),
        ),
      canTranslateTags:
        !importQueueMode &&
        Boolean(latestTagTranslationSettings?.enableContextMenuTranslation) &&
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
    await window.asteria?.tagFilesWithAi(fileIds, overwrite);
    await loadBrowserFiles();
  }

  async function translateTags(fileIds: number[]): Promise<void> {
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.translateFileTags(fileIds);
    await loadBrowserFiles();
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
    if (importQueueMode) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.trashFiles(fileIds);
    setPendingFileIds([]);
    setLastPendingFileId(null);
    await loadBrowserFiles();
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
    const confirmedDuplicateIds: number[] = [];

    for (const file of queueFiles) {
      if (!file.duplicate) {
        continue;
      }

      const confirmed = await window.asteria.confirmDialog({
        title: t("app.status.duplicateConfirmTitle"),
        message: t("app.status.duplicateConfirmMessage", {
          domainName: getFileDomainDisplayName(file.duplicate.domain, t),
        }),
      });

      if (confirmed) {
        confirmedDuplicateIds.push(file.id);
      }
    }

    const result = await window.asteria.commitImportQueue(
      fileIds,
      confirmedDuplicateIds,
    );
    setPendingFileIds([]);
    setLastPendingFileId(null);
    setFiles(result.remainingQueue);

    if (result.remainingQueue.length === 0) {
      onImportQueueEmpty();
    }
  }

  async function removeQueueFiles(fileIds: number[]): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setContextMenu(null);
    await window.asteria.removeImportQueueFiles(fileIds);
    setPendingFileIds([]);
    setLastPendingFileId(null);
    await loadBrowserFiles();
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

  function changePage(offset: -1 | 1): void {
    setCurrentPage((page) => Math.min(totalPages, Math.max(1, page + offset)));
  }

  return (
    <section className={browserRootClass}>
      <div
        className={browserGridClass}
        ref={gridRef}
        style={{
          gridAutoRows: `${previewSize}px`,
          gridTemplateColumns: `repeat(auto-fill, ${previewSize}px)`,
        }}
        onContextMenu={handleBrowserGridContextMenu}
        onMouseDownCapture={handleBrowserGridMouseDownCapture}
        onMouseDown={handleBrowserGridMouseDown}
      >
        {pageFiles.length > 0 ? (
          pageFiles.map((file, index) => (
            <article
              className={`${browserCellClass} ${pendingFileIds.includes(file.id) ? browserCellPendingClass : ""}`}
              data-box-select-id={file.id}
              key={file.id}
              style={{
                height: `${previewSize}px`,
                width: `${previewSize}px`,
              }}
              onMouseDown={(event) =>
                handleBrowserFileMouseDown(event, file, index)
              }
              onContextMenu={(event) =>
                void handleBrowserFileContextMenu(event, file)
              }
            >
              {isImportQueueFile(file) ? (
                <div
                  className={`${importBadgeClass} ${file.duplicate ? importBadgeDuplicateClass : ""}`}
                >
                  {file.duplicate
                    ? t("window.import.duplicate")
                    : file.status === "failed"
                      ? t("window.import.failed")
                      : t("window.browser.pending")}
                </div>
              ) : (
                <>
                  <FileRatingStack ratings={file.ratings} />
                  <FavoriteButton
                    active={Boolean(file.isFavorite)}
                    onToggle={() => void toggleFavorite(file)}
                  />
                </>
              )}
              <div className={browserMediaClass}>
                {renderBrowserMedia(
                  file,
                  visiblePreviewIds.includes(file.id) ||
                    isPreviewCached(file, cachedPreviewUrls),
                )}
              </div>
            </article>
          ))
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
            className={browserPagerButtonClass}
            disabled={clampedPage <= 1}
            type="button"
            onClick={() => setCurrentPage(1)}
          >
            {t("window.browser.firstPage")}
          </button>
          <button
            className={browserPagerButtonClass}
            disabled={clampedPage <= 1}
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            {t("window.browser.previousPage")}
          </button>
          <input
            className={browserPagerInputClass}
            aria-label={t("window.browser.pageInput")}
            max={totalPages}
            min={1}
            type="number"
            value={clampedPage}
            onChange={(event) =>
              setCurrentPage(normalizePageInput(event.target.value, totalPages))
            }
          />
          <span>/ {totalPages}</span>
          <button
            className={browserPagerButtonClass}
            disabled={clampedPage >= totalPages}
            type="button"
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
          >
            {t("window.browser.nextPage")}
          </button>
          <button
            className={browserPagerButtonClass}
            disabled={clampedPage >= totalPages}
            type="button"
            onClick={() => setCurrentPage(totalPages)}
          >
            {t("window.browser.lastPage")}
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

function renderBrowserMedia(
  file: BrowserDisplayFile,
  shouldLoadPreview: boolean,
): JSX.Element {
  const extension = file.extension?.toLowerCase() ?? "";

  if (isImageExtension(extension)) {
    const previewUrl =
      "thumbnailUrl" in file ? file.thumbnailUrl : file.mediaUrl;

    return shouldLoadPreview ? (
      <img alt={file.fileName} loading="lazy" src={previewUrl} />
    ) : (
      <span />
    );
  }

  if (isVideoExtension(extension)) {
    const previewUrl =
      "thumbnailUrl" in file ? file.thumbnailUrl : file.mediaUrl;

    return shouldLoadPreview ? (
      <img alt={file.fileName} loading="lazy" src={previewUrl} />
    ) : (
      <span />
    );
  }

  return <span>{extension || "file"}</span>;
}

function calculateVisiblePreviewIds(
  grid: HTMLDivElement,
  files: BrowserDisplayFile[],
  cellSize: number,
): number[] {
  if (files.length === 0 || grid.clientWidth <= 0 || grid.clientHeight <= 0) {
    return [];
  }

  const columnStride = cellSize + BROWSER_GRID_GAP;
  const rowStride = cellSize + BROWSER_GRID_GAP;
  const usableWidth = Math.max(0, grid.clientWidth - BROWSER_GRID_PADDING * 2);
  const columnCount = Math.max(
    1,
    Math.floor((usableWidth + BROWSER_GRID_GAP) / columnStride),
  );
  const overscan = BROWSER_PREVIEW_OVERSCAN_ROWS * rowStride;
  const viewportStart = Math.max(
    0,
    grid.scrollTop - BROWSER_GRID_PADDING - overscan,
  );
  const viewportEnd =
    grid.scrollTop + grid.clientHeight - BROWSER_GRID_PADDING + overscan;
  const firstRow = Math.max(0, Math.floor(viewportStart / rowStride));
  const lastRow = Math.max(firstRow, Math.floor(viewportEnd / rowStride));
  const firstIndex = firstRow * columnCount;
  const lastIndex = Math.min(files.length - 1, (lastRow + 1) * columnCount - 1);
  const visibleIds: number[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const file = files[index];

    if (file) {
      visibleIds.push(file.id);
    }
  }

  return visibleIds;
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
  return isImageExtension(extension) || isVideoExtension(extension);
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

function normalizePageInput(value: string, totalPages: number): number {
  const page = Number(value);

  if (!Number.isInteger(page)) {
    return 1;
  }

  return Math.min(totalPages, Math.max(1, page));
}

function isImportQueueFile(
  file: BrowserDisplayFile,
): file is ImportQueueFileRecord {
  return "duplicate" in file && "status" in file;
}
