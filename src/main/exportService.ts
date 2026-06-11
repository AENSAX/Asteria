import { BrowserWindow, type WebContents } from "electron";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  ExportFileRecord,
  ExportOptions,
  ExportProgress,
} from "../shared/ipc.js";
import { IpcEvent } from "../shared/ipcChannels.js";
import { createExportJobRegistry } from "./app/exportJobRegistry.js";
import { listFilesForExport } from "./database.js";
import { mainT, readWindowLanguageId, type MainLanguageId } from "./i18n.js";

const exportJobRegistry = createExportJobRegistry();

export async function exportFiles(
  sender: WebContents,
  options: ExportOptions,
): Promise<ExportProgress> {
  const languageId = await readWindowLanguageId(
    BrowserWindow.fromWebContents(sender),
  );
  const normalizedOptions = normalizeExportOptions(options, languageId);
  const job = exportJobRegistry.start(normalizedOptions.jobId);

  try {
    const files = listFilesForExport(normalizedOptions.fileIds);
    const usedNames = new Set<string>();
    const usedTagTextNames = new Set<string>();
    let exported = 0;
    let failed = 0;

    await mkdir(normalizedOptions.directory, { recursive: true });
    if (normalizedOptions.exportTagText) {
      await mkdir(normalizedOptions.tagTextDirectory, { recursive: true });
    }
    emitExportProgress(sender, {
      jobId: normalizedOptions.jobId,
      phase: "exporting",
      total: files.length,
      processed: 0,
      exported: 0,
      failed: 0,
      currentFile: null,
      message: "开始导出",
      messageKey: "window.export.progressStarting",
    });

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      if (!file) {
        continue;
      }

      if (job.canceled) {
        const progress = createExportProgress(
          normalizedOptions.jobId,
          "canceled",
          files.length,
          index,
          exported,
          failed,
          null,
          "已取消",
          "window.export.progressCanceled",
        );
        emitExportProgress(sender, progress);
        return progress;
      }

      emitExportProgress(
        sender,
        createExportProgress(
          normalizedOptions.jobId,
          "exporting",
          files.length,
          index,
          exported,
          failed,
          file.fileName,
          "导出中",
          "window.export.progressExporting",
        ),
      );

      try {
        const renderedName = await renderExportFileName(
          normalizedOptions.filenameFormat,
          file,
          index,
        );
        const targetName = await ensureUniqueFileName(
          normalizedOptions.directory,
          appendOriginalExtension(renderedName, file),
          usedNames,
        );
        const targetPath = join(normalizedOptions.directory, targetName);

        await copyFile(file.sourcePath, targetPath);

        if (normalizedOptions.exportTagText) {
          const renderedTagTextName = await renderExportFileName(
            normalizedOptions.tagTextFilenameFormat,
            file,
            index,
          );
          const tagTextName = await ensureUniqueFileName(
            normalizedOptions.tagTextDirectory,
            appendTextExtension(renderedTagTextName),
            usedTagTextNames,
          );

          await writeFile(
            join(normalizedOptions.tagTextDirectory, tagTextName),
            renderTagText(file),
            "utf8",
          );
        }

        exported += 1;
      } catch {
        failed += 1;
      }

      emitExportProgress(
        sender,
        createExportProgress(
          normalizedOptions.jobId,
          "exporting",
          files.length,
          index + 1,
          exported,
          failed,
          file.fileName,
          "导出中",
          "window.export.progressExporting",
        ),
      );
    }

    const completionMessageKey =
      failed > 0
        ? "window.export.progressCompletedWithFailures"
        : "window.export.progressCompleted";
    const progress = createExportProgress(
      normalizedOptions.jobId,
      "completed",
      files.length,
      files.length,
      exported,
      failed,
      null,
      failed > 0 ? `完成，${failed} 个失败` : "完成",
      completionMessageKey,
      failed > 0 ? { failed } : undefined,
    );
    emitExportProgress(sender, progress);
    return progress;
  } finally {
    exportJobRegistry.finish(normalizedOptions.jobId);
  }
}

export function cancelExport(jobId: string): void {
  exportJobRegistry.cancel(jobId);
}

