import { useEffect, useMemo, useState } from "react";
import type {
  EHentaiGalleryStatus,
  EHentaiImportOptions,
  EHentaiImportProgress,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";
import { useLanguage } from "../utils/language";
const importShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-(--bg) text-(--ink)";
const sidebarClass =
  "grid auto-rows-min gap-2 min-h-0 min-w-0 border-r border-(--line) bg-(--panel) p-2";
const fieldClass =
  "grid gap-1.5 text-[11px] text-(--muted) [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-media-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>textarea]:min-w-0 [&>textarea]:resize-none [&>textarea]:border [&>textarea]:border-(--line-strong) [&>textarea]:bg-(--surface-media-bg) [&>textarea]:p-1.5 [&>textarea]:text-(--ink) [&>small]:text-[10px] [&>small]:leading-[14px] [&>small]:text-(--disabled-strong-ink)";
const checkClass =
  "grid grid-cols-[14px_1fr] items-center gap-1.5 text-[11px] text-(--ink)";
const contentClass =
  "grid min-h-0 min-w-0 grid-rows-[auto_auto_auto_auto_auto_minmax(0,1fr)] gap-2 overflow-hidden p-2";
const toolbarClass = "flex h-6 items-center gap-1.5";
const buttonClass =
  "h-6 cursor-default border border-(--line-strong) bg-(--surface-raised-bg) px-2 text-[11px] text-(--ink)";
const progressClass =
  "grid h-5 grid-cols-[minmax(0,1fr)_42px] items-center gap-1.5";
const statsClass =
  "grid grid-cols-[repeat(6,minmax(54px,1fr))] gap-1 text-[11px]";
const statClass =
  "grid h-6 grid-cols-[44px_minmax(0,1fr)] border border-(--line)";
const statLabelClass =
  "truncate border-r border-(--line) px-1.5 leading-5 text-(--muted)";
const statValueClass = "truncate px-1.5 leading-5";
const panelClass =
  "grid min-h-0 min-w-0 overflow-hidden border border-(--line)";
const panelHeaderClass =
  "h-6 border-b border-(--line) bg-(--surface-raised-bg) px-1.5 leading-6";
const statusClass = "grid grid-cols-4 gap-0 text-(--muted)";
const debugClass =
  "grid min-h-0 min-w-0 grid-rows-[24px_minmax(0,1fr)] border border-(--line) overflow-hidden";
const debugHeaderClass =
  "grid grid-cols-[minmax(0,1fr)_48px] border-b border-(--line) bg-(--surface-raised-bg) px-1.5";
const debugListClass = "min-h-0 overflow-auto bg-(--surface-deep-bg)";

export function EHentaiImportWindow(): JSX.Element {
  const { t } = useLanguage();
  const idleProgress = useMemo(
    () => createIdleProgress(t("window.ehentai.loading")),
    [t],
  );
  const [galleryUrl, setGalleryUrl] = useState("");
  const [cookie, setCookie] = useState("");
  const [importGalleryTags, setImportGalleryTags] = useState(true);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(45000);
  const [startIndex, setStartIndex] = useState(1);
  const [limit, setLimit] = useState(0);
  const [status, setStatus] = useState<EHentaiGalleryStatus | null>(null);
  const [progress, setProgress] = useState<EHentaiImportProgress>(() =>
    createIdleProgress(t("window.ehentai.loading")),
  );
  const [logs, setLogs] = useState<string[]>(() => [t("window.ehentai.waiting")]);
  const importing =
    progress.phase === "testing" ||
    progress.phase === "collecting" ||
    progress.phase === "importing";
  const percent = useMemo(() => {
    if (progress.total === 0) {
      return 0;
    }

    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress.processed, progress.total]);

  useEffect(() => {
    if (!window.asteria) {
      appendLog(t("window.ehentai.preloadUnavailable"));
      return undefined;
    }

    void loadSettings();

    return window.asteria.onEHentaiImportProgress((nextProgress) => {
      if (shouldLogProgress(nextProgress)) {
        appendLog(
          `${nextProgress.phase} ${nextProgress.processed}/${nextProgress.total} ${nextProgress.message}`,
        );
      }

      setProgress(nextProgress);
    });
  }, [t]);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings = await window.asteria.getEHentaiImportSettings();
    applySettings(settings);
    appendLog(t("window.ehentai.loaded"));
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings =
      await window.asteria.updateEHentaiImportSettings(createOptions());
    applySettings(settings);
    appendLog(t("window.ehentai.saved"));
  }

  async function testGallery(): Promise<void> {
    if (importing) {
      return;
    }

    if (!window.asteria) {
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: t("window.ehentai.apiUnavailable"),
      });
      return;
    }

    await saveSettings();
    setStatus(null);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: t("window.ehentai.detectingGalleryLink"),
    });
    appendLog(t("window.ehentai.testGallery"));

    try {
      const nextStatus =
        await window.asteria.testEHentaiGallery(createOptions());
      setStatus(nextStatus);
      setProgress({
        ...idleProgress,
        phase: nextStatus.ok ? "completed" : "failed",
        message: nextStatus.message,
      });
      appendLog(
        t(
          nextStatus.ok
            ? "window.ehentai.detectSuccess"
            : "window.ehentai.detectFailed",
          { message: nextStatus.message },
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("window.ehentai.importFailed");
      setStatus({ ok: false, message, galleryTitle: "", imageCount: 0 });
      setProgress({ ...idleProgress, phase: "failed", message });
      appendLog(t("window.ehentai.detectException", { message }));
    }
  }

  async function startImport(): Promise<void> {
    if (importing) {
      return;
    }

    if (!window.asteria) {
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: t("window.ehentai.apiUnavailable"),
      });
      return;
    }

    await saveSettings();
    setStatus(null);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: t("window.ehentai.preparingImport"),
    });
    appendLog(
      `${t("window.ehentai.preparingImport")}: start=${startIndex} limit=${
        limit || "unlimited"
      } cooldown=10000ms timeout=${requestTimeoutMs}ms`,
    );

    try {
      const result = await window.asteria.importFromEHentai(createOptions());
      setProgress(result);
      appendLog(
        t("window.ehentai.importSummary", {
          imported: result.imported,
          duplicated: result.duplicated,
          failed: result.failed,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("window.ehentai.importFailed");
      setProgress({ ...idleProgress, phase: "failed", message });
      appendLog(t("window.ehentai.importException", { message }));
    }
  }

  async function cancelImport(): Promise<void> {
    appendLog(t("window.ehentai.cancelImport"));
    await window.asteria?.cancelEHentaiImport();
  }

  function createOptions(): EHentaiImportOptions {
    return {
      galleryUrl,
      cookie,
      importGalleryTags,
      forceDuplicate,
      requestDelayMs: 10000,
      requestTimeoutMs,
      startIndex,
      limit,
    };
  }

  function applySettings(settings: EHentaiImportOptions): void {
    setGalleryUrl(settings.galleryUrl);
    setCookie(settings.cookie);
    setImportGalleryTags(settings.importGalleryTags);
    setForceDuplicate(settings.forceDuplicate);
    setRequestTimeoutMs(settings.requestTimeoutMs);
    setStartIndex(settings.startIndex);
    setLimit(settings.limit);
  }

  function appendLog(line: string): void {
    setLogs((currentLogs) => [
      ...currentLogs.slice(-120),
      `${new Date().toLocaleTimeString()} ${line}`,
    ]);
  }

  return (
    <ResizableColumns
      className={importShellClass}
      defaultLeftWidth={280}
      minLeftWidth={220}
      minRightWidth={420}
      storageKey="asteria:ehentai-import-sidebar-width"
      left={
        <aside className={sidebarClass}>
          <label className={fieldClass}>
            <span>{t("window.ehentai.galleryUrl")}</span>
            <textarea
              aria-label={t("window.ehentai.galleryUrl")}
              className="h-[46px]"
              placeholder={t("window.ehentai.galleryUrlPlaceholder")}
              value={galleryUrl}
              onChange={(event) => setGalleryUrl(event.target.value)}
            />
          </label>
          <label className={fieldClass}>
            <span>{t("window.ehentai.cookie")}</span>
            <textarea
              aria-label={t("window.ehentai.cookie")}
              className="h-28"
              placeholder={t("window.ehentai.cookiePlaceholder")}
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
            />
          </label>
          <label className={checkClass}>
            <input
              checked={importGalleryTags}
              type="checkbox"
              onChange={(event) => setImportGalleryTags(event.target.checked)}
            />
            <span>{t("window.ehentai.importGalleryTags")}</span>
          </label>
          <label className={checkClass}>
            <input
              checked={forceDuplicate}
              type="checkbox"
              onChange={(event) => setForceDuplicate(event.target.checked)}
            />
            <span>{t("window.ehentai.duplicateAsNewObject")}</span>
          </label>
          <label className={fieldClass}>
            <span>{t("window.ehentai.startIndex")}</span>
            <input
              aria-label={t("window.ehentai.startIndex")}
              min={1}
              type="number"
              value={startIndex}
              onChange={(event) => setStartIndex(Number(event.target.value))}
            />
            <small>{t("window.ehentai.startIndexHint")}</small>
          </label>
          <label className={fieldClass}>
            <span>{t("window.ehentai.limit")}</span>
            <input
              aria-label={t("window.ehentai.limit")}
              min={0}
              placeholder={t("window.ehentai.limitPlaceholder")}
              type="number"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
            <small>{t("window.ehentai.limitHint")}</small>
          </label>
          <label className={fieldClass}>
            <span>{t("window.ehentai.requestTimeout")}</span>
            <input
              aria-label={t("window.ehentai.requestTimeout")}
              min={1000}
              type="number"
              value={requestTimeoutMs}
              onChange={(event) =>
                setRequestTimeoutMs(Number(event.target.value))
              }
            />
          </label>
        </aside>
      }
      right={
        <main className={contentClass}>
          <div className={toolbarClass}>
            <ActionFeedbackButton label={t("common.save")} onAction={saveSettings} />
            <button
              className={buttonClass}
              disabled={importing}
              type="button"
              onClick={() => void testGallery()}
            >
              {t("window.ehentai.testGallery")}
            </button>
            <button
              className={buttonClass}
              disabled={importing}
              type="button"
              onClick={() => void startImport()}
            >
              {t("window.ehentai.startImport")}
            </button>
            <button
              className={buttonClass}
              disabled={!importing}
              type="button"
              onClick={() => void cancelImport()}
            >
              {t("window.ehentai.cancelImport")}
            </button>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
              {progress.message}
            </span>
          </div>

          <div className={progressClass}>
            <progress max={100} value={percent} />
            <span className="text-right text-(--muted)">{percent}%</span>
          </div>

          <dl className={statsClass}>
            <div className={statClass}>
              <dt className={statLabelClass}>{t("window.ehentai.total")}</dt>
              <dd className={statValueClass}>{progress.total}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>{t("window.ehentai.processed")}</dt>
              <dd className={statValueClass}>{progress.processed}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>{t("window.ehentai.added")}</dt>
              <dd className={statValueClass}>{progress.imported}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>{t("window.ehentai.duplicated")}</dt>
              <dd className={statValueClass}>{progress.duplicated}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>{t("window.ehentai.skipped")}</dt>
              <dd className={statValueClass}>{progress.skipped}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>{t("window.ehentai.failed")}</dt>
              <dd className={statValueClass}>{progress.failed}</dd>
            </div>
            <div className={`${statClass} col-span-6`}>
              <dt className={statLabelClass}>{t("window.ehentai.current")}</dt>
              <dd className={statValueClass}>{progress.currentFile ?? "-"}</dd>
            </div>
          </dl>

          <section className={panelClass}>
            <header className={panelHeaderClass}>
              {t("window.ehentai.galleryStatus")}
            </header>
            {status ? (
              <div
                className={`${statusClass} ${status.ok ? "text-(--success-ink)" : ""}`}
              >
                <span>{status.message}</span>
                <span title={status.galleryTitle}>
                  {status.galleryTitle || "-"}
                </span>
                <span>{t("window.ehentai.imageCount", { count: status.imageCount })}</span>
                <span>{t("window.ehentai.style")}</span>
              </div>
            ) : (
              <div className={statusClass}>{t("window.ehentai.notDetected")}</div>
            )}
          </section>

          <section className={panelClass}>
            <header className={panelHeaderClass}>
              {t("window.ehentai.importRules")}
            </header>
            <div className="p-1.5 leading-[18px] text-(--muted)">
              {t("window.ehentai.ruleDescription")}
            </div>
          </section>

          <section className={debugClass}>
            <header className={debugHeaderClass}>
              <span>{t("window.ehentai.logs")}</span>
              <button
                className={buttonClass}
                type="button"
                onClick={() => setLogs([])}
              >
                {t("window.ehentai.clear")}
              </button>
            </header>
            <div className={debugListClass}>
              {logs.length > 0 ? (
                logs.map((line, index) => (
                  <div
                    className="min-h-5 border-b border-(--splitter-hover-bg) px-1.5 leading-5 text-(--muted)"
                    key={`${index}:${line}`}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div className="px-1.5 text-(--muted)">
                  {t("window.ehentai.noLogs")}
                </div>
              )}
            </div>
          </section>
        </main>
      }
    />
  );
}

function shouldLogProgress(progress: EHentaiImportProgress): boolean {
  if (
    progress.phase === "failed" ||
    progress.phase === "canceled" ||
    progress.phase === "completed"
  ) {
    return true;
  }

  if (progress.phase !== "importing") {
    return progress.message.length > 0;
  }

  return (
    isDebugLinkProgress(progress.message) ||
    progress.processed % 10 === 0
  );
}

function isDebugLinkProgress(message: string): boolean {
  return message.startsWith("link:") || message.startsWith("url:");
}

function createIdleProgress(message: string): EHentaiImportProgress {
  return {
    phase: "idle",
    total: 0,
    processed: 0,
    imported: 0,
    duplicated: 0,
    skipped: 0,
    failed: 0,
    currentFile: null,
    message,
  };
}
