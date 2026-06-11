import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { mergeIds } from "../utils/ids";

interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseBoxSelectionOptions {
  containerRef: RefObject<HTMLElement>;
  itemSelector: string;
  selectedIds: number[];
  startOnlyFromContainer?: boolean;
  // 条目自身支持原生拖拽时，框选只能从条目以外的空白处发起
  startOnlyOutsideItems?: boolean;
  onSelect: (ids: number[]) => void;
  onLastSelectedId?: (id: number | null) => void;
}

interface UseBoxSelectionResult {
  selectionBox: SelectionBox | null;
  handleMouseDownCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

interface DragState {
  startClientX: number;
  startClientY: number;
  additive: boolean;
  baseIds: number[];
  active: boolean;
}

const dragThreshold = 4;

export function useBoxSelection({
  containerRef,
  itemSelector,
  onLastSelectedId,
  onSelect,
  selectedIds,
  startOnlyFromContainer = false,
  startOnlyOutsideItems = false,
}: UseBoxSelectionOptions): UseBoxSelectionResult {
  const selectedIdsRef = useRef(selectedIds);
  const dragRef = useRef<DragState | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, []);

  function handleMouseDownCapture(event: ReactMouseEvent<HTMLElement>): void {
    if (event.button !== 0 || !containerRef.current) {
      return;
    }

    if (startOnlyFromContainer && event.target !== event.currentTarget) {
      return;
    }

    if (
      startOnlyOutsideItems &&
      event.target instanceof Element &&
      event.target.closest(itemSelector)
    ) {
      return;
    }

    if (isInteractiveNonSelectableTarget(event.target)) {
      return;
    }

    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      additive: event.ctrlKey,
      baseIds: event.ctrlKey ? [...selectedIdsRef.current] : [],
      active: false,
    };

    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);
  }

  function handleDocumentMouseMove(event: MouseEvent): void {
    const drag = dragRef.current;
    const container = containerRef.current;

    if (!drag || !container) {
      return;
    }

    const distanceX = Math.abs(event.clientX - drag.startClientX);
    const distanceY = Math.abs(event.clientY - drag.startClientY);

    if (!drag.active && Math.max(distanceX, distanceY) < dragThreshold) {
      return;
    }

    drag.active = true;
    event.preventDefault();

    const viewportBox = createViewportBox(
      drag.startClientX,
      drag.startClientY,
      event.clientX,
      event.clientY,
    );
    setSelectionBox(toContainerBox(viewportBox, container));

    const boxIds = readIntersectingItemIds(
      container,
      itemSelector,
      viewportBox,
    );
    const nextIds = drag.additive ? mergeIds(drag.baseIds, boxIds) : boxIds;
    onSelect(nextIds);
    onLastSelectedId?.(
      boxIds[boxIds.length - 1] ?? nextIds[nextIds.length - 1] ?? null,
    );
  }

  function handleDocumentMouseUp(): void {
    dragRef.current = null;
    setSelectionBox(null);
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
  }

  return {
    selectionBox,
    handleMouseDownCapture,
  };
}

function isInteractiveNonSelectableTarget(target: EventTarget): boolean {
  const element = target instanceof Element ? target : null;

  if (!element) {
    return false;
  }

  return Boolean(
    element.closest("input, textarea, select, .context-menu, .tag-token-input"),
  );
}

function createViewportBox(
  startClientX: number,
  startClientY: number,
  currentClientX: number,
  currentClientY: number,
): SelectionBox {
  const left = Math.min(startClientX, currentClientX);
  const top = Math.min(startClientY, currentClientY);

  return {
    left,
    top,
    width: Math.abs(currentClientX - startClientX),
    height: Math.abs(currentClientY - startClientY),
  };
}

function toContainerBox(
  viewportBox: SelectionBox,
  container: HTMLElement,
): SelectionBox {
  const containerRect = container.getBoundingClientRect();

  return {
    left: viewportBox.left - containerRect.left + container.scrollLeft,
    top: viewportBox.top - containerRect.top + container.scrollTop,
    width: viewportBox.width,
    height: viewportBox.height,
  };
}

function readIntersectingItemIds(
  container: HTMLElement,
  itemSelector: string,
  viewportBox: SelectionBox,
): number[] {
  const ids: number[] = [];
  const items = container.querySelectorAll<HTMLElement>(itemSelector);

  for (const item of items) {
    const id = Number(item.dataset.boxSelectId);

    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }

    if (rectanglesIntersect(viewportBox, item.getBoundingClientRect())) {
      ids.push(id);
    }
  }

  return ids;
}

function rectanglesIntersect(left: SelectionBox, right: DOMRect): boolean {
  return (
    left.left <= right.right &&
    left.left + left.width >= right.left &&
    left.top <= right.bottom &&
    left.top + left.height >= right.top
  );
}
