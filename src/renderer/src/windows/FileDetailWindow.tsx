import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  FileDomain,
  FileDetailRecord,
  FileTagRecord,
  RatingGroupRecord,
  TagStyleRecord,
} from "../../../shared/ipc";
import { FileContextMenu } from "../components/FileContextMenu";
import { FavoriteButton } from "../components/FavoriteButton";
import { FileRatingStack } from "../components/FileRatingStack";
import { ResizableColumns } from "../components/ResizableColumns";
import { TagTokenInput } from "../components/TagTokenInput";
import { useBoxSelection } from "../hooks/useBoxSelection";
import { useShortcut } from "../hooks/useShortcut";
import { useTagTokenInput } from "../hooks/useTagTokenInput";
import { mergeIds } from "../utils/ids";
import {
  isAudioExtension,
  isImageExtension,
  isVideoExtension,
} from "../utils/media";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../utils/tags";
import { filesChangedIncludes } from "../utils/filesChanged";
import { type TranslationFunction, useLanguage } from "../utils/language";

interface FileDetailWindowProps {
  fileId: number;
}

const detailShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[148px_minmax(0,1fr)] border border-(--line) bg-(--panel)";
const detailTagsClass =
  "grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] border-r border-(--line) bg-(--surface-bg)";
const tagListClass = "relative min-h-0 overflow-auto p-1.5";
const fileTagGroupClass = "mb-2 border-b border-(--border-dark)";
const fileTagHeaderClass =
  "mb-1.5 grid h-6 grid-cols-[minmax(0,1fr)_auto] border-y border-(--border-dark) border-t-(--line-strong) bg-(--group-header-bg) px-1.5 leading-[22px] font-semibold text-(--group-header-ink)";
const fileTagGroupBodyClass = "flex flex-wrap content-start gap-1";
const fileTagItemClass =
  "file-tag-item inline-flex max-w-full min-h-[18px] cursor-default overflow-hidden border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[11px] text-(--ink)";
const domainFileTagItemClass =
  "inline-flex max-w-full min-h-[18px] cursor-default overflow-hidden border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[11px] text-(--ink)";
const inferredFileTagItemClass =
  "inline-flex max-w-full min-h-[18px] cursor-default overflow-hidden border border-(--line) bg-(--surface-bg) px-1.5 text-[11px] text-(--muted)";
const fileTagPendingClass = "pending";
const detailContentClass =
  "relative grid min-h-0 min-w-0 place-items-center overflow-hidden bg-(--surface-media-bg)";
const detailMessageClass = "text-(--muted)";
const detailAudioClass = "w-[min(520px,calc(100%-32px))]";
const detailImageStageClass =
  "grid h-full w-full min-h-0 min-w-0 place-items-center overflow-hidden cursor-grab";
const detailVideoStageClass = detailImageStageClass;
const detailMediaClass = "max-h-full max-w-full object-contain";
const screeningStatusClass =
  "absolute bottom-2 right-2 h-[22px] min-w-[54px] border border-(--line-strong) bg-(--surface-bg) px-1.5 text-center leading-5 text-(--muted)";

