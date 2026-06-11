import type { Dispatch, DragEvent, SetStateAction } from "react";
import type {
  ImportProgress,
  ImportQueueFileRecord,
} from "../../../shared/ipc";
import { readDroppedImportData } from "../utils/dropImport";
import {
  getFileDomainDisplayName,
  type TranslationFunction,
} from "../utils/language";

interface WorkbenchImportHandlersOptions<PageItem> {
  isImporting: boolean;
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

export function createWorkbenchImportHandlers<PageItem>({
  activateImportQueuePreview,
  closeMenu,
  createIdleProgress,
  deactivateActivePageImportQueue,
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

    setProgress({
      ...createIdleProgress(t),
      phase: "selecting",
      message: t("app.status.waitingSelectFiles"),
    });

    try {
      const result = await window.asteria.importFiles();
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

    setProgress({
      ...createIdleProgress(t),
      phase: "selecting",
      message: t("app.status.waitingSelectFolder"),
    });

    try {
      const result = await window.asteria.importFolder();
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
        result = await window.asteria.importPaths(paths);
      }

      if (urls.length > 0) {
        result = await window.asteria.importUrls(urls);
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
    const importPage = openImportView();
    void importDroppedData(event.dataTransfer, importPage);
  }

  async function commitImportQueueFromActivePage(
    queueFiles: ImportQueueFileRecord[],
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const confirmedDuplicateIds: number[] = [];

    for (const file of queueFiles) {
      if (!file.duplicate) {
        continue;
      }

      const confirmed = await window.asteria.confirmDialog({
        title: t("app.status.duplicateConfirmTitle"),
        message: t("app.status.duplicateConfirmMessage", {
          domainName: getFileDomainDisplayName(file.duplicate.domain, t),
        }),
      });

      if (confirmed) {
        confirmedDuplicateIds.push(file.id);
      }
    }

    const result = await window.asteria.commitImportQueue(
      queueFiles.map((file) => file.id),
      confirmedDuplicateIds,
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

    const wasImporting = progress.phase === "importing";
    const result = await window.asteria.clearImportQueue();
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
}
