import { useEffect, useRef, useState } from 'react';
import type { BatchFileTagRecord } from '../../../shared/ipc';
import { TagTokenInput } from '../components/TagTokenInput';
import { useBoxSelection } from '../hooks/useBoxSelection';
import { useShortcut } from '../hooks/useShortcut';
import { useTagTokenInput } from '../hooks/useTagTokenInput';
import { mergeIds } from '../utils/ids';
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle
} from '../utils/tags';

interface BatchTagManagerWindowProps {
  fileIds: number[];
}

export function BatchTagManagerWindow({ fileIds }: BatchTagManagerWindowProps): JSX.Element {
  const [fileTags, setFileTags] = useState<BatchFileTagRecord[]>([]);
  const [pendingTagIds, setPendingTagIds] = useState<number[]>([]);
  const [lastPendingTagId, setLastPendingTagId] = useState<number | null>(null);
  const [message, setMessage] = useState('未加载');
  const tagListRef = useRef<HTMLDivElement | null>(null);
  const fileIdKey = fileIds.join(',');
  const boxSelection = useBoxSelection({
    containerRef: tagListRef,
    itemSelector: '[data-box-select-id]',
    selectedIds: pendingTagIds,
    startOnlyFromContainer: true,
    onSelect: setPendingTagIds,
    onLastSelectedId: setLastPendingTagId
  });
  const tagInput = useTagTokenInput({
    onCommit: async (tokens) => {
      if (!window.asteria || tokens.length === 0) {
        return;
      }

      const nextFileTags = await window.asteria.addTagsToFiles(fileIds, tokens);
      setFileTags(nextFileTags);
    }
  });

  useEffect(() => {
    tagInput.reset();
    setPendingTagIds([]);
    setLastPendingTagId(null);
    void loadFileTags();
  }, [fileIdKey]);

  useShortcut('select-all', () => {
    const tagIds = fileTags.map((tag) => tag.id);
    setPendingTagIds(tagIds);
    setLastPendingTagId(tagIds[tagIds.length - 1] ?? null);
  });

  async function loadFileTags(): Promise<void> {
    if (!window.asteria || fileIds.length === 0) {
      setFileTags([]);
      setMessage('文件无效');
      return;
    }

    const nextFileTags = await window.asteria.listBatchFileTags(fileIds);
    setFileTags(nextFileTags);
    setMessage(`${fileIds.length} 个文件`);
  }

  async function removePendingTags(tagIds: number[]): Promise<void> {
    if (!window.asteria || tagIds.length === 0) {
      return;
    }

    const nextFileTags = await window.asteria.removeTagsFromFiles(fileIds, tagIds);
    setFileTags(nextFileTags);
    setPendingTagIds([]);
    setLastPendingTagId(null);
  }

  function handleTagMouseDown(event: React.MouseEvent<HTMLElement>, tag: BatchFileTagRecord, index: number): void {
    event.preventDefault();
    event.stopPropagation();

    const isPending = pendingTagIds.includes(tag.id);

    if (event.shiftKey && lastPendingTagId !== null) {
      const anchorIndex = fileTags.findIndex((item) => item.id === lastPendingTagId);

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = fileTags.slice(start, end + 1).map((item) => item.id);

        setPendingTagIds((currentTagIds) =>
          event.ctrlKey ? mergeIds(currentTagIds, rangeIds) : rangeIds
        );
        return;
      }
    }

    if (event.ctrlKey) {
      if (isPending) {
        void removePendingTags(pendingTagIds);
        return;
      }

      setPendingTagIds((currentTagIds) => [...currentTagIds, tag.id]);
      setLastPendingTagId(tag.id);
      return;
    }

    if (isPending && pendingTagIds.length === 1) {
      void removePendingTags([tag.id]);
      return;
    }

    setPendingTagIds([tag.id]);
    setLastPendingTagId(tag.id);
  }

  return (
    <section
      className="batch-tag-window"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setPendingTagIds([]);
          setLastPendingTagId(null);
        }
      }}
    >
      <div
        className="batch-tag-list"
        ref={tagListRef}
        onMouseDownCapture={boxSelection.handleMouseDownCapture}
      >
        {fileTags.length > 0 ? (
          fileTags.map((tag, index) => (
            <button
              className={getTagNamespaceClassName(
                tag,
                pendingTagIds.includes(tag.id) ? 'batch-tag-item pending' : 'batch-tag-item'
              )}
              data-box-select-id={tag.id}
              key={tag.id}
              style={getTagNamespaceStyle(tag)}
              title={formatTagLabel(tag)}
              type="button"
              onMouseDown={(event) => handleTagMouseDown(event, tag, index)}
            >
              <span>{formatTagLabel(tag)}</span>
              <span>{tag.fileCount}</span>
            </button>
          ))
        ) : (
          <div className="managed-tag-empty">没有标签</div>
        )}
        {boxSelection.selectionBox ? (
          <div className="box-selection-rect" style={boxSelection.selectionBox} />
        ) : null}
      </div>

      <TagTokenInput
        ariaLabel="输入标签"
        placeholder="输入标签以增加"
        selectedSuggestionIndex={tagInput.selectedSuggestionIndex}
        suggestions={tagInput.suggestions}
        text={tagInput.text}
        tokens={tagInput.tokens}
        onKeyDown={tagInput.handleKeyDown}
        onPickSuggestion={tagInput.addTokenFromSuggestion}
        onTextChange={tagInput.setText}
      />
      <footer className="view-status">{message}</footer>
    </section>
  );
}
