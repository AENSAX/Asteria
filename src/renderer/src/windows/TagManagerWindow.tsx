import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type {
  ManagedTagRecord,
  ManagedTagSortKey,
  SortDirection,
  TagStyleRecord
} from '../../../shared/ipc';
import { ResizableColumns } from '../components/ResizableColumns';
import { useBoxSelection } from '../hooks/useBoxSelection';
import { useShortcut } from '../hooks/useShortcut';
import { mergeIds } from '../utils/ids';
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
  parseTagText
} from '../utils/tags';

const MANAGED_TAG_ROW_HEIGHT = 26;
const MANAGED_TAG_OVERSCAN_PX = 260;
const managerShellClass = 'grid h-full min-h-0 min-w-0 grid-cols-[180px_minmax(0,1fr)] bg-(--panel)';
const managerSidebarClass = 'flex min-h-0 min-w-0 flex-col border-r border-(--line) bg-(--surface-bg)';
const managerSidebarHeaderClass = 'h-7 border-b border-(--line) bg-(--panel-strong) px-2 leading-7 text-[11px] font-semibold';
const managerListClass = 'min-h-0 overflow-auto';
const managerListItemClass =
  'grid min-h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_42px] items-center border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px] text-(--ink)';
const managerListItemActiveClass = 'bg-(--surface-raised-bg)';
const managerPanelClass = 'grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_28px] bg-(--panel)';
const managerToolbarClass = 'grid grid-rows-[auto_auto] gap-1 border-b border-(--line) bg-(--panel) p-2';
const managerInputRowClass = 'grid grid-cols-[minmax(0,1fr)_auto] gap-1.5';
const managerSortRowClass = 'grid grid-cols-[120px_120px_auto_minmax(0,1fr)] items-center gap-1.5';
const managerInputClass =
  'h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)';
const managerButtonClass =
  'h-6 min-w-[72px] cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)';
const managerSelectClass =
  'h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)';
const managerMessageClass = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)';
const managedTagListClass = 'relative min-h-0 overflow-auto bg-(--surface-bg)';
const managedTagRowClass =
  'absolute left-0 right-0 grid h-[26px] grid-cols-[minmax(0,1fr)_42px] items-center border-b border-(--line) bg-transparent text-[11px] text-(--ink)';
const managedTagRowPendingClass = 'bg-(--danger-bg)';
const managedTagRowTextClass = 'min-w-0 overflow-hidden px-2 text-ellipsis whitespace-nowrap';
const managedTagRowCountClass = 'min-w-0 overflow-hidden px-2 text-right text-ellipsis whitespace-nowrap text-(--muted)';
const managedTagEmptyClass = 'p-2 text-(--muted)';
const managedTagFooterClass = 'flex h-7 items-center justify-between border-t border-(--line) bg-(--surface-bg) px-2 text-(--muted)';