function normalizeExportOptions(
  options: ExportOptions,
  languageId: MainLanguageId,
): ExportOptions {
  const jobId =
    typeof options.jobId === "string" && options.jobId.trim()
      ? options.jobId.trim()
      : `export-${Date.now()}`;
  const directory =
    typeof options.directory === "string" ? options.directory.trim() : "";
  const filenameFormat =
    typeof options.filenameFormat === "string" && options.filenameFormat.trim()
      ? options.filenameFormat.trim()
      : "{index}-{hash}";
  const exportTagText = options.exportTagText === true;
  const tagTextDirectory =
    typeof options.tagTextDirectory === "string"
      ? options.tagTextDirectory.trim()
      : "";
  const tagTextFilenameFormat =
    typeof options.tagTextFilenameFormat === "string" &&
    options.tagTextFilenameFormat.trim()
      ? options.tagTextFilenameFormat.trim()
      : "{index}-{hash}";
  const fileIds = Array.isArray(options.fileIds)
    ? [
        ...new Set(
          options.fileIds.filter((id) => Number.isInteger(id) && id > 0),
        ),
      ]
    : [];

  if (!directory) {
    throw new Error(mainT(languageId, "window.export.invalidPath"));
  }

  if (fileIds.length === 0) {
    throw new Error(mainT(languageId, "window.export.invalidFiles"));
  }

  if (exportTagText && !tagTextDirectory) {
    throw new Error(mainT(languageId, "window.export.invalidTagTextPath"));
  }

  return {
    jobId,
    directory,
    exportTagText,
    filenameFormat,
    fileIds,
    tagTextDirectory,
    tagTextFilenameFormat,
  };
}

async function renderExportFileName(
  format: string,
  file: ExportFileRecord,
  index: number,
): Promise<string> {
  const sourceStat = await stat(file.sourcePath);
  const time = formatDate(sourceStat.mtime);
  const rendered = format.replace(/\{([^{}]+)\}/g, (_match, variable: string) =>
    renderExportVariable(variable.trim(), file, index, time),
  );
  const sanitized = sanitizeFileName(rendered);

  return sanitized || `${index}-${file.sha256}`;
}

function renderExportVariable(
  variable: string,
  file: ExportFileRecord,
  index: number,
  time: string,
): string {
  if (variable === "index") {
    return String(index);
  }

  if (variable === "time") {
    return time;
  }

  if (variable === "hash") {
    return file.sha256;
  }

  if (variable === "tag") {
    return file.tags.map(formatExportTag).join(" ");
  }

  if (variable.startsWith("namespace:")) {
    const namespace = variable.slice("namespace:".length).trim();
    const tag = file.tags.find((item) => item.namespace === namespace);
    return tag?.name ?? "";
  }

  if (variable.startsWith("rating:")) {
    const groupName = variable.slice("rating:".length).trim();
    const rating = file.ratings.find((item) => item.groupName === groupName);
    return rating?.label ?? "";
  }

  return "";
}

function formatExportTag(tag: ExportFileRecord["tags"][number]): string {
  return tag.namespace ? `${tag.namespace}:${tag.name}` : tag.name;
}

function appendOriginalExtension(
  fileName: string,
  file: ExportFileRecord,
): string {
  const extension = normalizeExtension(file.extension);

  if (!extension || fileName.toLowerCase().endsWith(extension.toLowerCase())) {
    return fileName;
  }

  return `${fileName}${extension}`;
}

function appendTextExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(".txt") ? fileName : `${fileName}.txt`;
}

function renderTagText(file: ExportFileRecord): string {
  return file.tags.map(formatExportTag).join(",");
}

function normalizeExtension(extension: string | null): string {
  if (!extension) {
    return "";
  }

  return extension.startsWith(".") ? extension : `.${extension}`;
}

async function ensureUniqueFileName(
  directory: string,
  fileName: string,
  usedNames: Set<string>,
): Promise<string> {
  const extension = extname(fileName);
  const name = extension ? basename(fileName, extension) : fileName;
  let candidate = fileName;
  let suffix = 1;

  while (
    usedNames.has(candidate.toLowerCase()) ||
    (await pathExists(join(directory, candidate)))
  ) {
    candidate = `${name}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function createExportProgress(
  jobId: string,
  phase: ExportProgress["phase"],
  total: number,
  processed: number,
  exported: number,
  failed: number,
  currentFile: string | null,
  message: string,
  messageKey?: string,
  messageValues?: Record<string, string | number>,
): ExportProgress {
  return {
    jobId,
    phase,
    total,
    processed,
    exported,
    failed,
    currentFile,
    message,
    ...(messageKey ? { messageKey } : {}),
    ...(messageValues ? { messageValues } : {}),
  };
}

function emitExportProgress(
  sender: WebContents,
  progress: ExportProgress,
): void {
  if (!sender.isDestroyed()) {
    sender.send(IpcEvent.EXPORT_PROGRESS, progress);
  }
}
