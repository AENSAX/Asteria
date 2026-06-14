import { useEffect, useMemo, useRef, useState } from "react";
import type { ExportProgress } from "../../../shared/ipc";
import {
  useLanguage,
  type TranslationFunction,
  type TranslationKey,
} from "../utils/language";
import { getButtonClassName } from "../components/Button";

interface ExportWindowProps {
  fileIds: number[];
}

interface FormatSegment {
  kind: "text" | "variable";
  value: string;
  valid: boolean;
}

const defaultFilenameFormat = "{index}-{hash}";
const defaultTagTextFilenameFormat = "{index}-{hash}";
const exportRootClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_32px] bg-(--panel) text-[12px] text-(--ink)";
const exportConfigClass =
  "grid gap-1.5 border-b border-(--line) bg-(--surface-bg) p-2";
const exportRowClass =
  "grid grid-cols-[72px_minmax(0,1fr)_32px] items-center gap-1.5";
const exportCheckRowClass =
  "grid min-h-6 grid-cols-[16px_minmax(0,1fr)] items-center gap-1.5";
const exportInputClass =
  "ui-input";
const exportButtonClass = getButtonClassName({ size: "medium" });
const exportPathButtonClass = getButtonClassName({
  size: "compact",
  className: "w-8 min-w-0 px-0 text-center text-[13px] leading-none",
});
const exportPreviewClass =
  "flex min-h-6 flex-wrap items-center gap-1 border border-(--line) bg-(--surface-inset-bg) p-1";
const exportTokenClass =
  "border border-(--line-strong) bg-(--tag-bg) px-1.5 leading-[18px]";
const exportTokenInvalidClass = "border-(--danger) text-(--danger-ink)";
const exportProgressClass = "grid gap-1.5 border-b border-(--line) p-2";
const exportFooterClass =
  "flex items-center justify-end gap-1.5 border-t border-(--line) bg-(--surface-bg) px-2";

function createIdleProgress(
  jobId: string,
  total: number,
  t: TranslationFunction,
): ExportProgress {
  return {
    jobId,
    phase: "idle",
    total,
    processed: 0,
    exported: 0,
    failed: 0,
    currentFile: null,
    message: t("window.export.waiting"),
    messageKey: "window.export.waiting",
  };
}

