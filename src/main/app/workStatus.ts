import { BrowserWindow } from "electron";
import type { WorkStatus } from "../../shared/ipc.js";
import { IpcEvent } from "../../shared/ipcChannels.js";

interface WorkStatusManagerOptions {
  getImageConversionWorkStatus: () => WorkStatus;
  getAiTaggingWorkStatus: () => WorkStatus;
  getThumbnailWorkStatus: () => WorkStatus;
}

export interface WorkStatusManager {
  getCombinedWorkStatus: () => WorkStatus;
  broadcastCombinedWorkStatus: () => void;
  beginTagTranslationWorkStatus: (total: number) => void;
  updateTagTranslationWorkStatus: (completed: number, total: number) => void;
  finishTagTranslationWorkStatus: () => void;
}

export function createWorkStatusManager({
  getImageConversionWorkStatus,
  getAiTaggingWorkStatus,
  getThumbnailWorkStatus,
}: WorkStatusManagerOptions): WorkStatusManager {
  let tagTranslationWorkStatus = createIdleTagTranslationWorkStatus();

  function getCombinedWorkStatus(): WorkStatus {
    const imageConversionStatus = getImageConversionWorkStatus();

    if (imageConversionStatus.active) {
      return imageConversionStatus;
    }

    const aiStatus = getAiTaggingWorkStatus();

    if (aiStatus.active) {
      return aiStatus;
    }

    if (tagTranslationWorkStatus.active) {
      return tagTranslationWorkStatus;
    }

    return getThumbnailWorkStatus();
  }

  function broadcastCombinedWorkStatus(): void {
    broadcastWorkStatus(getCombinedWorkStatus());
  }

  function beginTagTranslationWorkStatus(total: number): void {
    if (total <= 0) {
      return;
    }

    updateTagTranslationWorkStatus(0, total);
  }

  function updateTagTranslationWorkStatus(
    completed: number,
    total: number,
  ): void {
    tagTranslationWorkStatus = {
      active: completed < total,
      message: completed < total ? "正在翻译标签" : "标签翻译完成",
      messageKey:
        completed < total
          ? "app.workStatus.tagTranslating"
          : "app.workStatus.tagTranslationDone",
      queued: Math.max(0, total - completed),
      processing: completed < total ? 1 : 0,
      completed,
    };
    broadcastCombinedWorkStatus();
  }

  function finishTagTranslationWorkStatus(): void {
    tagTranslationWorkStatus = createIdleTagTranslationWorkStatus();
    broadcastCombinedWorkStatus();
  }

  return {
    getCombinedWorkStatus,
    broadcastCombinedWorkStatus,
    beginTagTranslationWorkStatus,
    updateTagTranslationWorkStatus,
    finishTagTranslationWorkStatus,
  };
}

function broadcastWorkStatus(status: WorkStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcEvent.WORK_STATUS_CHANGED, status);
    }
  }
}

function createIdleTagTranslationWorkStatus(): WorkStatus {
  return {
    active: false,
    message: "标签翻译空闲",
    messageKey: "app.workStatus.tagTranslationIdle",
    queued: 0,
    processing: 0,
    completed: 0,
  };
}
