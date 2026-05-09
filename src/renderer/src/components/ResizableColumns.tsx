import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

interface ResizableColumnsProps {
  className: string;
  storageKey: string;
  defaultLeftWidth: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  left: JSX.Element;
  right: JSX.Element;
}

export function ResizableColumns({
  className,
  storageKey,
  defaultLeftWidth,
  minLeftWidth = 120,
  minRightWidth = 180,
  left,
  right
}: ResizableColumnsProps): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startWidth: defaultLeftWidth
  });
  const [leftWidth, setLeftWidth] = useState(() => readStoredWidth(storageKey, defaultLeftWidth));

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(leftWidth));
  }, [leftWidth, storageKey]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      if (!dragRef.current.active) {
        return;
      }

      const rootWidth = rootRef.current?.getBoundingClientRect().width ?? 0;
      const maxLeftWidth = Math.max(minLeftWidth, rootWidth - minRightWidth - 5);
      const nextWidth = dragRef.current.startWidth + event.clientX - dragRef.current.startX;
      setLeftWidth(Math.min(maxLeftWidth, Math.max(minLeftWidth, Math.round(nextWidth))));
      event.preventDefault();
    }

    function handlePointerUp(): void {
      dragRef.current.active = false;
      document.body.classList.remove('resizing-columns');
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.classList.remove('resizing-columns');
    };
  }, [minLeftWidth, minRightWidth]);

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    dragRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: leftWidth
    };
    document.body.classList.add('resizing-columns');
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  return (
    <section
      className={`${className} grid min-h-0 min-w-0`}
      ref={rootRef}
      style={{ gridTemplateColumns: `${leftWidth}px 5px minmax(0, 1fr)` }}
    >
      <div className="min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:w-full [&>*]:min-h-0 [&>*]:min-w-0">{left}</div>
      <div
        aria-label="调整宽度"
        aria-orientation="vertical"
        className="h-full min-w-[5px] cursor-col-resize border-x border-(--line) bg-(--statusbar-bg) hover:bg-(--splitter-hover-bg)"
        role="separator"
        onPointerDown={startResize}
      />
      <div className="min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:w-full [&>*]:min-h-0 [&>*]:min-w-0">{right}</div>
    </section>
  );
}

function readStoredWidth(storageKey: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(storageKey));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
