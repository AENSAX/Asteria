import { useRef } from "react";
import type { MouseEvent } from "react";
import { useBoxSelection } from "../../hooks/useBoxSelection";
import { useLanguage } from "../../utils/language";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../../utils/tags";
import {
  emptyClass,
  sectionHeaderClass,
  tagPillClass,
  tagPillSelectedClass,
} from "./classNames";
import type { StagedTag } from "./tagManagerData";

interface StagedTagsPanelProps {
  stagedTags: StagedTag[];
  selectedIds: number[];
  onSelectIds: (ids: number[]) => void;
  onLastSelectedId: (id: number | null) => void;
  onTagMouseDown: (
    event: MouseEvent<HTMLElement>,
    tag: StagedTag,
    index: number,
  ) => void;
}

export function StagedTagsPanel({
  stagedTags,
  selectedIds,
  onSelectIds,
  onLastSelectedId,
  onTagMouseDown,
}: StagedTagsPanelProps): JSX.Element {
  const { t } = useLanguage();
  const listRef = useRef<HTMLDivElement | null>(null);
  const boxSelection = useBoxSelection({
    containerRef: listRef,
    itemSelector: "[data-box-select-id]",
    selectedIds,
    startOnlyFromContainer: true,
    onSelect: onSelectIds,
    onLastSelectedId,
  });

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[27px_minmax(0,1fr)] bg-(--panel)">
      <header className={sectionHeaderClass}>
        <span>{t("window.tagManager.stagingArea")}</span>
        <span className="font-normal text-(--muted)">
          {t("window.tagManager.stagingCount", {
            count: stagedTags.length,
          })}
        </span>
      </header>
      <div
        className="relative flex min-h-0 flex-wrap content-start gap-1 overflow-auto bg-(--surface-bg) p-1.5"
        data-tag-selection-scope="staged"
        ref={listRef}
        onMouseDownCapture={boxSelection.handleMouseDownCapture}
      >
        {stagedTags.length > 0 ? (
          stagedTags.map((tag, index) => (
            <button
              className={getTagNamespaceClassName(
                tag,
                selectedIds.includes(tag.localId)
                  ? `${tagPillClass} ${tagPillSelectedClass}`
                  : tagPillClass,
              )}
              data-box-select-id={tag.localId}
              data-tag-selection-group="staged"
              key={tag.localId}
              style={getTagNamespaceStyle(tag)}
              title={formatTagLabel(tag)}
              type="button"
              onMouseDown={(event) => onTagMouseDown(event, tag, index)}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {formatTagLabel(tag)}
              </span>
            </button>
          ))
        ) : (
          <div className={emptyClass}>{t("window.tagManager.noStagedTags")}</div>
        )}
        {boxSelection.selectionBox ? (
          <div
            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
            style={boxSelection.selectionBox}
          />
        ) : null}
      </div>
    </section>
  );
}
