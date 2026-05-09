import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BatchFileTagRecord,
  DomainRecord,
  ManagedTagRecord,
  SortDirection,
  TagStyleRecord
} from '../../../shared/ipc';
import { formatTagLabel, getTagNamespaceClassName, getTagNamespaceStyle } from '../utils/tags';

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
    kind: 'header';
    key: string;
    label: string;
    top: number;
    height: number;
  }
  | {
    kind: 'domain';
    key: string;
    domain: DomainRecord;
    tag: ManagedTagRecord;
    top: number;
    height: number;
  }
  | {
    kind: 'tag';
    key: string;
    tag: ManagedTagRecord;
    top: number;
    height: number;
  }
  | {
    kind: 'empty';
    key: string;
    label: string;
    top: number;
    height: number;
  };

const TAG_LIST_HEADER_HEIGHT = 28;
const TAG_LIST_ITEM_HEIGHT = 24;
const TAG_LIST_EMPTY_HEIGHT = 28;
const TAG_LIST_OVERSCAN_PX = 180;

const tagListRootClass = 'grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--panel)]';
const tagListToolbarClass =
  'grid grid-cols-[92px_112px_118px_minmax(0,1fr)] items-center gap-1.5 border-b border-[var(--line)] bg-[var(--panel)] p-1.5';
const tagListSelectClass =
  'h-6 min-w-0 border border-[var(--line-strong)] bg-[var(--surface-inset-bg)] px-1.5 text-[var(--ink)]';
const tagListToolbarLabelClass = 'flex min-w-0 items-center gap-1 whitespace-nowrap text-[var(--ink)]';
const tagListContentClass = 'min-h-0 overflow-auto bg-[var(--surface-bg)]';
const tagListHeaderClass =
  'absolute w-full h-7 border-b border-t border-[var(--border-dark)] bg-[var(--group-header-bg)] px-2 leading-[26px] font-semibold text-[var(--group-header-ink)]';
const tagListEmptyClass = 'px-2 py-1.5 text-[var(--muted)]';
const tagListItemClass =
  'grid h-6 w-full grid-cols-[minmax(0,1fr)_52px] border-0 border-b border-[var(--line)] bg-transparent text-[11px] text-[var(--ink)] hover:bg-[var(--accent-weak)]';
const tagListItemPendingClass = 'border-[var(--danger)] bg-[var(--danger-bg)]';

