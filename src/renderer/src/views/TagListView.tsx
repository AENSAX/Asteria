import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BatchFileTagRecord,
  DomainRecord,
  ManagedTagRecord,
  SortDirection,
  TagStyleRecord,
} from "../../../shared/ipc";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../utils/tags";
import {
  filesChangedAffectsTagCatalog,
  filesChangedIncludesAny,
} from "../utils/filesChanged";
import { useLanguage } from "../utils/language";

interface TagListViewProps {
  onAppendSearchTag: (tag: ManagedTagRecord) => void;
  refreshSequence: number;
  locked: boolean;
  selectedFileIds: number[];
  state: TagListViewState;
  onStateChange: (state: TagListViewState) => void;
}

interface StyleTagGroup {
  style: TagStyleRecord;
  tags: ManagedTagRecord[];
}

interface VirtualTagRows {
  rows: VirtualTagRow[];
  totalHeight: number;
}

type VirtualTagRow =
  | {
      kind: "header";
      key: string;
      label: string;
      top: number;
      height: number;
    }
  | {
      kind: "tag";
      key: string;
      tag: ManagedTagRecord;
      top: number;
      height: number;
    }
  | {
      kind: "empty";
      key: string;
      label: string;
      top: number;
      height: number;
    };

type VirtualTagRowDraft =
  | Omit<Extract<VirtualTagRow, { kind: "header" }>, "top">
  | Omit<Extract<VirtualTagRow, { kind: "tag" }>, "top">
  | Omit<Extract<VirtualTagRow, { kind: "empty" }>, "top">;

const TAG_LIST_HEADER_HEIGHT = 28;
const TAG_LIST_ITEM_HEIGHT = 24;
const TAG_LIST_EMPTY_HEIGHT = 28;
const TAG_LIST_OVERSCAN_PX = 180;

const tagListRootClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-(--panel)";
const tagListToolbarClass =
  "grid grid-cols-[92px_112px_118px_minmax(0,1fr)] items-center gap-1.5 border-b border-(--line) bg-(--panel) p-1.5";
const tagListSelectClass = "ui-input";
const tagListToolbarLabelClass =
  "flex min-w-0 items-center gap-1 whitespace-nowrap text-(--ink)";
const tagListContentClass = "min-h-0 overflow-auto bg-(--surface-bg)";
const tagListHeaderClass =
  "absolute w-full h-7 border-b border-t border-(--border-dark) bg-(--group-header-bg) px-2 leading-[26px] font-semibold text-(--group-header-ink)";
const tagListEmptyClass = "px-2 py-1.5 text-(--muted)";
const tagListItemClass =
  "grid h-6 w-full grid-cols-[minmax(0,1fr)_52px] border-0 border-b border-(--line) text-[12px] text-(--ink) hover:bg-(--accent-weak)";
const tagListItemPendingClass = "border-(--danger) bg-(--danger-bg)";

export type TagListFilterMode = "all" | "namespace" | "plain" | "selection";

export interface TagListViewState {
  direction: SortDirection;
  namespaceFirst: boolean;
  filterMode: TagListFilterMode;
}