export function TagManagerWindow(): JSX.Element {
  const [styles, setStyles] = useState<TagStyleRecord[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<number | null>(null);
  const [tags, setTags] = useState<ManagedTagRecord[]>([]);
  const [styleInput, setStyleInput] = useState('');
  const [styleRenameInput, setStyleRenameInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [sortKey, setSortKey] = useState<ManagedTagSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [message, setMessage] = useState('未加载');
  const [pendingTagIds, setPendingTagIds] = useState<number[]>([]);
  const [lastPendingTagId, setLastPendingTagId] = useState<number | null>(null);
  const [tagViewport, setTagViewport] = useState({ scrollTop: 0, height: 0 });
  const tagListRef = useRef<HTMLDivElement>(null);
  const tagViewportFrameRef = useRef<number | null>(null);
  const selectedStyle = styles.find((style) => style.id === activeStyleId) ?? null;
  const visibleTags = useMemo(
    () => pickVisibleManagedTags(tags, tagViewport.scrollTop, tagViewport.height),
    [tagViewport.height, tagViewport.scrollTop, tags]
  );
  const managedTagListHeight = tags.length * MANAGED_TAG_ROW_HEIGHT;
  const boxSelection = useBoxSelection({
    containerRef: tagListRef,
    itemSelector: '.managed-tag-row',
    selectedIds: pendingTagIds,
    onSelect: setPendingTagIds,
    onLastSelectedId: setLastPendingTagId
  });

  useEffect(() => {
    void loadStyles();
  }, []);

  useEffect(() => {
    void loadManagedTags();
  }, [activeStyleId, sortKey, sortDirection]);

  useEffect(() => {
    setStyleRenameInput(selectedStyle?.displayName ?? '');
  }, [selectedStyle?.id, selectedStyle?.displayName]);

  useEffect(() => {
    setPendingTagIds((currentIds) => currentIds.filter((id) => tags.some((tag) => tag.id === id)));
  }, [tags]);

  useEffect(() => {
    updateTagViewport();
  }, [tags.length]);

  useEffect(() => {
    const tagList = tagListRef.current;

    if (!tagList) {
      return undefined;
    }

    const observer = new ResizeObserver(updateTagViewport);
    observer.observe(tagList);
    updateTagViewport();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tagViewportFrameRef.current !== null) {
        cancelAnimationFrame(tagViewportFrameRef.current);
      }
    };
  }, []);

  useShortcut('select-all', () => {
    if (activeStyleId === null || tags.length === 0) {
      return;
    }

    setPendingTagIds(tags.map((tag) => tag.id));
    setLastPendingTagId(tags[tags.length - 1]?.id ?? null);
  }, { enabled: true });

  async function loadStyles(nextActiveStyleId?: number): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const nextStyles = await window.asteria.listTagStyles();
    setStyles(nextStyles);

    const activeExists = nextStyles.some((style) => style.id === activeStyleId);
    const fallbackStyleId = nextActiveStyleId ?? (activeExists ? activeStyleId : nextStyles[0]?.id ?? null);
    setActiveStyleId(fallbackStyleId);
    setMessage(`${nextStyles.length} 个风格`);
  }

  async function loadManagedTags(): Promise<void> {
    if (!window.asteria || activeStyleId === null) {
      setTags([]);
      return;
    }

    const nextTags = await window.asteria.listManagedTags(activeStyleId, sortKey, sortDirection);
    setTags(nextTags);
  }

  async function createStyle(): Promise<void> {
    if (!window.asteria || !styleInput.trim()) {
      return;
    }

    try {
      const nextStyles = await window.asteria.createTagStyle(styleInput);
      const createdStyle = nextStyles.find((style) => style.displayName === styleInput.trim()) ?? nextStyles[0];
      setStyles(nextStyles);
      setActiveStyleId(createdStyle?.id ?? null);
      setStyleInput('');
      setMessage('已创建风格');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    }
  }

  async function createTag(): Promise<void> {
    if (!window.asteria || activeStyleId === null) {
      return;
    }

    const draft = parseTagText(tagInput);

    if (!draft) {
      return;
    }

    try {
      await window.asteria.createManagedTag(activeStyleId, draft);
      setTagInput('');
      setMessage('已创建标签');
      await loadManagedTags();
      await loadStyles(activeStyleId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    }
  }

  async function activateStyle(): Promise<void> {
    if (!window.asteria || activeStyleId === null) {
      return;
    }

    try {
      const nextStyles = await window.asteria.setActiveTagStyle(activeStyleId);
      setStyles(nextStyles);
      setMessage('已启用风格');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '启用失败');
    }
  }

  async function renameStyle(): Promise<void> {
    if (!window.asteria || activeStyleId === null || !styleRenameInput.trim()) {
      return;
    }

    try {
      const nextStyles = await window.asteria.renameTagStyle(activeStyleId, styleRenameInput);
      setStyles(nextStyles);
      setMessage('已重命名风格');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '重命名失败');
    }
  }

  async function deleteStyle(): Promise<void> {
    if (!window.asteria || activeStyleId === null || !selectedStyle) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: '确认删除标签风格',
      message: `这将删除风格“${selectedStyle.displayName}”下的 ${selectedStyle.tagCount} 个标签，并移除相关文件标签关联，确认吗`
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.asteria.deleteTagStyle(activeStyleId);
      setStyles(result.styles);
      setActiveStyleId(result.styles[0]?.id ?? null);
      setPendingTagIds([]);
      setLastPendingTagId(null);
      setMessage(`已删除风格，删除 ${result.deletedTagCount} 个标签`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除风格失败');
    }
  }

  function handleTagMouseDown(event: MouseEvent<HTMLDivElement>, tag: ManagedTagRecord): void {
    if (event.button !== 0) {
      return;
    }

    if (event.shiftKey && lastPendingTagId !== null) {
      const startIndex = tags.findIndex((item) => item.id === lastPendingTagId);
      const endIndex = tags.findIndex((item) => item.id === tag.id);

      if (startIndex !== -1 && endIndex !== -1) {
        const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeIds = tags.slice(from, to + 1).map((item) => item.id);
        setPendingTagIds(event.ctrlKey ? mergeIds(pendingTagIds, rangeIds) : rangeIds);
      }

      return;
    }

    if (event.ctrlKey) {
      setPendingTagIds((currentIds) =>
        currentIds.includes(tag.id) ? currentIds.filter((id) => id !== tag.id) : [...currentIds, tag.id]
      );
      setLastPendingTagId(tag.id);
      return;
    }

    setPendingTagIds([tag.id]);
    setLastPendingTagId(tag.id);
  }

  function updateTagViewport(): void {
    const tagList = tagListRef.current;

    if (!tagList) {
      setTagViewport({ scrollTop: 0, height: 0 });
      return;
    }

    setTagViewport({
      scrollTop: tagList.scrollTop,
      height: tagList.clientHeight
    });
  }

  function scheduleTagViewportUpdate(): void {
    if (tagViewportFrameRef.current !== null) {
      cancelAnimationFrame(tagViewportFrameRef.current);
    }

    tagViewportFrameRef.current = requestAnimationFrame(() => {
      tagViewportFrameRef.current = null;
      updateTagViewport();
    });
  }

  async function deleteSelectedTags(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const selectedTags = tags.filter((tag) => pendingTagIds.includes(tag.id));

    if (selectedTags.length === 0) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: '确认删除标签',
      message: `这将删除 ${selectedTags.length} 个标签，并从相关文件中移除这些标签，确认吗`
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.asteria.deleteManagedTags(selectedTags.map((tag) => tag.id));
      setMessage(`已删除 ${result.deletedTagCount} 个标签，影响 ${result.deletedFileCount} 个文件`);
      setPendingTagIds([]);
      setLastPendingTagId(null);
      await loadManagedTags();
      await loadStyles(activeStyleId ?? undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    }
  }

  return (
    <ResizableColumns
      className={managerShellClass}
      defaultLeftWidth={180}
      minLeftWidth={130}
      minRightWidth={360}
      storageKey="asteria:tag-manager-sidebar-width"
      left={(
        <aside className={managerSidebarClass}>
        <header className={managerSidebarHeaderClass}>标签风格</header>
        <div className={managerListClass}>
          {styles.map((style) => (
            <button
              className={`${managerListItemClass} ${style.id === activeStyleId ? managerListItemActiveClass : ''}`}
              aria-current={style.id === activeStyleId ? 'true' : undefined}
              key={style.id}
              type="button"
              onClick={() => setActiveStyleId(style.id)}
            >
              <span className="text-center text-(--success-ink)">{style.isDefault ? '√' : ''}</span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{style.displayName}</span>
              <span className="text-right text-(--muted)">{style.tagCount}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-(--line) p-2">
          <input
            className={managerInputClass}
            aria-label="新建风格"
            placeholder="输入风格以新建"
            value={styleInput}
            onChange={(event) => setStyleInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void createStyle();
              }
            }}
          />
          <button type="button" onClick={() => void createStyle()}>
            新建
          </button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5 border-t border-(--line) p-2">
          <input
            className={managerInputClass}
            aria-label="重命名风格"
            placeholder="输入风格以重命名"
            value={styleRenameInput}
            onChange={(event) => setStyleRenameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void renameStyle();
              }
            }}
          />
          <button disabled={activeStyleId === null} type="button" onClick={() => void renameStyle()}>
            改名
          </button>
          <button disabled={activeStyleId === null} type="button" onClick={() => void deleteStyle()}>
            删除
          </button>
        </div>
        </aside>
      )}
      right={(
        <main className={managerPanelClass}>
        <header className={managerToolbarClass}>
          <div className={managerInputRowClass}>
            <input
              className={managerInputClass}
              aria-label="新建标签"
              placeholder="输入标签以新建"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void createTag();
                }
              }}
            />
            <button disabled={activeStyleId === null} type="button" onClick={() => void createTag()}>
              新建标签
            </button>
          </div>
          <div className={managerSortRowClass}>
            <select
              className={managerSelectClass}
              aria-label="排序字段"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as ManagedTagSortKey)}
            >
              <option value="name">字母</option>
              <option value="createdAt">创建时间</option>
              <option value="fileCount">引用数量</option>
            </select>
            <select
              className={managerSelectClass}
              aria-label="排序方向"
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as SortDirection)}
            >
              <option value="asc">增序</option>
              <option value="desc">降序</option>
            </select>
            <button disabled={activeStyleId === null} type="button" onClick={() => void activateStyle()}>
              启用风格
            </button>
            <span className={managerMessageClass}>{message}</span>
          </div>
        </header>

        <div
          className={managedTagListClass}
          ref={tagListRef}
          onMouseDownCapture={boxSelection.handleMouseDownCapture}
          onScroll={scheduleTagViewportUpdate}
        >
          {tags.length > 0 ? (
            <div className="relative min-h-0" style={{ height: managedTagListHeight }}>
            {visibleTags.map(({ index, tag }) => (
              <div
                className={`${getTagNamespaceClassName(tag, managedTagRowClass)}${pendingTagIds.includes(tag.id) ? ` ${managedTagRowPendingClass}` : ''}`}
                data-box-select-id={tag.id}
                key={tag.id}
                style={{
                  ...getTagNamespaceStyle(tag),
                  top: index * MANAGED_TAG_ROW_HEIGHT
                }}
                onMouseDown={(event) => handleTagMouseDown(event, tag)}
              >
                <span className={managedTagRowTextClass} title={formatTagLabel(tag)}>{formatTagLabel(tag)}</span>
                <span className={managedTagRowCountClass}>{tag.fileCount}</span>
              </div>
            ))
            }
            </div>
          ) : (
            <div className={managedTagEmptyClass}>没有标签</div>
          )}
          {boxSelection.selectionBox ? (
            <div className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none" style={boxSelection.selectionBox} />
          ) : null}
        </div>
        <footer className={managedTagFooterClass}>
          <span>已选 {pendingTagIds.length} 个标签</span>
          <button disabled={pendingTagIds.length === 0} type="button" onClick={() => void deleteSelectedTags()}>
            删除
          </button>
        </footer>
        </main>
      )}
    />
  );
}

function pickVisibleManagedTags(
  tags: ManagedTagRecord[],
  scrollTop: number,
  viewportHeight: number
): Array<{ index: number; tag: ManagedTagRecord }> {
  if (tags.length === 0) {
    return [];
  }

  const startIndex = Math.max(
    0,
    Math.floor(Math.max(0, scrollTop - MANAGED_TAG_OVERSCAN_PX) / MANAGED_TAG_ROW_HEIGHT)
  );
  const endIndex = Math.min(
    tags.length - 1,
    Math.ceil((scrollTop + viewportHeight + MANAGED_TAG_OVERSCAN_PX) / MANAGED_TAG_ROW_HEIGHT)
  );
  const rows: Array<{ index: number; tag: ManagedTagRecord }> = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const tag = tags[index];

    if (tag) {
      rows.push({ index, tag });
    }
  }

  return rows;
}