export function FileDetailWindow({
  fileId,
}: FileDetailWindowProps): JSX.Element {
  const { t } = useLanguage();
  const [currentFileId, setCurrentFileId] = useState(fileId);
  const [file, setFile] = useState<FileDetailRecord | null>(null);
  const [orderedFileIds, setOrderedFileIds] = useState<number[]>([]);
  const [activeRatingGroups, setActiveRatingGroups] = useState<
    RatingGroupRecord[]
  >([]);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    canAiRetag: boolean;
    canAiAppendTag: boolean;
    canTranslateTags: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  const imageDragRef = useRef({
    active: false,
    pointerId: 0,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });

  useEffect(() => {
    void loadFileDetail();
  }, [currentFileId]);

  useEffect(() => {
    function closeContextMenu(): void {
      setContextMenu(null);
    }

    window.addEventListener("mousedown", closeContextMenu);

    return () => {
      window.removeEventListener("mousedown", closeContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    const unsubscribeReset = window.asteria.onFileDetailReset((nextFileId) => {
      resetImageViewport();
      setCurrentFileId(nextFileId);

      if (nextFileId === currentFileId) {
        void loadFileDetail();
      }
    });

    const unsubscribeFilesChanged = window.asteria.onFilesChanged((payload) => {
      if (filesChangedIncludes(payload, currentFileId)) {
        void loadFileDetail();
      }
    });

    const unsubscribeFavoriteChanged = window.asteria.onFileFavoriteChanged(
      (nextFileId, favorite) => {
        setFile((currentFile) =>
          currentFile && currentFile.id === nextFileId
            ? { ...currentFile, isFavorite: favorite }
            : currentFile,
        );
      },
    );

    return () => {
      unsubscribeReset();
      unsubscribeFilesChanged();
      unsubscribeFavoriteChanged();
    };
  }, [currentFileId]);

  useShortcut("detail-previous-file", () => switchFile(-1), {
    enabled: orderedFileIds.length > 0,
  });
  useShortcut("detail-next-file", () => switchFile(1), {
    enabled: orderedFileIds.length > 0,
  });

  async function loadFileDetail(): Promise<void> {
    if (!Number.isInteger(currentFileId) || currentFileId <= 0) {
      setMessage(t("window.fileDetail.invalid"));
      return;
    }

    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    try {
      const [nextFile, contextFileIds, fallbackOrderedFiles, nextRatingGroups] =
        await Promise.all([
          window.asteria.getFileDetail(currentFileId),
          window.asteria.getFileDetailSequence(),
          window.asteria.listBrowserFiles(),
          window.asteria.listRatingGroups(),
        ]);

      setFile(nextFile);
      setOrderedFileIds(
        contextFileIds.length > 0
          ? contextFileIds
          : fallbackOrderedFiles.map((item) => item.id),
      );
      setActiveRatingGroups(nextRatingGroups.filter((group) => group.isActive));
      resetImageViewport();
      setMessage(nextFile ? "" : t("window.fileDetail.notFound"));
    } catch (error) {
      setFile(null);
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.fileDetail.loadFailed"),
      );
    }
  }

  async function toggleFavorite(): Promise<void> {
    if (!window.asteria || !file) {
      return;
    }

    const nextFavorite = !file.isFavorite;
    setFile({ ...file, isFavorite: nextFavorite });

    try {
      await window.asteria.setFileFavorite(file.id, nextFavorite);
    } catch (error) {
      setFile({ ...file, isFavorite: file.isFavorite });
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.fileDetail.favoriteUpdateFailed"),
      );
    }
  }

  function openContextMenu(event: React.MouseEvent<HTMLElement>): void {
    if (!file) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void openContextMenuForFile(event.clientX, event.clientY);
  }

  async function openContextMenuForFile(x: number, y: number): Promise<void> {
    const [translationSettings, aiSettings] = await Promise.all([
      window.asteria?.getTagTranslationSettings(),
      window.asteria?.getAiSettings(),
    ]);
    const isCurrentFileImage = Boolean(
      file && isImageExtension(file.extension ?? file.originalPath),
    );

    setContextMenu({
      x,
      y,
      canAiRetag: Boolean(
        aiSettings?.enableImageRetagContextMenu && isCurrentFileImage,
      ),
      canAiAppendTag: Boolean(
        aiSettings?.enableImageAppendTagContextMenu && isCurrentFileImage,
      ),
      canTranslateTags: Boolean(
        translationSettings?.enableContextMenuTranslation,
      ),
    });
  }

  async function openUrlManager(): Promise<void> {
    if (!file) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openUrlManagerWindow([file.id]);
  }

  async function openExternally(): Promise<void> {
    if (!file) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openFileExternally(file.id);
  }

  async function openExportWindow(): Promise<void> {
    if (!file) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openExportWindow([file.id]);
  }

  async function openBatchOperation(): Promise<void> {
    if (!file) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openBatchOperationWindow([file.id]);
  }

  async function translateCurrentTags(): Promise<void> {
    if (!file || !window.asteria) {
      return;
    }

    setContextMenu(null);
    await window.asteria.translateFileTags([file.id]);
    await loadFileDetail();
  }

  async function tagCurrentFileWithAi(overwrite: boolean): Promise<void> {
    if (!file || !window.asteria) {
      return;
    }

    setContextMenu(null);
    await window.asteria.tagFilesWithAi([file.id], overwrite);
    await loadFileDetail();
  }

  async function openScreening(): Promise<void> {
    if (!file) {
      return;
    }

    setContextMenu(null);
    await window.asteria?.openScreeningWindow([file.id]);
  }

  async function trashCurrentFile(): Promise<void> {
    if (!file || !window.asteria) {
      return;
    }

    const trashedFileId = file.id;
    setContextMenu(null);
    await window.asteria.trashFiles([trashedFileId]);

    const remainingFileIds = orderedFileIds.filter(
      (id) => id !== trashedFileId,
    );
    setOrderedFileIds(remainingFileIds);

    if (remainingFileIds.length === 0) {
      setFile(null);
      setMessage(t("window.fileDetail.movedToRecycleBin"));
      return;
    }

    const currentIndex = orderedFileIds.findIndex((id) => id === trashedFileId);
    const nextFileId =
      remainingFileIds[
        Math.min(Math.max(currentIndex, 0), remainingFileIds.length - 1)
      ] ?? remainingFileIds[0];

    if (nextFileId) {
      setCurrentFileId(nextFileId);
    }
  }

  async function openRatingDialog(group: RatingGroupRecord): Promise<void> {
    if (!window.asteria || !file) {
      return;
    }

    setContextMenu(null);
    await window.asteria.openFileRatingEditorWindow([file.id], group.id);
  }

  function switchFile(offset: -1 | 1): void {
    if (orderedFileIds.length === 0) {
      return;
    }

    const currentIndex = orderedFileIds.findIndex((id) => id === currentFileId);

    if (currentIndex < 0) {
      const firstFileId = orderedFileIds[0];

      if (firstFileId) {
        setCurrentFileId(firstFileId);
      }

      return;
    }

    const nextIndex =
      (currentIndex + offset + orderedFileIds.length) % orderedFileIds.length;
    const nextFileId = orderedFileIds[nextIndex];

    if (nextFileId) {
      setCurrentFileId(nextFileId);
    }
  }

  function resetImageViewport(): void {
    imageDragRef.current.active = false;
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }

  function handleImageWheel(deltaY: number): void {
    const zoomStep = deltaY < 0 ? 0.1 : -0.1;
    setImageZoom((zoom) =>
      Math.min(8, Math.max(0.1, Number((zoom + zoomStep).toFixed(2)))),
    );
  }

  function handleImagePointerDown(
    event: React.PointerEvent<HTMLElement>,
  ): void {
    if (event.button !== 0) {
      return;
    }

    imageDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePan.x,
      panY: imagePan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleImagePointerMove(
    event: React.PointerEvent<HTMLElement>,
  ): void {
    const drag = imageDragRef.current;

    if (!drag.active) {
      return;
    }

    setImagePan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    });
    event.preventDefault();
  }

  function handleImagePointerUp(event: React.PointerEvent<HTMLElement>): void {
    const drag = imageDragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    imageDragRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <ResizableColumns
      className={detailShellClass}
      defaultLeftWidth={148}
      minLeftWidth={110}
      minRightWidth={260}
      storageKey="asteria:file-detail-tags-width"
      left={
        <FileDetailTagColumn
          domain={file?.domain ?? null}
          fileId={currentFileId}
        />
      }
      right={
        <main className={detailContentClass} onContextMenu={openContextMenu}>
          {file ? (
            <>
              <FileRatingStack
                className="top-1.5 left-1.5 z-2 max-w-[calc(100%-12px)]"
                ratings={file.ratings}
              />
              <FavoriteButton
                active={Boolean(file.isFavorite)}
                onToggle={() => void toggleFavorite()}
              />
              <DetailMedia
                file={file}
                imageZoom={imageZoom}
                imagePan={imagePan}
                onImageWheel={handleImageWheel}
                onImagePointerDown={handleImagePointerDown}
                onImagePointerMove={handleImagePointerMove}
                onImagePointerUp={handleImagePointerUp}
              />
            </>
          ) : (
            <div className={detailMessageClass}>{message}</div>
          )}
          {contextMenu && file ? (
            <FileContextMenu
              activeRatingGroups={activeRatingGroups}
              canAiAppendTag={contextMenu.canAiAppendTag}
              canAiRetag={contextMenu.canAiRetag}
              canBatchOperate={isImageExtension(file.extension ?? "")}
              canManageTags={false}
              canOpenExternally
              canScreening={file.domain === "pending"}
              canTranslateTags={contextMenu.canTranslateTags}
              fileIds={[file.id]}
              x={contextMenu.x}
              y={contextMenu.y}
              onAiAppendTag={() => void tagCurrentFileWithAi(false)}
              onAiRetag={() => void tagCurrentFileWithAi(true)}
              onTranslateTags={() => void translateCurrentTags()}
              onBatchOperate={() => void openBatchOperation()}
              onManageTags={() => undefined}
              onManageUrl={() => void openUrlManager()}
              onExport={() => void openExportWindow()}
              onOpenExternally={() => void openExternally()}
              onOpenRating={(_fileIds, group) => void openRatingDialog(group)}
              onOpenScreening={() => void openScreening()}
              onTrash={() => void trashCurrentFile()}
            />
          ) : null}
        </main>
      }
    />
  );
}