export type TagListFilterMode = 'all' | 'namespace' | 'plain' | 'selection';

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
  onStateChange
}: TagListViewProps): JSX.Element {
  const [groups, setGroups] = useState<StyleTagGroup[]>([]);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [selectionTags, setSelectionTags] = useState<BatchFileTagRecord[]>([]);
  const [message, setMessage] = useState('未加载');
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

    return window.asteria.onFilesChanged(() => {
      void loadTags();
      void loadSelectionTags();
    });
  }, [state.filterMode, selectedFileIds]);

  const sortedGroups = useMemo(
    () =>
      sortStyleGroups(groups).map((group) => ({
        ...group,
        tags: sortTags(group.tags, state.direction, state.namespaceFirst)
      })),
    [groups, state.direction, state.namespaceFirst]
  );
  const displayGroups = useMemo(
    () => filterStyleGroups(sortedGroups, state.filterMode, selectionTags),
    [state.filterMode, selectionTags, sortedGroups]
  );
  const displayDomains = state.filterMode === 'all' ? domains : [];
  const virtualRows = useMemo(
    () => buildVirtualTagRows(displayDomains, displayGroups),
    [displayDomains, displayGroups]
  );
  const visibleRows = useMemo(
    () => pickVisibleRows(virtualRows.rows, viewport.scrollTop, viewport.height),
    [virtualRows.rows, viewport.height, viewport.scrollTop]
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
      setMessage('preload unavailable');
      return;
    }

    try {
      const styles = await window.asteria.listTagStyles();
      const nextDomains = await window.asteria.listDomains();
      const nextGroups = await Promise.all(
        styles.map(async (style) => ({
          style,
          tags: await window.asteria.listManagedTags(style.id, 'name', 'asc')
        }))
      );

      setDomains(nextDomains);
      setGroups(nextGroups);
      setMessage(`${nextGroups.reduce((sum, group) => sum + group.tags.length, 0)} 个标签`);
    } catch (error) {
      setGroups([]);
      setMessage(error instanceof Error ? error.message : '加载失败');
    }
  }

  async function loadSelectionTags(): Promise<void> {
    if (state.filterMode !== 'selection') {
      setSelectionTags([]);
      return;
    }

    if (!window.asteria || selectedFileIds.length === 0) {
      setSelectionTags([]);
      return;
    }

    try {
      setSelectionTags(await window.asteria.listBatchFileTags(selectedFileIds));
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
      height: content.clientHeight
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
          aria-label="标签显示范围"
          className={tagListSelectClass}
          value={state.filterMode}
          onChange={(event) =>
            onStateChange({ ...state, filterMode: event.target.value as TagListFilterMode })
          }
        >
          <option value="all">全部</option>
          <option value="namespace">namespace</option>
          <option value="plain">普通标签</option>
          <option value="selection">selection</option>
        </select>
        <select
          aria-label="字母排序"
          className={tagListSelectClass}
          value={state.direction}
          onChange={(event) =>
            onStateChange({ ...state, direction: event.target.value as SortDirection })
          }
        >
          <option value="asc">字母升序</option>
          <option value="desc">字母降序</option>
        </select>
        <label className={tagListToolbarLabelClass}>
          <input
            checked={state.namespaceFirst}
            type="checkbox"
            onChange={(event) => onStateChange({ ...state, namespaceFirst: event.target.checked })}
          />
          namespace优先
        </label>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[var(--muted)]">
          {locked ? '不可操作，因为正在导入文件' : message}
        </span>
      </div>

      <div className={tagListContentClass} ref={contentRef} onScroll={scheduleViewportUpdate}>
        <div className="relative min-w-0" style={{ height: virtualRows.totalHeight }}>
          {visibleRows.map((row) => renderVirtualTagRow(row, locked, onAppendSearchTag))}
        </div>
      </div>
    </section>
  );
}

function renderVirtualTagRow(
  row: VirtualTagRow,
  locked: boolean,
  onAppendSearchTag: (tag: ManagedTagRecord) => void
): JSX.Element {
  const style = {
    height: row.height,
    top: row.top
  };

  if (row.kind === 'header') {
    return (
      <div className={tagListHeaderClass} key={row.key} style={style}>
        {row.label}
      </div>
    );
  }

  if (row.kind === 'empty') {
    return (
      <div className={`absolute left-0 right-0 ${tagListEmptyClass}`} key={row.key} style={style}>
        {row.label}
      </div>
    );
  }

  if (row.kind === 'domain') {
    return (
      <button
        className={`absolute left-0 right-0 ${tagListItemClass}`}
        disabled={locked}
        key={row.key}
        style={style}
        title={row.domain.displayName}
        type="button"
        onClick={() => onAppendSearchTag(row.tag)}
      >
        <span className="min-w-0 overflow-hidden px-2 leading-6 text-left text-ellipsis whitespace-nowrap">{row.domain.displayName}</span>
        <span className="min-w-0 overflow-hidden px-2 leading-6 text-right text-ellipsis whitespace-nowrap text-[var(--muted)]">{row.domain.fileCount}</span>
      </button>
    );
  }

  return (
    <button
      className={getTagNamespaceClassName(row.tag, `absolute left-0 right-0 ${tagListItemClass}`)}
      disabled={locked}
      key={row.key}
      style={{ ...style, ...getTagNamespaceStyle(row.tag) }}
      title={formatTagLabel(row.tag)}
      type="button"
      onClick={() => onAppendSearchTag(row.tag)}
    >
      <span className="min-w-0 overflow-hidden px-2 leading-6 text-left text-ellipsis whitespace-nowrap">{formatTagLabel(row.tag)}</span>
      <span className="min-w-0 overflow-hidden px-2 leading-6 text-right text-ellipsis whitespace-nowrap text-[var(--muted)]">{row.tag.fileCount}</span>
    </button>
  );
}

