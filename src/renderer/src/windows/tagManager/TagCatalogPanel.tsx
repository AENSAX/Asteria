import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ManagedTagRecord,
  ManagedTagSortKey,
  SortDirection,
  TagParentRecord,
  TagSiblingRecord,
  TagStyleRecord,
} from "../../../../shared/ipc";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useLanguage } from "../../utils/language";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../../utils/tags";
import {
  emptyClass,
  managerButtonClass,
  managerInputClass,
  messageClass,
  sectionHeaderClass,
  tagCatalogHeadClass,
  tagCatalogRowClass,
} from "./classNames";
import {
  TAG_CATALOG_ROW_HEIGHT,
  createManagedTagSearchIndex,
  filterManagedTags,
  pickVisibleManagedTagRows,
  sortManagedTags,
} from "./tagManagerData";

interface TagCatalogPanelProps {
  tags: ManagedTagRecord[];
  tagParents: TagParentRecord[];
  tagSiblings: TagSiblingRecord[];
  selectedStyle: TagStyleRecord | null;
  activeStyleId: number | null;
  onRenameStyle: (name: string) => void;
  onActivateStyle: () => void;
  onDeleteStyle: () => void;
  onStageTag: (tag: ManagedTagRecord) => void;
}

export function TagCatalogPanel({
  tags,
  tagParents,
  tagSiblings,
  selectedStyle,
  activeStyleId,
  onRenameStyle,
  onActivateStyle,
  onDeleteStyle,
  onStageTag,
}: TagCatalogPanelProps): JSX.Element {
  const { t } = useLanguage();
  const [tagListQuery, setTagListQuery] = useState("");
  const [tagListSortKey, setTagListSortKey] =
    useState<ManagedTagSortKey>("name");
  const [tagListSortDirection, setTagListSortDirection] =
    useState<SortDirection>("asc");
  const [styleRenameInput, setStyleRenameInput] = useState("");
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const listRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const debouncedTagListQuery = useDebouncedValue(tagListQuery, 120);
  const tagSearchIndex = useMemo(
    () => createManagedTagSearchIndex(tags, tagParents, tagSiblings),
    [tagParents, tagSiblings, tags],
  );
  const displayedTags = useMemo(
    () =>
      sortManagedTags(
        filterManagedTags(tags, debouncedTagListQuery, tagSearchIndex),
        tagListSortKey,
        tagListSortDirection,
      ),
    [
      debouncedTagListQuery,
      tagSearchIndex,
      tagListSortDirection,
      tagListSortKey,
      tags,
    ],
  );
  const visibleRows = useMemo(
    () =>
      pickVisibleManagedTagRows(
        displayedTags,
        viewport.scrollTop,
        viewport.height,
      ),
    [displayedTags, viewport.height, viewport.scrollTop],
  );

  useEffect(() => {
    setTagListQuery("");
  }, [activeStyleId]);

  useEffect(() => {
    setStyleRenameInput(selectedStyle?.displayName ?? "");
  }, [selectedStyle?.displayName, selectedStyle?.id]);

  useEffect(() => {
    updateViewport();
  }, [displayedTags.length]);

  useEffect(() => {
    const list = listRef.current;

    if (!list) {
      return undefined;
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(list);
    updateViewport();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;

    if (list) {
      list.scrollTop = 0;
    }

    updateViewport();
  }, [
    activeStyleId,
    debouncedTagListQuery,
    tagListSortDirection,
    tagListSortKey,
  ]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  function updateViewport(): void {
    const list = listRef.current;

    if (!list) {
      setViewport({ scrollTop: 0, height: 0 });
      return;
    }

    setViewport({
      scrollTop: list.scrollTop,
      height: list.clientHeight,
    });
  }

  function scheduleViewportUpdate(): void {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      updateViewport();
    });
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[27px_auto_auto_auto_24px_minmax(0,1fr)] border-r border-(--line) bg-(--surface-bg)">
      <header className={sectionHeaderClass}>
        <span>{t("window.tagManager.currentStyleTags")}</span>
        <span className="font-normal text-(--muted)">
          {displayedTags.length} / {tags.length}
        </span>
      </header>
      <div className="grid gap-1.5 border-b border-(--line) bg-(--panel) p-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <input
            className={managerInputClass}
            aria-label={t("window.tagManager.renameStyle")}
            placeholder={t("window.tagManager.renameStylePlaceholder")}
            value={styleRenameInput}
            onChange={(event) => setStyleRenameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRenameStyle(styleRenameInput);
              }
            }}
          />
          <button
            className={managerButtonClass}
            disabled={activeStyleId === null}
            type="button"
            onClick={() => onRenameStyle(styleRenameInput)}
          >
            {t("window.tagManager.rename")}
          </button>
        </div>
        <div className={messageClass}>
          {selectedStyle
            ? t("window.tagManager.styleSummary", {
                count: selectedStyle.tagCount,
              })
            : t("window.tagManager.noStyleSelected")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            className={managerButtonClass}
            disabled={activeStyleId === null}
            type="button"
            onClick={onActivateStyle}
          >
            {t("window.tagManager.enableStyle")}
          </button>
          <button
            className={managerButtonClass}
            disabled={activeStyleId === null}
            type="button"
            onClick={onDeleteStyle}
          >
            {t("window.tagManager.deleteStyle")}
          </button>
        </div>
      </div>
      <div className="border-b border-(--line) bg-(--panel) p-1.5">
        <input
          className={`${managerInputClass} w-full`}
          aria-label={t("window.tagManager.searchTags")}
          placeholder={t("window.tagManager.searchTagsPlaceholder")}
          value={tagListQuery}
          onChange={(event) => setTagListQuery(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 border-b border-(--line) bg-(--panel) p-1.5">
        <select
          className={managerInputClass}
          aria-label={t("window.tagManager.sortField")}
          value={tagListSortKey}
          onChange={(event) =>
            setTagListSortKey(event.target.value as ManagedTagSortKey)
          }
        >
          <option value="name">{t("window.tagManager.sortName")}</option>
          <option value="createdAt">
            {t("window.tagManager.sortCreatedAt")}
          </option>
          <option value="fileCount">
            {t("window.tagManager.sortFileCount")}
          </option>
        </select>
        <select
          className={managerInputClass}
          aria-label={t("window.tagManager.sortDirection")}
          value={tagListSortDirection}
          onChange={(event) =>
            setTagListSortDirection(event.target.value as SortDirection)
          }
        >
          <option value="asc">{t("window.tagManager.sortAsc")}</option>
          <option value="desc">{t("window.tagManager.sortDesc")}</option>
        </select>
      </div>
      <div className={tagCatalogHeadClass}>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {t("window.tagManager.nameColumn")}
        </span>
        <span className="text-right whitespace-nowrap">
          {t("window.tagManager.fileCountColumn")}
        </span>
      </div>
      <div
        className="min-h-0 overflow-auto"
        ref={listRef}
        onScroll={scheduleViewportUpdate}
      >
        {displayedTags.length > 0 ? (
          <div
            className="relative min-w-0"
            style={{
              height: displayedTags.length * TAG_CATALOG_ROW_HEIGHT,
            }}
          >
            {visibleRows.map((row) => (
              <button
                className={getTagNamespaceClassName(row.tag, tagCatalogRowClass)}
                key={row.tag.id}
                style={{
                  ...getTagNamespaceStyle(row.tag),
                  height: TAG_CATALOG_ROW_HEIGHT,
                  top: row.top,
                }}
                title={formatTagLabel(row.tag)}
                type="button"
                onClick={() => onStageTag(row.tag)}
              >
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-inherit">
                  {formatTagLabel(row.tag)}
                </span>
                <span className="text-right tabular-nums text-(--muted) whitespace-nowrap">
                  {row.tag.fileCount}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={emptyClass}>{t("window.tagManager.noTags")}</div>
        )}
      </div>
    </section>
  );
}