interface ScreeningDetailWindowProps {
  fileIds: number[];
}

export function ScreeningDetailWindow({
  fileIds,
}: ScreeningDetailWindowProps): JSX.Element {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [file, setFile] = useState<FileDetailRecord | null>(null);
  const currentFileId = fileIds[index] ?? null;

  useEffect(() => {
    void loadFile();
  }, [currentFileId]);

  async function loadFile(): Promise<void> {
    if (!window.asteria || !currentFileId) {
      setFile(null);
      return;
    }

    setFile(await window.asteria.getFileDetail(currentFileId));
  }

  async function acceptCurrentFile(): Promise<void> {
    if (!currentFileId || !window.asteria) {
      return;
    }

    await window.asteria.setFilesDomain([currentFileId], "library");
    goNext();
  }

  async function rejectCurrentFile(): Promise<void> {
    if (!currentFileId || !window.asteria) {
      return;
    }

    await window.asteria.trashFiles([currentFileId]);
    goNext();
  }

  function goNext(): void {
    setIndex((currentIndex) => currentIndex + 1);
  }

  if (index >= fileIds.length) {
    return (
      <section className="relative">
        <div className={detailMessageClass}>
          {t("window.fileDetail.filterComplete")}
        </div>
      </section>
    );
  }

  return (
    <ResizableColumns
      className={`${detailShellClass} relative`}
      defaultLeftWidth={148}
      minLeftWidth={110}
      minRightWidth={260}
      storageKey="asteria:file-detail-tags-width"
      left={
        currentFileId ? (
          <FileDetailTagColumn
            domain={file?.domain ?? null}
            fileId={currentFileId}
          />
        ) : (
          <aside className={detailTagsClass} />
        )
      }
      right={
        <main
          className={detailContentClass}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => {
            if (event.button === 0) {
              void acceptCurrentFile();
            }

            if (event.button === 2) {
              void rejectCurrentFile();
            }
          }}
        >
          {file ? (
            <ScreeningMedia file={file} />
          ) : (
            <div className={detailMessageClass}>
              {t("window.fileDetail.notFound")}
            </div>
          )}
          <div className={screeningStatusClass}>
            {index + 1} / {fileIds.length}
          </div>
        </main>
      }
    />
  );
}

