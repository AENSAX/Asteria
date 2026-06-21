import type { Dispatch, DragEvent, SetStateAction } from "react";
import type {
  ImportProgress,
  ImportQueueFileRecord,
} from "../../../shared/ipc";
import { readDroppedImportData } from "../utils/dropImport";
import { confirmDuplicateImports } from "../utils/importConfirm";
import {
  consumeInternalFileDrag,
  isInternalFileDragActive,
} from "../utils/internalFileDrag";
import { type TranslationFunction } from "../utils/language";

interface WorkbenchImportHandlersOptions<PageItem extends { id: string }> {
  isImporting: boolean;
  getActiveImportQueueKey: () => string | null;
  t: TranslationFunction;
  activateImportQueuePreview: (page: PageItem | null) => Promise<void>;
  closeMenu: () => void;
  createIdleProgress: (t: TranslationFunction) => ImportProgress;
  deactivateActivePageImportQueue: () => void;
  openImportView: () => PageItem;
  progress: ImportProgress;
  setDragActive: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<ImportProgress>>;
}

export interface WorkbenchImportHandlers {
  cancelImportQueueFromActivePage: () => Promise<void>;
  commitImportQueueFromActivePage: (
    queueFiles: ImportQueueFileRecord[],
  ) => Promise<void>;
  handleDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  startFileImport: () => Promise<void>;
  startFolderImport: () => Promise<void>;
}

export function createWorkbenchImportHandlers<PageItem extends { id: string }>({
  activateImportQueuePreview,
  closeMenu,
  createIdleProgress,
  deactivateActivePageImportQueue,
  getActiveImportQueueKey,
  isImporting,
  openImportView,
  progress,
  setDragActive,
  setProgress,
  t,
}: WorkbenchImportHandlersOptions<PageItem>): WorkbenchImportHandlers {
  async function startFileImport(): Promise<void> {
    closeMenu();
    const importPage = openImportView();

    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return;
    }

    if (isImporting) {
      return;
    }

    const queueKey = importPage.id;

    setProgress({
      ...createIdleProgress(t),
      phase: "selecting",
      message: t("app.status.waitingSelectFiles"),
    });

    try {
      const result = await window.asteria.importFiles(queueKey);
      setProgress(result);
      await activateImportQueuePreview(importPage);
    } catch (error) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("app.status.importFailed"),
      });
    }
  }

  async function startFolderImport(): Promise<void> {
    closeMenu();
    const importPage = openImportView();

    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return;
    }

    if (isImporting) {
      return;
    }

    const queueKey = importPage.id;

    setProgress({
      ...createIdleProgress(t),
      phase: "selecting",
      message: t("app.status.waitingSelectFolder"),
    });

    try {
      const result = await window.asteria.importFolder(queueKey);
      setProgress(result);
      await activateImportQueuePreview(importPage);
    } catch (error) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("app.status.importFailed"),
      });
    }
  }

  async function importDroppedData(
    dataTransfer: DataTransfer,
    importPage: PageItem | null,
  ): Promise<void> {
    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return;
    }

    if (isImporting) {
      return;
    }

    const queueKey = importPage?.id ?? getActiveImportQueueKey();

    if (!queueKey) {
      return;
    }

    const droppedData = readDroppedImportData(dataTransfer);
    const paths = droppedData.files
      .map((file) => window.asteria.getPathForFile(file))
      .filter((path) => path.length > 0);
    const urls = droppedData.urls;

    if (paths.length === 0 && urls.length === 0) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.noDroppedPathOrUrl"),
      });
      return;
    }

    setProgress({
      ...createIdleProgress(t),
      phase: "importing",
      message: t("app.status.scanDroppedContent"),
    });

    try {
      let result: ImportProgress | null = null;

      if (paths.length > 0) {
        result = await window.asteria.importPaths(paths, queueKey);
      }

      if (urls.length > 0) {
        result = await window.asteria.importUrls(urls, queueKey);
      }

      if (!result) {
        return;
      }

      setProgress(result);
      await activateImportQueuePreview(importPage);
    } catch (error) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("app.status.importFailed"),
      });
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    event.preventDefault();

    if (isInternalFileDragActive()) {
      setDragActive(false);
      return;
    }

    if (!isImporting) {
      setDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setDragActive(false);

    if (consumeInternalFileDrag()) {
      return;
    }

    const importPage = openImportView();
    void importDroppedData(event.dataTransfer, importPage);
  }

  async function commitImportQueueFromActivePage(
    queueFiles: ImportQueueFileRecord[],
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const confirmedDuplicateIds = await confirmDuplicateImports(queueFiles, t);

    if (confirmedDuplicateIds === null) {
      return;
    }

    const result = await window.asteria.commitImportQueue(
      queueFiles.map((file) => file.id),
      confirmedDuplicateIds,
      getQueueKeyOrDefault(),
    );
    setProgress(result);

    if (result.remainingQueue.length === 0) {
      deactivateActivePageImportQueue();
    }
  }

  async function cancelImportQueueFromActivePage(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const queueKey = getQueueKeyOrDefault();
    const queueFiles = await window.asteria.listImportQueueFiles(queueKey);

    if (queueFiles.length > 0) {
      const confirmed = await window.asteria.confirmDialog({
        title: t("app.status.clearQueueConfirmTitle"),
        message: t("app.status.clearQueueConfirmMessage", {
          count: queueFiles.length,
        }),
      });

      if (!confirmed) {
        return;
      }
    }

    const wasImporting = progress.phase === "importing";
    const result = await window.asteria.clearImportQueue(queueKey);
    setProgress(result);

    if (!wasImporting) {
      deactivateActivePageImportQueue();
    }
  }

  return {
    cancelImportQueueFromActivePage,
    commitImportQueueFromActivePage,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    startFileImport,
    startFolderImport,
  };

  function getQueueKeyOrDefault(): string {
    return getActiveImportQueueKey() ?? "default";
  }
}
