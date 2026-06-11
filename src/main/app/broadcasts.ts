import { BrowserWindow } from "electron";
import type {
  FilesChangedKind,
  FilesChangedPayload,
} from "../../shared/ipc.js";
import { IpcEvent } from "../../shared/ipcChannels.js";

// Renderers respond to these events by refetching, so a burst of broadcasts
// (batch tagging, multi-file trash/restore, AI tagging sweeps) only needs to
// reach them once per window of time: send the first one immediately, then
// coalesce the rest of the burst into a single trailing broadcast.
const COALESCE_WINDOW_MS = 80;
const MAX_COALESCED_FILE_IDS = 5000;

interface CoalescedChannelState {
  timer: NodeJS.Timeout | null;
  pending: boolean;
}

interface CoalescedFilesChangedState {
  timer: NodeJS.Timeout | null;
  pendingPayload: FilesChangedPayload | null;
}

const coalescedChannels = new Map<string, CoalescedChannelState>();
const coalescedFilesChangedState: CoalescedFilesChangedState = {
  timer: null,
  pendingPayload: null,
};

function broadcastCoalesced(channel: string): void {
  let state = coalescedChannels.get(channel);

  if (!state) {
    state = { timer: null, pending: false };
    coalescedChannels.set(channel, state);
  }

  if (state.timer) {
    state.pending = true;
    return;
  }

  broadcastToAllWindows(channel);
  state.timer = setTimeout(() => {
    state.timer = null;

    if (state.pending) {
      state.pending = false;
      broadcastCoalesced(channel);
    }
  }, COALESCE_WINDOW_MS);
}

export function broadcastFilesChanged(
  payload?: Partial<FilesChangedPayload>,
): void {
  broadcastFilesChangedWithPayload(payload);
}

export function broadcastFilesChangedWithPayload(
  payload?: Partial<FilesChangedPayload>,
): void {
  const nextPayload = normalizeFilesChangedPayload(payload);

  if (coalescedFilesChangedState.timer) {
    coalescedFilesChangedState.pendingPayload = mergeFilesChangedPayloads(
      coalescedFilesChangedState.pendingPayload,
      nextPayload,
    );
    return;
  }

  broadcastToAllWindows(IpcEvent.FILES_CHANGED, nextPayload);
  coalescedFilesChangedState.timer = setTimeout(() => {
    coalescedFilesChangedState.timer = null;

    if (coalescedFilesChangedState.pendingPayload) {
      const pendingPayload = coalescedFilesChangedState.pendingPayload;
      coalescedFilesChangedState.pendingPayload = null;
      broadcastFilesChangedWithPayload(pendingPayload);
    }
  }, COALESCE_WINDOW_MS);
}

export function broadcastFileFavoriteChanged(
  fileId: number,
  favorite: boolean,
): void {
  broadcastToAllWindows(IpcEvent.FILE_FAVORITE_CHANGED, fileId, favorite);
}

export function broadcastPageLayoutChanged(): void {
  broadcastToAllWindows(IpcEvent.PAGE_LAYOUT_CHANGED);
}

export function broadcastImportQueueChanged(): void {
  broadcastCoalesced(IpcEvent.IMPORT_QUEUE_CHANGED);
}

function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, ...args);
    }
  }
}

function normalizeFilesChangedPayload(
  payload?: Partial<FilesChangedPayload>,
): FilesChangedPayload {
  const fileIds = normalizeFileIds(payload?.fileIds);
  const fullRefresh = payload?.fullRefresh === true || fileIds === null;

  return {
    kind: normalizeFilesChangedKind(payload?.kind),
    ...(fullRefresh ? { fullRefresh: true } : { fileIds }),
  };
}

function normalizeFilesChangedKind(
  kind: FilesChangedPayload["kind"] | undefined,
): FilesChangedKind {
  return kind ?? "unknown";
}

function normalizeFileIds(fileIds: unknown): number[] | null {
  if (!Array.isArray(fileIds)) {
    return null;
  }

  const normalizedIds = [
    ...new Set(
      fileIds.filter(
        (fileId): fileId is number =>
          Number.isInteger(fileId) && fileId > 0,
      ),
    ),
  ];

  return normalizedIds.length > 0 ? normalizedIds : null;
}

function mergeFilesChangedPayloads(
  currentPayload: FilesChangedPayload | null,
  nextPayload: FilesChangedPayload,
): FilesChangedPayload {
  if (!currentPayload) {
    return nextPayload;
  }

  const kind =
    currentPayload.kind === nextPayload.kind ? currentPayload.kind : "mixed";

  if (
    currentPayload.fullRefresh ||
    nextPayload.fullRefresh ||
    !currentPayload.fileIds ||
    !nextPayload.fileIds
  ) {
    return {
      kind,
      fullRefresh: true,
    };
  }

  const fileIds = [...new Set([...currentPayload.fileIds, ...nextPayload.fileIds])];

  if (fileIds.length > MAX_COALESCED_FILE_IDS) {
    return {
      kind,
      fullRefresh: true,
    };
  }

  return {
    kind,
    fileIds,
  };
}
