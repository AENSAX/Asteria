import { BrowserWindow, type IpcMain, type WebContents } from "electron";
import type { ExportOptions, ExportProgress } from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { mainT, readWindowLanguageId } from "../i18n.js";

export interface ExportHandlersContext {
  chooseExportDirectory: (sender: WebContents) => Promise<string | null>;
  exportFiles: (
    sender: WebContents,
    options: ExportOptions,
  ) => Promise<ExportProgress>;
  cancelExport: (jobId: string) => void;
}

function isExportOptions(value: unknown): value is ExportOptions {
  const options = value as Partial<ExportOptions> | null;

  return Boolean(
    options &&
    typeof options.jobId === "string" &&
    Array.isArray(options.fileIds) &&
    typeof options.directory === "string" &&
    typeof options.filenameFormat === "string" &&
    typeof options.exportTagText === "boolean" &&
    typeof options.tagTextDirectory === "string" &&
    typeof options.tagTextFilenameFormat === "string",
  );
}

export function registerExportHandlers(
  ipcMain: IpcMain,
  context: ExportHandlersContext,
): void {
  ipcMain.handle(IpcChannel.EXPORT_SELECT_DIRECTORY, (event) =>
    context.chooseExportDirectory(event.sender),
  );
  ipcMain.handle(IpcChannel.EXPORT_FILES, async (event, options: unknown) => {
    if (!isExportOptions(options)) {
      const languageId = await readWindowLanguageId(
        BrowserWindow.fromWebContents(event.sender),
      );
      throw new Error(mainT(languageId, "window.export.invalidOptions"));
    }

    return context.exportFiles(event.sender, options);
  });
  ipcMain.handle(IpcChannel.EXPORT_CANCEL, (_event, jobId: unknown) => {
    if (typeof jobId === "string") {
      context.cancelExport(jobId);
    }
  });
}
