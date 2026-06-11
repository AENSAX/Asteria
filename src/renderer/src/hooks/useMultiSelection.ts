import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { mergeIds } from "../utils/ids";

interface MultiSelectionOptions<T> {
  items: T[];
  getId: (item: T, index: number) => number;
  selectedIds: number[];
  lastSelectedId: number | null;
  onSelect: Dispatch<SetStateAction<number[]>>;
  onLastSelectedId: (id: number | null) => void;
  isSelectable?: (item: T) => boolean;
  leftButtonOnly?: boolean;
  // 不阻止 mousedown 默认行为，否则浏览器不会发起条目的原生拖拽（draggable）
  allowNativeDrag?: boolean;
  onPlainClickSelected?: (item: T, index: number) => boolean;
}

export interface MultiSelectionController<T> {
  handleItemMouseDown: (
    event: MouseEvent<HTMLElement>,
    item: T,
    index: number,
  ) => void;
}

export function useMultiSelection<T>({
  items,
  getId,
  selectedIds,
  lastSelectedId,
  onSelect,
  onLastSelectedId,
  isSelectable,
  leftButtonOnly = false,
  allowNativeDrag = false,
  onPlainClickSelected,
}: MultiSelectionOptions<T>): MultiSelectionController<T> {
  function handleItemMouseDown(
    event: MouseEvent<HTMLElement>,
    item: T,
    index: number,
  ): void {
    if (leftButtonOnly && event.button !== 0) {
      return;
    }

    if (!allowNativeDrag) {
      event.preventDefault();
    }

    event.stopPropagation();

    const id = getId(item, index);
    const isSelected = selectedIds.includes(id);

    if (event.shiftKey && lastSelectedId !== null) {
      const anchorIndex = items.findIndex(
        (anchorItem, anchorItemIndex) =>
          getId(anchorItem, anchorItemIndex) === lastSelectedId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = items
          .slice(start, end + 1)
          .map((rangeItem, offset) => ({
            item: rangeItem,
            index: start + offset,
          }))
          .filter((entry) => !isSelectable || isSelectable(entry.item))
          .map((entry) => getId(entry.item, entry.index));

        onSelect((currentIds) =>
          event.ctrlKey ? mergeIds(currentIds, rangeIds) : rangeIds,
        );
        return;
      }
    }

    if (event.ctrlKey) {
      onSelect((currentIds) =>
        isSelected
          ? currentIds.filter((currentId) => currentId !== id)
          : [...currentIds, id],
      );
      onLastSelectedId(id);
      return;
    }

    if (isSelected && onPlainClickSelected?.(item, index)) {
      return;
    }

    onSelect([id]);
    onLastSelectedId(id);
  }

  return { handleItemMouseDown };
}
