import type { ImportProgress, WorkStatus } from "../../../shared/ipc";
import type { TranslationFunction } from "../utils/language";

export function createIdleProgress(t: TranslationFunction): ImportProgress {
  return {
    phase: "idle",
    batchId: null,
    total: 0,
    processed: 0,
    imported: 0,
    duplicated: 0,
    failed: 0,
    chunkIndex: 0,
    chunkTotal: 0,
    currentFile: null,
    message: t("app.status.waitingImport"),
  };
}

export function createIdleWorkStatus(t: TranslationFunction): WorkStatus {
  return {
    active: false,
    message: t("app.status.ready"),
    messageKey: "app.status.ready",
    queued: 0,
    processing: 0,
    completed: 0,
  };
}