function ScreeningMedia({ file }: { file: FileDetailRecord }): JSX.Element {
  const { t } = useLanguage();
  const extension = file.extension?.toLowerCase() ?? "";

  if (isImageExtension(extension)) {
    return <ScreeningImage file={file} />;
  }

  if (isVideoExtension(extension)) {
    return <video className={detailMediaClass} controls src={file.mediaUrl} />;
  }

  if (isAudioExtension(extension)) {
    return <audio className={detailAudioClass} controls src={file.mediaUrl} />;
  }

  return (
    <div className={detailMessageClass}>
      {t("window.fileDetail.cannotPreview")}
    </div>
  );
}

function ScreeningImage({ file }: { file: FileDetailRecord }): JSX.Element {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [fitSize, setFitSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    setFitSize(null);
  }, [file.id]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateImageFitSize();
    });

    observer.observe(stage);
    updateImageFitSize();

    const image = imageRef.current;

    if (image?.complete) {
      updateImageFitSize();
    }

    return () => {
      observer.disconnect();
    };
  }, [file.id]);

  function updateImageFitSize(): void {
    const stage = stageRef.current;
    const image = imageRef.current;

    if (
      !stage ||
      !image ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0
    ) {
      setFitSize(null);
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    setFitSize(
      getContainedMediaSize(
        stageRect.width,
        stageRect.height,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  return (
    <div className={detailImageStageClass} ref={stageRef}>
      <img
        alt=""
        className={detailMediaClass}
        ref={imageRef}
        src={file.mediaUrl}
        style={{
          width: fitSize ? `${fitSize.width}px` : "1px",
          height: fitSize ? `${fitSize.height}px` : "1px",
          visibility: fitSize ? "visible" : "hidden",
        }}
        onLoad={updateImageFitSize}
      />
    </div>
  );
}

interface FileDetailTagColumnProps {
  domain: FileDomain | null;
  fileId: number;
}

function FileDetailTagColumn({
  domain,
  fileId,
}: FileDetailTagColumnProps): JSX.Element {
  const { t } = useLanguage();
  const [fileTags, setFileTags] = useState<FileTagRecord[]>([]);
  const [fileParentTags, setFileParentTags] = useState<FileTagRecord[]>([]);
  const [tagStyles, setTagStyles] = useState<TagStyleRecord[]>([]);
  const [pendingTagIds, setPendingTagIds] = useState<number[]>([]);
  const [lastPendingTagId, setLastPendingTagId] = useState<number | null>(null);
  const tagListRef = useRef<HTMLDivElement | null>(null);
  const tagInput = useTagTokenInput({
    onCommit: async (nextTokens) => {
      if (!window.asteria) {
        return;
      }

      await window.asteria.addFileTags(fileId, nextTokens);
      await loadFileTags();
    },
  });
  const groupedFileTags = useMemo(
    () => groupFileTagsByStyle(fileTags, tagStyles),
    [fileTags, tagStyles],
  );
  const orderedFileTags = useMemo(
    () => groupedFileTags.flatMap((group) => group.tags),
    [groupedFileTags],
  );
  const groupedFileParentTags = useMemo(
    () => groupFileTagsByStyle(fileParentTags, tagStyles),
    [fileParentTags, tagStyles],
  );
  const domainTag = useMemo(
    () => (domain ? createDomainFileTag(domain) : null),
    [domain],
  );
  const boxSelection = useBoxSelection({
    containerRef: tagListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: pendingTagIds,
    startOnlyFromContainer: true,
    onSelect: setPendingTagIds,
    onLastSelectedId: setLastPendingTagId,
  });

  useShortcut("select-all", () => {
    const tagIds = orderedFileTags.map((tag) => tag.id);
    setPendingTagIds(tagIds);
    setLastPendingTagId(tagIds[tagIds.length - 1] ?? null);
  });

  useEffect(() => {
    tagInput.reset();
    setPendingTagIds([]);
    setLastPendingTagId(null);
    void loadFileTags();
  }, [fileId]);

  useEffect(() => {
    function clearPendingTags(event: MouseEvent): void {
      const target = event.target as Element | null;

      if (!target?.closest(".file-tag-item")) {
        setPendingTagIds([]);
        setLastPendingTagId(null);
      }
    }

    window.addEventListener("mousedown", clearPendingTags);

    return () => {
      window.removeEventListener("mousedown", clearPendingTags);
    };
  }, []);

  async function loadFileTags(): Promise<void> {
    if (!window.asteria || !Number.isInteger(fileId) || fileId <= 0) {
      setFileTags([]);
      setFileParentTags([]);
      setTagStyles([]);
      return;
    }

    const [nextFileTags, nextFileParentTags, nextTagStyles] = await Promise.all(
      [
        window.asteria.listFileTags(fileId),
        window.asteria.listFileParentTags(fileId),
        window.asteria.listTagStyles(),
      ],
    );
    setFileTags(nextFileTags);
    setFileParentTags(nextFileParentTags);
    setTagStyles(nextTagStyles);
  }

  async function removePendingFileTags(tagIds: number[]): Promise<void> {
    if (!window.asteria || tagIds.length === 0) {
      return;
    }

    await window.asteria.removeFileTags(fileId, tagIds);
    await loadFileTags();
    setPendingTagIds([]);
    setLastPendingTagId(null);
  }

  function handleFileTagMouseDown(
    event: React.MouseEvent<HTMLElement>,
    tag: FileTagRecord,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const isPending = pendingTagIds.includes(tag.id);

    if (event.shiftKey && lastPendingTagId !== null) {
      const anchorIndex = orderedFileTags.findIndex(
        (item) => item.id === lastPendingTagId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = orderedFileTags
          .slice(start, end + 1)
          .map((item) => item.id);

        setPendingTagIds((currentTagIds) =>
          event.ctrlKey ? mergeIds(currentTagIds, rangeIds) : rangeIds,
        );
        return;
      }
    }

    if (event.ctrlKey) {
      if (isPending) {
        void removePendingFileTags(pendingTagIds);
        return;
      }

      setPendingTagIds((currentTagIds) => [...currentTagIds, tag.id]);
      setLastPendingTagId(tag.id);
      return;
    }

    if (isPending && pendingTagIds.length === 1) {
      void removePendingFileTags([tag.id]);
      return;
    }

    setPendingTagIds([tag.id]);
    setLastPendingTagId(tag.id);
  }

  return (
    <aside className={detailTagsClass} aria-label={t("window.fileDetail.tags")}>
      <div
        className={tagListClass}
        ref={tagListRef}
        onMouseDownCapture={boxSelection.handleMouseDownCapture}
      >
        {domainTag ? (
          <section className={fileTagGroupClass}>
            <header className={fileTagHeaderClass}>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                domain
              </span>
              <span className="pl-1.5 text-right">1</span>
            </header>
            <div className={fileTagGroupBodyClass}>
              <span
                className={getTagNamespaceClassName(
                  domainTag,
                  domainFileTagItemClass,
                )}
                style={getTagNamespaceStyle(domainTag)}
                title={formatTagLabel(domainTag)}
              >
                {formatTagLabel(domainTag)}
              </span>
            </div>
          </section>
        ) : null}
        {groupedFileTags.map((group) => (
          <section className={fileTagGroupClass} key={group.styleName}>
            <header className={fileTagHeaderClass}>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {group.displayName}
              </span>
              <span className="pl-1.5 text-right">{group.tags.length}</span>
            </header>
            <div className={fileTagGroupBodyClass}>
              {group.tags.map((tag) => {
                const visualIndex = orderedFileTags.findIndex(
                  (item) => item.id === tag.id,
                );

                return (
                  <button
                    className={getTagNamespaceClassName(
                      tag,
                      pendingTagIds.includes(tag.id)
                        ? `${fileTagItemClass} ${fileTagPendingClass}`
                        : fileTagItemClass,
                    )}
                    data-box-select-id={tag.id}
                    key={tag.id}
                    style={getTagNamespaceStyle(tag)}
                    title={formatTagLabel(tag)}
                    type="button"
                    onMouseDown={(event) =>
                      handleFileTagMouseDown(event, tag, visualIndex)
                    }
                  >
                    {formatTagLabel(tag)}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {groupedFileParentTags.length > 0 ? (
          <section className={fileTagGroupClass}>
            <header className={fileTagHeaderClass}>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {t("window.fileDetail.inferredTags")}
              </span>
              <span className="pl-1.5 text-right">{fileParentTags.length}</span>
            </header>
            {groupedFileParentTags.map((group) => (
              <div className="mb-1" key={group.styleName}>
                <div className="mb-1 px-1.5 text-[10px] text-(--muted)">
                  {group.displayName}
                </div>
                <div className={fileTagGroupBodyClass}>
                  {group.tags.map((tag) => (
                    <span
                      className={getTagNamespaceClassName(
                        tag,
                        inferredFileTagItemClass,
                      )}
                      key={tag.id}
                      style={getTagNamespaceStyle(tag)}
                      title={getInferredTagTitle(tag, t)}
                    >
                      {formatTagLabel(tag)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}
        {boxSelection.selectionBox ? (
          <div
            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
            style={boxSelection.selectionBox}
          />
        ) : null}
      </div>

      <TagTokenInput
        ariaLabel={t("window.fileDetail.tags")}
        placeholder={t("window.fileDetail.addTags")}
        selectedSuggestionIndex={tagInput.selectedSuggestionIndex}
        suggestions={tagInput.suggestions}
        text={tagInput.text}
        tokens={tagInput.tokens}
        onKeyDown={tagInput.handleKeyDown}
        onPickSuggestion={tagInput.addTokenFromSuggestion}
        onTextChange={tagInput.setText}
      />
    </aside>
  );
}

interface FileTagStyleGroup {
  styleName: string;
  displayName: string;
  isDefault: boolean;
  tags: FileTagRecord[];
}

function groupFileTagsByStyle(
  fileTags: FileTagRecord[],
  tagStyles: TagStyleRecord[],
): FileTagStyleGroup[] {
  const styleByName = new Map(tagStyles.map((style) => [style.name, style]));
  const groups = new Map<string, FileTagStyleGroup>();

  for (const tag of fileTags) {
    const style = styleByName.get(tag.styleName);
    const group = groups.get(tag.styleName) ?? {
      styleName: tag.styleName,
      displayName: style?.displayName ?? tag.styleName,
      isDefault: Boolean(style?.isDefault),
      tags: [],
    };

    group.tags.push(tag);
    groups.set(tag.styleName, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      tags: [...group.tags].sort((left, right) =>
        formatTagLabel(left).localeCompare(formatTagLabel(right)),
      ),
    }))
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      const countCompare = right.tags.length - left.tags.length;

      if (countCompare !== 0) {
        return countCompare;
      }

      return left.displayName.localeCompare(right.displayName);
    });
}

function createDomainFileTag(domain: FileDomain): FileTagRecord {
  return {
    id: createDomainPseudoTagId(domain),
    styleName: "domain",
    namespace: "domain",
    name: domain,
    displayName: null,
    createdAt: "",
  };
}

function createDomainPseudoTagId(domain: FileDomain): number {
  if (domain === "pending") {
    return -1;
  }

  if (domain === "library") {
    return -2;
  }

  return -3;
}

function getInferredTagTitle(
  tag: FileTagRecord,
  t: TranslationFunction,
): string {
  const label = formatTagLabel(tag);

  if (tag.semanticKind === "canonical") {
    return t("window.fileDetail.canonicalTagTitle", { tag: label });
  }

  return t("window.fileDetail.inferredTagTitle", { tag: label });
}

interface DetailMediaProps {
  file: FileDetailRecord;
  imageZoom: number;
  imagePan: { x: number; y: number };
  onImageWheel: (deltaY: number) => void;
  onImagePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onImagePointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onImagePointerUp: (event: React.PointerEvent<HTMLElement>) => void;
}

function DetailMedia({
  file,
  imageZoom,
  imagePan,
  onImageWheel,
  onImagePointerDown,
  onImagePointerMove,
  onImagePointerUp,
}: DetailMediaProps): JSX.Element {
  const { t } = useLanguage();
  const extension = file.extension?.toLowerCase() ?? "";

  if (isImageExtension(extension)) {
    return (
      <DetailImage
        key={file.id}
        file={file}
        imagePan={imagePan}
        imageZoom={imageZoom}
        onImagePointerDown={onImagePointerDown}
        onImagePointerMove={onImagePointerMove}
        onImagePointerUp={onImagePointerUp}
        onImageWheel={onImageWheel}
      />
    );
  }

  if (isVideoExtension(extension)) {
    return (
      <DetailVideo
        key={file.id}
        file={file}
        mediaPan={imagePan}
        mediaZoom={imageZoom}
        onMediaPointerDown={onImagePointerDown}
        onMediaPointerMove={onImagePointerMove}
        onMediaPointerUp={onImagePointerUp}
        onMediaWheel={onImageWheel}
      />
    );
  }

  if (isAudioExtension(extension)) {
    return <audio className={detailAudioClass} controls src={file.mediaUrl} />;
  }

  return (
    <div className={detailMessageClass}>
      {t("window.fileDetail.cannotPreview")}
    </div>
  );
}

interface DetailVideoProps {
  file: FileDetailRecord;
  mediaPan: { x: number; y: number };
  mediaZoom: number;
  onMediaPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMediaPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onMediaPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onMediaWheel: (deltaY: number) => void;
}

function getContainedMediaSize(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): { width: number; height: number } {
  const scale = Math.min(
    containerWidth / mediaWidth,
    containerHeight / mediaHeight,
    1,
  );

  return {
    width: Math.max(1, Math.floor(mediaWidth * scale)),
    height: Math.max(1, Math.floor(mediaHeight * scale)),
  };
}

function DetailVideo({
  file,
  mediaPan,
  mediaZoom,
  onMediaPointerDown,
  onMediaPointerMove,
  onMediaPointerUp,
  onMediaWheel,
}: DetailVideoProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fitSize, setFitSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    setFitSize(null);
  }, [file.id]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.load();
    requestVideoPlayback(video);
  }, [file.mediaUrl]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return undefined;
    }

    function handleWheel(event: WheelEvent): void {
      event.preventDefault();
      onMediaWheel(event.deltaY);
    }

    stage.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      stage.removeEventListener("wheel", handleWheel);
    };
  }, [onMediaWheel]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateVideoFitSize();
    });

    observer.observe(stage);
    updateVideoFitSize();

    const video = videoRef.current;

    if (video && video.readyState >= 1) {
      updateVideoFitSize();
    }

    return () => {
      observer.disconnect();
    };
  }, [file.id]);

  function updateVideoFitSize(): void {
    const stage = stageRef.current;
    const video = videoRef.current;

    if (!stage || !video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setFitSize(null);
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    setFitSize(
      getContainedMediaSize(
        stageRect.width,
        stageRect.height,
        video.videoWidth,
        video.videoHeight,
      ),
    );
  }

  function isVideoControlArea(
    event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ): boolean {
    const rect = event.currentTarget.getBoundingClientRect();

    return event.clientY >= rect.bottom - 40;
  }

  function requestVideoPlayback(video: HTMLVideoElement): void {
    void video.play().catch(() => {
      // Some codecs need metadata before playback can begin; media events retry below.
    });
  }

  function restartVideo(video: HTMLVideoElement): void {
    try {
      video.pause();
      video.currentTime = 0;
    } catch {
      // Some files do not support reliable seek after ending; reloading below handles that path.
    }

    video.load();
    requestVideoPlayback(video);
  }

  return (
    <div
      className={detailVideoStageClass}
      ref={stageRef}
      onClickCapture={(event) => {
        if (!isVideoControlArea(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerDown={(event) => {
        if (isVideoControlArea(event)) {
          return;
        }

        onMediaPointerDown(event);
      }}
      onPointerMove={onMediaPointerMove}
      onPointerUp={onMediaPointerUp}
      onPointerCancel={onMediaPointerUp}
    >
      <video
        autoPlay
        className={detailMediaClass}
        controls
        ref={videoRef}
        src={file.mediaUrl}
        style={{
          width: fitSize ? `${fitSize.width}px` : "1px",
          height: fitSize ? `${fitSize.height}px` : "1px",
          visibility: fitSize ? "visible" : "hidden",
          transform: `translate(${mediaPan.x}px, ${mediaPan.y}px) scale(${mediaZoom})`,
        }}
        onCanPlay={(event) => {
          updateVideoFitSize();
          requestVideoPlayback(event.currentTarget);
        }}
        onEnded={(event) => {
          restartVideo(event.currentTarget);
        }}
        onLoadedData={updateVideoFitSize}
        onLoadedMetadata={(event) => {
          updateVideoFitSize();
          requestVideoPlayback(event.currentTarget);
        }}
      />
    </div>
  );
}

interface DetailImageProps {
  file: FileDetailRecord;
  imageZoom: number;
  imagePan: { x: number; y: number };
  onImageWheel: (deltaY: number) => void;
  onImagePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onImagePointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onImagePointerUp: (event: React.PointerEvent<HTMLElement>) => void;
}

function DetailImage({
  file,
  imageZoom,
  imagePan,
  onImageWheel,
  onImagePointerDown,
  onImagePointerMove,
  onImagePointerUp,
}: DetailImageProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [fitSize, setFitSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    setFitSize(null);
  }, [file.id]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return undefined;
    }

    function handleWheel(event: WheelEvent): void {
      event.preventDefault();
      onImageWheel(event.deltaY);
    }

    stage.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      stage.removeEventListener("wheel", handleWheel);
    };
  }, [onImageWheel]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateImageFitSize();
    });

    observer.observe(stage);
    updateImageFitSize();

    const image = imageRef.current;

    if (image?.complete) {
      updateImageFitSize();
    }

    return () => {
      observer.disconnect();
    };
  }, [file.id]);

  function updateImageFitSize(): void {
    const stage = stageRef.current;
    const image = imageRef.current;

    if (
      !stage ||
      !image ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0
    ) {
      setFitSize(null);
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    setFitSize(
      getContainedMediaSize(
        stageRect.width,
        stageRect.height,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  return (
    <div
      className={detailImageStageClass}
      ref={stageRef}
      onPointerDown={onImagePointerDown}
      onPointerMove={onImagePointerMove}
      onPointerUp={onImagePointerUp}
      onPointerCancel={onImagePointerUp}
    >
      <img
        alt=""
        className={detailMediaClass}
        ref={imageRef}
        src={file.mediaUrl}
        style={{
          width: fitSize ? `${fitSize.width}px` : "1px",
          height: fitSize ? `${fitSize.height}px` : "1px",
          visibility: fitSize ? "visible" : "hidden",
          transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
        }}
        onLoad={updateImageFitSize}
      />
    </div>
  );
}
