import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLanguage } from "../utils/language";

interface ResizableRowsProps {
  className: string;
  storageKey: string;
  defaultTopHeight: number;
  minTopHeight?: number;
  minBottomHeight?: number;
  top: JSX.Element;
  bottom: JSX.Element;
}

export function ResizableRows({
  className,
  storageKey,
  defaultTopHeight,
  minTopHeight = 120,
  minBottomHeight = 160,
  top,
  bottom,
}: ResizableRowsProps): JSX.Element {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef({
    active: false,
    startY: 0,
    startHeight: defaultTopHeight,
  });
  const [topHeight, setTopHeight] = useState(() =>
    readStoredHeight(storageKey, defaultTopHeight),
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(topHeight));
  }, [topHeight, storageKey]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      if (!dragRef.current.active) {
        return;
      }

      const rootHeight = rootRef.current?.getBoundingClientRect().height ?? 0;
      const maxTopHeight = Math.max(
        minTopHeight,
        rootHeight - minBottomHeight - 5,
      );
      const nextHeight =
        dragRef.current.startHeight + event.clientY - dragRef.current.startY;
      setTopHeight(
        Math.min(maxTopHeight, Math.max(minTopHeight, Math.round(nextHeight))),
      );
      event.preventDefault();
    }

    function handlePointerUp(): void {
      dragRef.current.active = false;
      document.body.classList.remove("resizing-rows");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("resizing-rows");
    };
  }, [minBottomHeight, minTopHeight]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    dragRef.current = {
      active: true,
      startY: event.clientY,
      startHeight: topHeight,
    };
    document.body.classList.add("resizing-rows");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  return (
    <section
      className={`${className} grid min-h-0 min-w-0`}
      ref={rootRef}
      style={{ gridTemplateRows: `${topHeight}px 5px minmax(0, 1fr)` }}
    >
      <div className="min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:w-full [&>*]:min-h-0 [&>*]:min-w-0">
        {top}
      </div>
      <div
        aria-label={t("common.adjustHeight")}
        aria-orientation="horizontal"
        className="resizable-row-splitter min-h-[5px] w-full cursor-row-resize"
        role="separator"
        onPointerDown={startResize}
      />
      <div className="min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:w-full [&>*]:min-h-0 [&>*]:min-w-0">
        {bottom}
      </div>
    </section>
  );
}

function readStoredHeight(storageKey: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(storageKey));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