function buildVirtualTagRows(domains: DomainRecord[], groups: StyleTagGroup[]): VirtualTagRows {
  const rows: VirtualTagRow[] = [];
  let top = 0;

  function push(row: Omit<VirtualTagRow, 'top'>): void {
    rows.push({ ...row, top } as VirtualTagRow);
    top += row.height;
  }

  push({ kind: 'header', key: 'header:domains', label: '域', height: TAG_LIST_HEADER_HEIGHT });

  if (domains.length > 0) {
    for (const domain of domains) {
      push({
        kind: 'domain',
        key: `domain:${domain.id}`,
        domain,
        tag: createDomainPseudoTag(domain),
        height: TAG_LIST_ITEM_HEIGHT
      });
    }
  } else {
    push({ kind: 'empty', key: 'empty:domains', label: '没有域', height: TAG_LIST_EMPTY_HEIGHT });
  }

  if (groups.length === 0) {
    push({ kind: 'empty', key: 'empty:groups', label: '没有标签', height: TAG_LIST_EMPTY_HEIGHT });
    return { rows, totalHeight: top };
  }

  for (const group of groups) {
    push({
      kind: 'header',
      key: `header:style:${group.style.id}`,
      label: group.style.displayName,
      height: TAG_LIST_HEADER_HEIGHT
    });

    if (group.tags.length === 0) {
      push({
        kind: 'empty',
        key: `empty:style:${group.style.id}`,
        label: '没有标签',
        height: TAG_LIST_EMPTY_HEIGHT
      });
      continue;
    }

    for (const tag of group.tags) {
      push({
        kind: 'tag',
        key: `tag:${tag.id}`,
        tag,
        height: TAG_LIST_ITEM_HEIGHT
      });
    }
  }

  return { rows, totalHeight: top };
}

function pickVisibleRows(rows: VirtualTagRow[], scrollTop: number, viewportHeight: number): VirtualTagRow[] {
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
  selectionTags: BatchFileTagRecord[]
): StyleTagGroup[] {
  if (mode === 'all') {
    return groups;
  }

  if (mode === 'namespace') {
    return removeEmptyTagGroups(
      groups.map((group) => ({
        ...group,
        tags: group.tags.filter((tag) => tag.namespace.length > 0)
      }))
    );
  }

  if (mode === 'plain') {
    return removeEmptyTagGroups(
      groups.map((group) => ({
        ...group,
        tags: group.tags.filter((tag) => tag.namespace.length === 0)
      }))
    );
  }

  const selectionCountByTagId = new Map(selectionTags.map((tag) => [tag.id, tag.fileCount]));

  return removeEmptyTagGroups(
    groups.map((group) => ({
      ...group,
      tags: group.tags
        .filter((tag) => selectionCountByTagId.has(tag.id))
        .map((tag) => ({
          ...tag,
          fileCount: selectionCountByTagId.get(tag.id) ?? tag.fileCount
        }))
    }))
  );
}

function removeEmptyTagGroups(groups: StyleTagGroup[]): StyleTagGroup[] {
  return groups.filter((group) => group.tags.length > 0);
}

function sortTags(
  tags: ManagedTagRecord[],
  direction: SortDirection,
  namespaceFirst: boolean
): ManagedTagRecord[] {
  const multiplier = direction === 'desc' ? -1 : 1;

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

    return formatTagLabel(left).localeCompare(formatTagLabel(right)) * multiplier;
  });
}

function createDomainPseudoTagId(domainId: DomainRecord['id']): number {
  if (domainId === 'pending') {
    return -1;
  }

  if (domainId === 'library') {
    return -2;
  }

  return -3;
}

function createDomainPseudoTag(domain: DomainRecord): ManagedTagRecord {
  return {
    id: createDomainPseudoTagId(domain.id),
    styleId: -1,
    styleName: 'domain',
    namespace: '',
    name: domain.displayName,
    displayName: null,
    fileCount: domain.fileCount,
    createdAt: ''
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