export function TagListView({
  locked,
  onAppendSearchTag,
  refreshSequence,
  selectedFileIds,
  state,
  onStateChange,
}: TagListViewProps): JSX.Element {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<StyleTagGroup[]>([]);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [selectionTags, setSelectionTags] = useState<BatchFileTagRecord[]>([]);
  const [message, setMessage] = useState(() => t("window.tagList.loading"));
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const contentRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    void loadTags();
  }, [refreshSequence]);

  useEffect(() => {
    void loadSelectionTags();
  }, [state.filterMode, selectedFileIds]);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onFilesChanged((payload) => {
      if (filesChangedAffectsTagCatalog(payload)) {
        void loadTags();
      }

      if (
        state.filterMode === "selection" &&
        filesChangedIncludesAny(payload, selectedFileIds)
      ) {
        void loadSelectionTags();
      }
    });
  }, [state.filterMode, selectedFileIds]);

  const sortedGroups = useMemo(() => {
    const tagGroups = sortStyleGroups(groups).map((group) => ({
      ...group,
      tags: sortTags(group.tags, state.direction, state.namespaceFirst),
    }));
    const domainGroup = createDomainStyleGroup(domains, state.direction);

    return domainGroup ? [domainGroup, ...tagGroups] : tagGroups;
  }, [domains, groups, state.direction, state.namespaceFirst]);
  const displayGroups = useMemo(
    () =>
      filterStyleGroups(
        sortedGroups,
        state.filterMode,
        selectionTags,
        state.direction,
        state.namespaceFirst,
      ),
    [
      state.direction,
      state.filterMode,
      state.namespaceFirst,
      selectionTags,
      sortedGroups,
    ],
  );
  const tagListLabels = useMemo(
    () => ({
      noTags: t("window.tagList.noTags"),
    }),
    [t],
  );
  const virtualRows = useMemo(
    () => buildVirtualTagRows(displayGroups, tagListLabels),
    [displayGroups, tagListLabels],
  );
  const visibleRows = useMemo(
    () =>
      pickVisibleRows(virtualRows.rows, viewport.scrollTop, viewport.height),
    [virtualRows.rows, viewport.height, viewport.scrollTop],
  );

  useEffect(() => {
    updateViewport();
  }, [virtualRows.totalHeight]);

  useEffect(() => {
    const content = contentRef.current;

    if (!content) {
      return undefined;
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(content);
    updateViewport();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  async function loadTags(): Promise<void> {
    if (!window.asteria) {
      setMessage(t("window.tagList.preloadUnavailable"));
      return;
    }

    try {
      const styles = await window.asteria.listTagStyles();
      const nextDomains = await window.asteria.listDomains();
      const nextGroups = await Promise.all(
        styles.map(async (style) => ({
          style,
          tags: await window.asteria.listManagedTags(style.id, "name", "asc"),
        })),
      );

      setDomains(nextDomains);
      setGroups(nextGroups);
      setMessage(
        t("window.tagList.loadedTags", {
          count:
            nextDomains.length +
            nextGroups.reduce((sum, group) => sum + group.tags.length, 0),
        }),
      );
    } catch (error) {
      setGroups([]);
      setMessage(
        error instanceof Error ? error.message : t("window.tagList.loadFailed"),
      );
    }
  }

  async function loadSelectionTags(): Promise<void> {
    if (state.filterMode !== "selection") {
      setSelectionTags([]);
      return;
    }

    if (!window.asteria || selectedFileIds.length === 0) {
      setSelectionTags([]);
      return;
    }

    try {
      setSelectionTags(
        await window.asteria.listBatchEffectiveFileTags(selectedFileIds),
      );
    } catch {
      setSelectionTags([]);
    }
  }

  function updateViewport(): void {
    const content = contentRef.current;

    if (!content) {
      setViewport({ scrollTop: 0, height: 0 });
      return;
    }

    setViewport({
      scrollTop: content.scrollTop,
      height: content.clientHeight,
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
    <section className={tagListRootClass}>
      <div className={tagListToolbarClass}>
        <select
          aria-label={t("window.tagList.displayRange")}
          className={tagListSelectClass}
          value={state.filterMode}
          onChange={(event) =>
            onStateChange({
              ...state,
              filterMode: event.target.value as TagListFilterMode,
            })
          }
        >
          <option value="all">{t("window.tagList.all")}</option>
          <option value="namespace">{t("window.tagList.namespace")}</option>
          <option value="plain">{t("window.tagList.plain")}</option>
          <option value="selection">{t("window.tagList.selection")}</option>
        </select>
        <select
          aria-label={t("window.tagList.sortAlphabetical")}
          className={tagListSelectClass}
          value={state.direction}
          onChange={(event) =>
            onStateChange({
              ...state,
              direction: event.target.value as SortDirection,
            })
          }
        >
          <option value="asc">{t("window.tagList.ascending")}</option>
          <option value="desc">{t("window.tagList.descending")}</option>
        </select>
        <label className={tagListToolbarLabelClass}>
          <input
            checked={state.namespaceFirst}
            type="checkbox"
            onChange={(event) =>
              onStateChange({ ...state, namespaceFirst: event.target.checked })
            }
          />
          {t("window.tagList.namespaceFirst")}
        </label>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-(--muted)">
          {locked ? t("window.tagList.locked") : message}
        </span>
      </div>

      <div
        className={tagListContentClass}
        ref={contentRef}
        onScroll={scheduleViewportUpdate}
      >
        <div
          className="relative min-w-0"
          style={{ height: virtualRows.totalHeight }}
        >
          {visibleRows.map((row) =>
            renderVirtualTagRow(row, locked, onAppendSearchTag),
          )}
        </div>
      </div>
    </section>
  );
}

function renderVirtualTagRow(
  row: VirtualTagRow,
  locked: boolean,
  onAppendSearchTag: (tag: ManagedTagRecord) => void,
): JSX.Element {
  const style = {
    height: row.height,
    top: row.top,
  };

  if (row.kind === "header") {
    return (
      <div className={tagListHeaderClass} key={row.key} style={style}>
        {row.label}
      </div>
    );
  }

  if (row.kind === "empty") {
    return (
      <div
        className={`absolute left-0 right-0 ${tagListEmptyClass}`}
        key={row.key}
        style={style}
      >
        {row.label}
      </div>
    );
  }

  return (
    <button
      className={getTagNamespaceClassName(
        row.tag,
        `absolute left-0 right-0 border-l-[3px] ${tagListItemClass}`,
      )}
      disabled={locked}
      key={row.key}
      style={{ ...style, ...getTagNamespaceStyle(row.tag) }}
      title={formatTagLabel(row.tag)}
      type="button"
      onClick={() => onAppendSearchTag(row.tag)}
    >
      <span className="min-w-0 overflow-hidden px-2 leading-6 text-left text-ellipsis whitespace-nowrap">
        {formatTagLabel(row.tag)}
      </span>
      <span className="min-w-0 overflow-hidden px-2 leading-6 text-right text-ellipsis whitespace-nowrap text-(--muted)">
        {row.tag.fileCount}
      </span>
    </button>
  );
}

function buildVirtualTagRows(
  groups: StyleTagGroup[],
  labels: {
    noTags: string;
  },
): VirtualTagRows {
  const rows: VirtualTagRow[] = [];
  let top = 0;

  function push(row: VirtualTagRowDraft): void {
    rows.push({ ...row, top } as VirtualTagRow);
    top += row.height;
  }

  if (groups.length === 0) {
    push({
      kind: "empty",
      key: "empty:groups",
      label: labels.noTags,
      height: TAG_LIST_EMPTY_HEIGHT,
    });
    return { rows, totalHeight: top };
  }

  for (const group of groups) {
    push({
      kind: "header",
      key: `header:style:${group.style.id}`,
      label: group.style.displayName,
      height: TAG_LIST_HEADER_HEIGHT,
    });

    if (group.tags.length === 0) {
      push({
        kind: "empty",
        key: `empty:style:${group.style.id}`,
        label: labels.noTags,
        height: TAG_LIST_EMPTY_HEIGHT,
      });
      continue;
    }

    for (const tag of group.tags) {
      push({
        kind: "tag",
        key: `tag:${tag.id}`,
        tag,
        height: TAG_LIST_ITEM_HEIGHT,
      });
    }
  }

  return { rows, totalHeight: top };
}

function pickVisibleRows(
  rows: VirtualTagRow[],
  scrollTop: number,
  viewportHeight: number,
): VirtualTagRow[] {
  if (rows.length === 0) {
    return [];
  }

  const start = Math.max(0, scrollTop - TAG_LIST_OVERSCAN_PX);
  const end = scrollTop + viewportHeight + TAG_LIST_OVERSCAN_PX;

  return rows.filter((row) => row.top + row.height >= start && row.top <= end);
}

function filterStyleGroups(
  groups: StyleTagGroup[],
  mode: TagListFilterMode,
  selectionTags: BatchFileTagRecord[],
  direction: SortDirection,
  namespaceFirst: boolean,
): StyleTagGroup[] {
  if (mode === "all") {
    return groups;
  }

  if (mode === "namespace") {
    return removeEmptyTagGroups(
      groups.map((group) => ({
        ...group,
        tags: group.tags.filter((tag) => tag.namespace.length > 0),
      })),
    );
  }

  if (mode === "plain") {
    return removeEmptyTagGroups(
      groups.map((group) => ({
        ...group,
        tags: group.tags.filter((tag) => tag.namespace.length === 0),
      })),
    );
  }

  const groupsByStyle = new Map<string, StyleTagGroup>();

  for (const tag of selectionTags) {
    const styleKey = tag.styleName;
    const group =
      groupsByStyle.get(styleKey) ??
      createSelectionStyleGroup(tag.styleName, groupsByStyle.size);

    group.tags.push(toManagedSelectionTag(tag));
    groupsByStyle.set(styleKey, group);
  }

  return sortStyleGroups(
    removeEmptyTagGroups(
      [...groupsByStyle.values()].map((group) => ({
        ...group,
        tags: sortTags(group.tags, direction, namespaceFirst),
      })),
    ),
  );
}

function removeEmptyTagGroups(groups: StyleTagGroup[]): StyleTagGroup[] {
  return groups.filter((group) => group.tags.length > 0);
}

function sortTags(
  tags: ManagedTagRecord[],
  direction: SortDirection,
  namespaceFirst: boolean,
): ManagedTagRecord[] {
  const multiplier = direction === "desc" ? -1 : 1;

  return [...tags].sort((left, right) => {
    if (namespaceFirst) {
      const leftHasNamespace = left.namespace.length > 0 ? 0 : 1;
      const rightHasNamespace = right.namespace.length > 0 ? 0 : 1;

      if (leftHasNamespace !== rightHasNamespace) {
        return leftHasNamespace - rightHasNamespace;
      }

      const namespaceCompare = left.namespace.localeCompare(right.namespace);

      if (namespaceCompare !== 0) {
        return namespaceCompare * multiplier;
      }

      return left.name.localeCompare(right.name) * multiplier;
    }

    return (
      formatTagLabel(left).localeCompare(formatTagLabel(right)) * multiplier
    );
  });
}

function createDomainPseudoTagId(domainId: DomainRecord["id"]): number {
  if (domainId === "pending") {
    return -1;
  }

  if (domainId === "library") {
    return -2;
  }

  return -3;
}

function createDomainStyleGroup(
  domains: DomainRecord[],
  direction: SortDirection,
): StyleTagGroup | null {
  if (domains.length === 0) {
    return null;
  }

  return {
    style: {
      id: -1,
      name: "domain",
      displayName: "domain",
      tagCount: domains.length,
      createdAt: "",
      isDefault: true,
    },
    tags: sortTags(
      domains.map((domain) => createDomainPseudoTag(domain)),
      direction,
      true,
    ),
  };
}

function createSelectionStyleGroup(
  styleName: string,
  index: number,
): StyleTagGroup {
  return {
    style: {
      id: -1000 - index,
      name: styleName,
      displayName: styleName,
      tagCount: 0,
      createdAt: "",
      isDefault: index === 0,
    },
    tags: [],
  };
}

function toManagedSelectionTag(tag: BatchFileTagRecord): ManagedTagRecord {
  return {
    id: tag.id,
    styleId: -1,
    styleName: tag.styleName,
    namespace: tag.namespace,
    name: tag.name,
    displayName: tag.displayName,
    fileCount: tag.fileCount,
    createdAt: tag.createdAt,
  };
}

function createDomainPseudoTag(domain: DomainRecord): ManagedTagRecord {
  return {
    id: createDomainPseudoTagId(domain.id),
    styleId: -1,
    styleName: "domain",
    namespace: "domain",
    name: domain.id,
    displayName: null,
    fileCount: domain.fileCount,
    createdAt: "",
  };
}

function sortStyleGroups(groups: StyleTagGroup[]): StyleTagGroup[] {
  return [...groups].sort((left, right) => {
    if (left.style.isDefault !== right.style.isDefault) {
      return left.style.isDefault ? -1 : 1;
    }

    const countCompare = right.tags.length - left.tags.length;

    if (countCompare !== 0) {
      return countCompare;
    }

    return left.style.displayName.localeCompare(right.style.displayName);
  });
}
