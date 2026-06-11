import { BrowserWindow } from "electron";
import { IpcEvent } from "../../shared/ipcChannels.js";
import type { MainLanguageId } from "../i18n.js";
import { mainT } from "../i18n.js";
import {
  createAsteriaWindow,
  loadRenderer,
  setupWindowDiagnostics,
  showWhenReady,
} from "./windowFactory.js";

interface FileDetailWindowManagerOptions {
  normalizeFileIds: (value: unknown) => number[];
}

export interface FileDetailWindowManager {
  createFileDetailWindow: (
    id: number,
    sequenceIds?: number[],
    languageId?: MainLanguageId,
  ) => BrowserWindow;
  getFileDetailSequence: (webContentsId: number) => number[];
}

export function createFileDetailWindowManager({
  normalizeFileIds,
}: FileDetailWindowManagerOptions): FileDetailWindowManager {
  const windows = new Map<number, BrowserWindow>();
  const sequences = new Map<number, number[]>();

  function setFileDetailSequence(
    window: BrowserWindow,
    fileId: number,
    sequenceIds?: number[],
  ): void {
    const normalizedSequence = normalizeFileIds(sequenceIds);

    if (normalizedSequence.includes(fileId)) {
      sequences.set(window.webContents.id, normalizedSequence);
      return;
    }

    sequences.delete(window.webContents.id);
  }

  function createFileDetailWindow(
    id: number,
    sequenceIds?: number[],
    languageId: MainLanguageId = "zh-CN",
  ): BrowserWindow {
    const existingWindow = windows.get(id);

    if (existingWindow && !existingWindow.isDestroyed()) {
      setFileDetailSequence(existingWindow, id, sequenceIds);
      existingWindow.setTitle(mainT(languageId, "window.fileDetail"));

      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }

      existingWindow.show();
      existingWindow.focus();
      existingWindow.webContents.send(IpcEvent.FILE_DETAIL_RESET, id);
      return existingWindow;
    }

    const window = createAsteriaWindow({
      width: 1040,
      height: 760,
      minWidth: 720,
      minHeight: 480,
      title: mainT(languageId, "window.fileDetail"),
      show: false,
    });

    setupWindowDiagnostics(window);
    const webContentsId = window.webContents.id;
    windows.set(id, window);
    setFileDetailSequence(window, id, sequenceIds);
    loadRenderer(window, { window: "file-detail", id: String(id) });

    showWhenReady(window);

    window.once("closed", () => {
      sequences.delete(webContentsId);

      if (windows.get(id) === window) {
        windows.delete(id);
      }
    });

    return window;
  }

  function getFileDetailSequence(webContentsId: number): number[] {
    return sequences.get(webContentsId) ?? [];
  }

  return {
    createFileDetailWindow,
    getFileDetailSequence,
  };
}
