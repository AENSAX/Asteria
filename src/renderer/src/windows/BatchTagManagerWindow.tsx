import { useEffect, useRef, useState } from "react";
import type { BatchFileTagRecord } from "../../../shared/ipc";
import { TagTokenInput } from "../components/TagTokenInput";
import { useBoxSelection } from "../hooks/useBoxSelection";
import { useShortcut } from "../hooks/useShortcut";
import { useTagTokenInput } from "../hooks/useTagTokenInput";
import { useLanguage } from "../utils/language";
import { mergeIds } from "../utils/ids";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../utils/tags";

interface BatchTagManagerWindowProps {
  fileIds: number[];
}

const batchRootClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto_24px] border border-(--line) bg-(--panel)";
const batchListClass =
  "relative flex min-h-0 flex-wrap content-start gap-1 overflow-auto bg-(--surface-bg) p-1.5";
const batchTagItemClass =
  "inline-grid min-h-5 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center border border-(--line-strong) bg-(--tag-bg) text-[11px] text-(--ink)";
const batchTagPendingClass = "border-(--danger)";

export function BatchTagManagerWindow({
  fileIds,
}: BatchTagManagerWindowProps): JSX.Element {
  const { t } = useLanguage();
  const [fileTags, setFileTags] = useState<BatchFileTagRecord[]>([]);
  const [pendingTagIds, setPendingTagIds] = useState<number[]>([]);
  const [lastPendingTagId, setLastPendingTagId] = useState<number | null>(null);
  const [message, setMessage] = useState(() => t("window.batch.loading"));
  const tagListRef = useRef<HTMLDivElement | null>(null);
  const fileIdKey = fileIds.join(",");
  const boxSelection = useBoxSelection({
    containerRef: tagListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: pendingTagIds,
    startOnlyFromContainer: true,
    onSelect: setPendingTagIds,
    onLastSelectedId: setLastPendingTagId,
  });
  const tagInput = useTagTokenInput({
    onCommit: async (tokens) => {
      if (!window.asteria || tokens.length === 0) {
        return;
      }

      const nextFileTags = await window.asteria.addTagsToFiles(fileIds, tokens);
      setFileTags(nextFileTags);
    },
  });

  useEffect(() => {
    tagInput.reset();
    setPendingTagIds([]);
    setLastPendingTagId(null);
    void loadFileTags();
  }, [fileIdKey]);

  useShortcut("select-all", () => {
    const tagIds = fileTags.map((tag) => tag.id);
    setPendingTagIds(tagIds);
    setLastPendingTagId(tagIds[tagIds.length - 1] ?? null);
  });

  async function loadFileTags(): Promise<void> {
    if (!window.asteria || fileIds.length === 0) {
      setFileTags([]);
      setMessage(t("window.batch.invalid"));
      return;
    }

    const nextFileTags = await window.asteria.listBatchFileTags(fileIds);
    setFileTags(nextFileTags);
    setMessage(t("window.batch.count", { count: fileIds.length }));
  }

  async function removePendingTags(tagIds: number[]): Promise<void> {
    if (!window.asteria || tagIds.length === 0) {
      return;
    }

    const nextFileTags = await window.asteria.removeTagsFromFiles(
      fileIds,
      tagIds,
    );
    setFileTags(nextFileTags);
    setPendingTagIds([]);
    setLastPendingTagId(null);
  }

  function handleTagMouseDown(
    event: React.MouseEvent<HTMLElement>,
    tag: BatchFileTagRecord,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const isPending = pendingTagIds.includes(tag.id);

    if (event.shiftKey && lastPendingTagId !== null) {
      const anchorIndex = fileTags.findIndex(
        (item) => item.id === lastPendingTagId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = fileTags.slice(start, end + 1).map((item) => item.id);

        setPendingTagIds((currentTagIds) =>
          event.ctrlKey ? mergeIds(currentTagIds, rangeIds) : rangeIds,
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
      className={batchRootClass}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setPendingTagIds([]);
          setLastPendingTagId(null);
        }
      }}
    >
      <div
        className={batchListClass}
        ref={tagListRef}
        onMouseDownCapture={boxSelection.handleMouseDownCapture}
      >
        {fileTags.length > 0 ? (
          fileTags.map((tag, index) => (
            <button
              className={getTagNamespaceClassName(
                tag,
                pendingTagIds.includes(tag.id)
                  ? `${batchTagItemClass} ${batchTagPendingClass}`
                  : batchTagItemClass,
              )}
              data-box-select-id={tag.id}
              key={tag.id}
              style={getTagNamespaceStyle(tag)}
              title={formatTagLabel(tag)}
              type="button"
              onMouseDown={(event) => handleTagMouseDown(event, tag, index)}
            >
              <span className="min-w-0 overflow-hidden px-1.5 text-ellipsis whitespace-nowrap">
                {formatTagLabel(tag)}
              </span>
              <span className="border-l border-(--line) px-1.5 text-(--muted)">
                {tag.fileCount}
              </span>
            </button>
          ))
        ) : (
          <div className="p-2 text-(--muted)">{t("common.noTags")}</div>
        )}
        {boxSelection.selectionBox ? (
          <div
            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
            style={boxSelection.selectionBox}
          />
        ) : null}
      </div>

      <TagTokenInput
        ariaLabel={t("window.batch.input")}
        placeholder={t("window.batch.placeholder")}
        selectedSuggestionIndex={tagInput.selectedSuggestionIndex}
        suggestions={tagInput.suggestions}
        text={tagInput.text}
        tokens={tagInput.tokens}
        onKeyDown={tagInput.handleKeyDown}
        onPickSuggestion={tagInput.addTokenFromSuggestion}
        onTextChange={tagInput.setText}
      />
      <footer className="flex h-6 items-center border-t border-(--line) px-2 text-(--muted)">
        {message}
      </footer>
    </section>
  );
}