export function ExportWindow({ fileIds }: ExportWindowProps): JSX.Element {
  const { languageId, t } = useLanguage();
  const normalizedFileIds = useMemo(
    () => [...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0))],
    [fileIds],
  );
  const [directory, setDirectory] = useState("");
  const [filenameFormat, setFilenameFormat] = useState(defaultFilenameFormat);
  const [exportTagText, setExportTagText] = useState(false);
  const [tagTextDirectory, setTagTextDirectory] = useState("");
  const [tagTextFilenameFormat, setTagTextFilenameFormat] = useState(
    defaultTagTextFilenameFormat,
  );
  const [jobId, setJobId] = useState(() => createExportJobId());
  const jobIdRef = useRef(jobId);
  const [progress, setProgress] = useState(() =>
    createIdleProgress(jobId, normalizedFileIds.length, t),
  );
  const formatSegments = useMemo(
    () => parseFormatSegments(filenameFormat),
    [filenameFormat],
  );
  const tagTextFormatSegments = useMemo(
    () => parseFormatSegments(tagTextFilenameFormat),
    [tagTextFilenameFormat],
  );
  const formatValid = formatSegments.every(
    (segment) => segment.kind === "text" || segment.valid,
  );
  const tagTextFormatValid = tagTextFormatSegments.every(
    (segment) => segment.kind === "text" || segment.valid,
  );
  const exporting = progress.phase === "exporting";
  const exportReady = Boolean(
    normalizedFileIds.length > 0 &&
    directory.trim() &&
    formatValid &&
    (!exportTagText || (tagTextDirectory.trim() && tagTextFormatValid)),
  );
  const percent =
    progress.total > 0
      ? Math.floor((progress.processed / progress.total) * 100)
      : 0;

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    setProgress((currentProgress) =>
      currentProgress.phase === "idle"
        ? createIdleProgress(jobIdRef.current, normalizedFileIds.length, t)
        : currentProgress,
    );
  }, [languageId, normalizedFileIds.length, t]);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onExportProgress((nextProgress) => {
      if (nextProgress.jobId === jobIdRef.current) {
        setProgress(nextProgress);
      }
    });
  }, []);

  async function browseDirectory(): Promise<void> {
    const nextDirectory = await window.asteria?.selectExportDirectory();

    if (nextDirectory) {
      setDirectory(nextDirectory);
    }
  }

  async function browseTagTextDirectory(): Promise<void> {
    const nextDirectory = await window.asteria?.selectExportDirectory();

    if (nextDirectory) {
      setTagTextDirectory(nextDirectory);
    }
  }

  async function startExport(): Promise<void> {
    if (!window.asteria || exporting || !exportReady) {
      return;
    }

    const nextJobId = createExportJobId();
    jobIdRef.current = nextJobId;
    setJobId(nextJobId);
    setProgress(createIdleProgress(nextJobId, normalizedFileIds.length, t));

    try {
      const result = await window.asteria.exportFiles({
        jobId: nextJobId,
        fileIds: normalizedFileIds,
        directory,
        filenameFormat,
        exportTagText,
        tagTextDirectory,
        tagTextFilenameFormat,
      });
      setProgress(result);
    } catch (error) {
      setProgress({
        jobId: nextJobId,
        phase: "failed",
        total: normalizedFileIds.length,
        processed: 0,
        exported: 0,
        failed: 0,
        currentFile: null,
        message:
          error instanceof Error ? error.message : t("window.export.failed"),
      });
    }
  }

  async function cancelExport(): Promise<void> {
    if (!exporting) {
      window.close();
      return;
    }

    await window.asteria?.cancelExport(jobId);
  }

  return (
    <section className={exportRootClass}>
      <div className={exportConfigClass}>
        <div className={exportRowClass}>
          <span>{t("window.export.file")}</span>
          <span>{normalizedFileIds.length}</span>
        </div>

        <label className={exportRowClass}>
          <span>{t("window.export.path")}</span>
          <input
            className={exportInputClass}
            disabled={exporting}
            placeholder={t("window.export.inputPath")}
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
          />
          <button
            aria-label={t("window.export.selectPath")}
            className={exportPathButtonClass}
            disabled={exporting}
            type="button"
            onClick={() => void browseDirectory()}
          >
            ...
          </button>
        </label>

        <label className={`${exportRowClass} grid-cols-[72px_minmax(0,1fr)]`}>
          <span>{t("window.export.filename")}</span>
          <input
            className={exportInputClass}
            disabled={exporting}
            placeholder={t("window.export.inputFormat")}
            value={filenameFormat}
            onChange={(event) => setFilenameFormat(event.target.value)}
          />
        </label>

        <div className={exportPreviewClass}>
          {formatSegments.length > 0 ? (
            formatSegments.map((segment, index) =>
              segment.kind === "variable" ? (
                <span
                  className={
                    segment.valid
                      ? exportTokenClass
                      : `${exportTokenClass} ${exportTokenInvalidClass}`
                  }
                  key={`${segment.value}-${index}`}
                >
                  {segment.value}
                </span>
              ) : (
                <span
                  className="text-(--muted)"
                  key={`${segment.value}-${index}`}
                >
                  {segment.value}
                </span>
              ),
            )
          ) : (
            <span className="text-(--muted)">
              {t("window.export.noFormat")}
            </span>
          )}
        </div>

        <label className={exportCheckRowClass}>
          <input
            checked={exportTagText}
            disabled={exporting}
            type="checkbox"
            onChange={(event) => setExportTagText(event.target.checked)}
          />
          <span>{t("window.export.tagText")}</span>
        </label>

        {exportTagText ? (
          <>
            <label className={exportRowClass}>
              <span>{t("window.export.tagTextPath")}</span>
              <input
                className={exportInputClass}
                disabled={exporting}
                placeholder={t("window.export.inputTagTextPath")}
                value={tagTextDirectory}
                onChange={(event) => setTagTextDirectory(event.target.value)}
              />
              <button
                aria-label={t("window.export.selectTagTextPath")}
                className={exportPathButtonClass}
                disabled={exporting}
                type="button"
                onClick={() => void browseTagTextDirectory()}
              >
                ...
              </button>
            </label>

            <label
              className={`${exportRowClass} grid-cols-[72px_minmax(0,1fr)]`}
            >
              <span>{t("window.export.tagTextFilename")}</span>
              <input
                className={exportInputClass}
                disabled={exporting}
                placeholder={t("window.export.inputTagTextFormat")}
                value={tagTextFilenameFormat}
                onChange={(event) =>
                  setTagTextFilenameFormat(event.target.value)
                }
              />
            </label>

            <div className={exportPreviewClass}>
              {tagTextFormatSegments.length > 0 ? (
                tagTextFormatSegments.map((segment, index) =>
                  segment.kind === "variable" ? (
                    <span
                      className={
                        segment.valid
                          ? exportTokenClass
                          : `${exportTokenClass} ${exportTokenInvalidClass}`
                      }
                      key={`${segment.value}-${index}`}
                    >
                      {segment.value}
                    </span>
                  ) : (
                    <span
                      className="text-(--muted)"
                      key={`${segment.value}-${index}`}
                    >
                      {segment.value}
                    </span>
                  ),
                )
              ) : (
                <span className="text-(--muted)">
                  {t("window.export.noFormat")}
                </span>
              )}
            </div>
          </>
        ) : null}
      </div>

      <div className={exportProgressClass}>
        <div className="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2">
          <progress max={100} value={percent} />
          <span className="text-right text-(--muted)">{percent}%</span>
        </div>
        <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 text-(--muted)">
          <span>
            {progress.processed} / {progress.total}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {formatExportProgressMessage(progress, t)}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {progress.currentFile ?? ""}
          </span>
        </div>
      </div>

      <footer className={exportFooterClass}>
        <button
          className={exportButtonClass}
          type="button"
          onClick={() => void cancelExport()}
        >
          {exporting ? t("common.cancel") : t("common.close")}
        </button>
        <button
          className={exportButtonClass}
          disabled={exporting || !exportReady}
          type="button"
          onClick={() => void startExport()}
        >
          {t("common.export")}
        </button>
      </footer>
    </section>
  );
}

function formatExportProgressMessage(
  progress: ExportProgress,
  t: TranslationFunction,
): string {
  if (progress.messageKey) {
    return t(progress.messageKey as TranslationKey, progress.messageValues);
  }

  return progress.message;
}

function createExportJobId(): string {
  return `export-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function parseFormatSegments(format: string): FormatSegment[] {
  const segments: FormatSegment[] = [];
  const pattern = /\{([^{}]*)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(format)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "text",
        value: format.slice(lastIndex, match.index),
        valid: true,
      });
    }

    const value = match[1]?.trim() ?? "";
    segments.push({
      kind: "variable",
      value,
      valid: isValidExportVariable(value),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < format.length) {
    segments.push({
      kind: "text",
      value: format.slice(lastIndex),
      valid: true,
    });
  }

  return segments;
}

function isValidExportVariable(variable: string): boolean {
  return (
    variable === "index" ||
    variable === "time" ||
    variable === "hash" ||
    variable === "tag" ||
    /^namespace:.+/.test(variable) ||
    /^rating:.+/.test(variable)
  );
}
