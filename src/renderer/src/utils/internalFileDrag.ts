const INTERNAL_FILE_DRAG_TTL_MS = 30_000;

let activeInternalFileDrag: {
  startedAt: number;
} | null = null;
let clearInternalFileDragTimer: number | null = null;

export function markInternalFileDrag(): void {
  clearInternalFileDrag();

  activeInternalFileDrag = {
    startedAt: Date.now(),
  };
  clearInternalFileDragTimer = window.setTimeout(
    clearInternalFileDrag,
    INTERNAL_FILE_DRAG_TTL_MS,
  );
}

export function consumeInternalFileDrag(): boolean {
  const isFresh = isInternalFileDragActive();
  activeInternalFileDrag = null;
  return isFresh;
}

export function isInternalFileDragActive(): boolean {
  return Boolean(
    activeInternalFileDrag &&
      Date.now() - activeInternalFileDrag.startedAt <= INTERNAL_FILE_DRAG_TTL_MS,
  );
}

export function clearInternalFileDrag(): void {
  activeInternalFileDrag = null;

  if (clearInternalFileDragTimer !== null) {
    window.clearTimeout(clearInternalFileDragTimer);
    clearInternalFileDragTimer = null;
  }
}
