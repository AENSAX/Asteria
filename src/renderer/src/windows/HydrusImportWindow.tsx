import { useEffect, useMemo, useState } from "react";
import type {
  HydrusConnectionStatus,
  HydrusImportOptions,
  HydrusImportProgress,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";
import { useLanguage } from "../utils/language";

const hydrusShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-(--bg) text-(--ink)";
const hydrusSidebarClass =
  "grid auto-rows-min gap-2 min-h-0 min-w-0 border-r border-(--line) bg-(--panel) p-2";
const hydrusFieldClass =
  "grid gap-1.5 text-[11px] text-(--muted) [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-media-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>textarea]:min-h-[84px] [&>textarea]:min-w-0 [&>textarea]:resize-none [&>textarea]:border [&>textarea]:border-(--line-strong) [&>textarea]:bg-(--surface-media-bg) [&>textarea]:p-1.5 [&>textarea]:text-(--ink)";
const hydrusCheckClass =
  "grid grid-cols-[14px_1fr] items-center gap-1.5 text-[11px] text-(--ink)";
const hydrusContentClass =
  "grid min-h-0 min-w-0 grid-rows-[auto_auto_auto_auto_auto_minmax(0,1fr)] gap-2 overflow-hidden p-2";
const hydrusToolbarClass = "flex h-6 items-center gap-1.5";
const hydrusButtonClass =
  "ui-button";
const hydrusProgressClass =
  "grid h-5 grid-cols-[minmax(0,1fr)_42px] items-center gap-1.5";
const hydrusStatsClass =
  "grid grid-cols-[repeat(6,minmax(54px,1fr))] gap-1 text-[11px]";
const hydrusStatClass =
  "grid h-6 grid-cols-[44px_minmax(0,1fr)] border border-(--line)";
const hydrusStatLabelClass =
  "truncate border-r border-(--line) px-1.5 leading-5 text-(--muted)";
const hydrusStatValueClass = "truncate px-1.5 leading-5";
const hydrusWideStatClass = "col-span-6";
const hydrusPanelClass =
  "grid min-h-0 min-w-0 overflow-hidden border border-(--line)";
const hydrusPanelHeaderClass =
  "h-6 border-b border-(--line) bg-(--surface-raised-bg) px-1.5 leading-6";
const hydrusStatusClass = "grid grid-cols-4 gap-0 text-(--muted)";
const hydrusStatusOkClass = "text-(--success-ink)";
const hydrusDebugClass =
  "grid min-h-0 min-w-0 grid-rows-[24px_minmax(0,1fr)] border border-(--line) overflow-hidden";
const hydrusDebugHeaderClass =
  "grid grid-cols-[minmax(0,1fr)_48px] border-b border-(--line) bg-(--surface-raised-bg) px-1.5";
const hydrusDebugListClass = "min-h-0 overflow-auto bg-(--surface-deep-bg)";

export function HydrusImportWindow(): JSX.Element {
  const { t } = useLanguage();
  const idleProgress = useMemo(
    () => createIdleProgress(t("window.hydrus.loading")),
    [t],
  );
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:45869");
  const [accessKey, setAccessKey] = useState("");
  const [searchText, setSearchText] = useState("");
  const [tagStyleName, setTagStyleName] = useState("hydrus");
  const [limit, setLimit] = useState(0);
  const [metadataBatchSize, setMetadataBatchSize] = useState(100);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [status, setStatus] = useState<HydrusConnectionStatus | null>(null);
  const [progress, setProgress] = useState<HydrusImportProgress>(() =>
    createIdleProgress(t("window.hydrus.loading")),
  );
  const [debugLines, setDebugLines] = useState<string[]>(() => [
    t("window.hydrus.waiting"),
  ]);
  const importing =
    progress.phase === "testing" ||
    progress.phase === "searching" ||
    progress.phase === "metadata" ||
    progress.phase === "importing";

  const percent = useMemo(() => {
    if (progress.total === 0) {
      return 0;
    }

    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress.processed, progress.total]);

  useEffect(() => {
    if (!window.asteria) {
      appendDebug(t("window.hydrus.preloadUnavailable"));
      return undefined;
    }

    appendDebug(t("window.hydrus.preloadAvailable"));
    void loadSettings();

    return window.asteria.onHydrusImportProgress((nextProgress) => {
      if (shouldLogProgress(nextProgress)) {
        appendDebug(
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

    const settings = await window.asteria.getHydrusImportSettings();
    applySettings(settings);
    appendDebug(t("window.hydrus.loaded"));
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings =
      await window.asteria.updateHydrusImportSettings(createOptions());
    applySettings(settings);
    appendDebug(t("window.hydrus.saved"));
  }

  async function testConnection(): Promise<void> {
    if (importing) {
      appendDebug(t("window.hydrus.testConnectionIgnored"));
      return;
    }

    if (
      !window.asteria ||
      typeof window.asteria.testHydrusConnection !== "function"
    ) {
      const failedStatus = createConnectionStatus(
        false,
        t("window.hydrus.apiUnavailable"),
      );
      setStatus(failedStatus);
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: failedStatus.message,
      });
      return;
    }

    await saveSettings();
    appendDebug(t("window.hydrus.testConnection"));
    appendDebug(`baseUrl=${baseUrl}`);
    appendDebug(`accessKeyLength=${accessKey.trim().length}`);
    const testingStatus = createConnectionStatus(
      false,
      t("window.hydrus.testingConnection"),
    );
    setStatus(testingStatus);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: t("window.hydrus.testConnection"),
    });

    try {
      appendDebug("invoke hydrus:test-connection");
      const nextStatus =
        await window.asteria.testHydrusConnection(createOptions());
      appendDebug(
        t(
          nextStatus.ok
            ? "window.hydrus.connectionSucceeded"
            : "window.hydrus.connectionFailed",
          { message: nextStatus.message },
        ),
      );

      if (!nextStatus.ok) {
        appendDebugLines(nextStatus.debug);
      }

      setStatus(nextStatus);
      setProgress({
        ...idleProgress,
        phase: nextStatus.ok ? "completed" : "failed",
        message: nextStatus.message,
      });
    } catch (error) {
      appendDebug(
        `test exception=${error instanceof Error ? error.message : "unknown"}`,
      );
      const failedStatus = createConnectionStatus(
        false,
        error instanceof Error
          ? error.message
          : t("window.hydrus.testConnectionFailed"),
      );
      setStatus(failedStatus);
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: failedStatus.message,
      });
    }
  }

  async function startImport(): Promise<void> {
    if (importing) {
      appendDebug(t("window.hydrus.startImportIgnored"));
      return;
    }

    if (
      !window.asteria ||
      typeof window.asteria.importFromHydrus !== "function"
    ) {
      appendDebug(t("window.hydrus.importMissing"));
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: t("window.hydrus.apiUnavailable"),
      });
      return;
    }

    await saveSettings();
    appendDebug(t("window.hydrus.startImport"));
    appendDebug(
      `searchTags=${createOptions().searchTags.join(",") || "system:everything"}`,
    );
    setStatus(null);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: t("window.hydrus.preparingImport"),
    });

    try {
      appendDebug("invoke hydrus:import");
      const result = await window.asteria.importFromHydrus(createOptions());
      appendDebug(
        t("window.hydrus.importSummary", {
          imported: result.imported,
          duplicated: result.duplicated,
          skipped: result.skipped,
          failed: result.failed,
        }),
      );
      setProgress(result);
    } catch (error) {
      appendDebug(
        `import exception=${error instanceof Error ? error.message : "unknown"}`,
      );
      setProgress({
        ...idleProgress,
        phase: "failed",
        message:
          error instanceof Error ? error.message : t("window.hydrus.importFailed"),
      });
    }
  }

  async function cancelImport(): Promise<void> {
    appendDebug(t("window.hydrus.cancelImport"));
    await window.asteria?.cancelHydrusImport();
  }

  function appendDebug(line: string): void {
    setDebugLines((currentLines) => [
      ...currentLines.slice(-120),
      `${new Date().toLocaleTimeString()} ${line}`,
    ]);
  }

  function appendDebugLines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }

    setDebugLines((currentLines) => [
      ...currentLines.slice(-120),
      ...lines.map((line) => `${new Date().toLocaleTimeString()} ${line}`),
    ]);
  }

  function shouldLogProgress(nextProgress: HydrusImportProgress): boolean {
    if (nextProgress.phase === "metadata") {
      return true;
    }

    if (
      nextProgress.phase === "failed" ||
      nextProgress.phase === "canceled" ||
      nextProgress.phase === "completed"
    ) {
      return true;
    }

    if (nextProgress.phase !== "importing") {
      return false;
    }

    return nextProgress.processed % 10 === 0;
  }

  function createOptions(): HydrusImportOptions {
    const searchTags = searchText
      .split(/\r?\n|,/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    return {
      baseUrl,
      accessKey,
      searchTags,
      tagStyleName,
      limit,
      metadataBatchSize,
      forceDuplicate,
    };
  }

  function applySettings(settings: HydrusImportOptions): void {
    setBaseUrl(settings.baseUrl);
    setAccessKey(settings.accessKey);
    setSearchText(settings.searchTags.join("\n"));
    setTagStyleName(settings.tagStyleName);
    setLimit(settings.limit);
    setMetadataBatchSize(settings.metadataBatchSize);
    setForceDuplicate(settings.forceDuplicate);
  }

  return (
    <ResizableColumns
      className={hydrusShellClass}
      defaultLeftWidth={260}
      minLeftWidth={180}
      minRightWidth={420}
      storageKey="asteria:hydrus-import-sidebar-width"
      left={
        <aside className={hydrusSidebarClass}>
          <label className={hydrusFieldClass}>
            <span>{t("window.hydrus.address")}</span>
            <input
              aria-label={t("window.hydrus.address")}
              placeholder={t("window.hydrus.addressPlaceholder")}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>{t("window.hydrus.accessKey")}</span>
            <input
              aria-label="Hydrus Access Key"
              placeholder={t("window.hydrus.accessKeyPlaceholder")}
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>{t("window.hydrus.tagStyle")}</span>
            <input
              aria-label={t("window.hydrus.tagStyle")}
              placeholder={t("window.hydrus.tagStylePlaceholder")}
              value={tagStyleName}
              onChange={(event) => setTagStyleName(event.target.value)}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>{t("window.hydrus.limit")}</span>
            <input
              aria-label={t("window.hydrus.limit")}
              min={0}
              placeholder={t("window.hydrus.limitPlaceholder")}
              type="number"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>{t("window.hydrus.metadataBatchSize")}</span>
            <input
              aria-label={t("window.hydrus.metadataBatchSize")}
              min={1}
              placeholder={t("window.hydrus.metadataBatchSizePlaceholder")}
              type="number"
              value={metadataBatchSize}
              onChange={(event) =>
                setMetadataBatchSize(Number(event.target.value))
              }
            />
          </label>
          <label className={hydrusCheckClass}>
            <input
              checked={forceDuplicate}
              type="checkbox"
              onChange={(event) => setForceDuplicate(event.target.checked)}
            />
            <span>{t("window.hydrus.duplicateAsNewObject")}</span>
          </label>
        </aside>
      }
      right={
        <main className={hydrusContentClass}>
          <div className={hydrusToolbarClass}>
            <ActionFeedbackButton label={t("common.save")} onAction={saveSettings} />
            <button
              className={hydrusButtonClass}
              disabled={importing}
              type="button"
              onClick={() => void testConnection()}
            >
              {t("window.hydrus.testConnection")}
            </button>
            <button
              className={hydrusButtonClass}
              disabled={importing}
              type="button"
              onClick={() => void startImport()}
            >
              {t("window.hydrus.startImport")}
            </button>
            <button
              className={hydrusButtonClass}
              disabled={!importing}
              type="button"
              onClick={() => void cancelImport()}
            >
              {t("window.hydrus.cancelImport")}
            </button>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
              {progress.message}
            </span>
          </div>

          <label className={hydrusFieldClass}>
            <span>{t("window.hydrus.searchTags")}</span>
            <textarea
              aria-label={t("window.hydrus.searchTags")}
              placeholder={t("window.hydrus.searchTagsPlaceholder")}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <div className={hydrusProgressClass}>
            <progress max={100} value={percent} />
            <span className="text-right text-(--muted)">{percent}%</span>
          </div>

          <dl className={hydrusStatsClass}>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.total")}</dt>
              <dd className={hydrusStatValueClass}>{progress.total}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.processed")}</dt>
              <dd className={hydrusStatValueClass}>{progress.processed}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.added")}</dt>
              <dd className={hydrusStatValueClass}>{progress.imported}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.duplicated")}</dt>
              <dd className={hydrusStatValueClass}>{progress.duplicated}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.skipped")}</dt>
              <dd className={hydrusStatValueClass}>{progress.skipped}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.failed")}</dt>
              <dd className={hydrusStatValueClass}>{progress.failed}</dd>
            </div>
            <div className={`${hydrusStatClass} ${hydrusWideStatClass}`}>
              <dt className={hydrusStatLabelClass}>{t("window.hydrus.current")}</dt>
              <dd className={hydrusStatValueClass}>
                {progress.currentFile ?? "-"}
              </dd>
            </div>
          </dl>

          <section className={hydrusPanelClass}>
            <header className={hydrusPanelHeaderClass}>
              {t("window.hydrus.connectionStatus")}
            </header>
            {status ? (
              <div
                className={`${hydrusStatusClass} ${status.ok ? hydrusStatusOkClass : ""}`}
              >
                <span>{status.message}</span>
                <span>Hydrus: {status.hydrusVersion ?? "-"}</span>
                <span>API: {status.apiVersion ?? "-"}</span>
                <span title={status.permissions}>
                  {t("window.hydrus.permissions")}: {status.permissions || "-"}
                </span>
              </div>
            ) : (
              <div className={hydrusStatusClass}>
                {t("window.hydrus.notTested")}
              </div>
            )}
          </section>

          <section className={hydrusDebugClass}>
            <header className={hydrusDebugHeaderClass}>
              <span>{t("window.hydrus.debug")}</span>
              <button
                className={hydrusButtonClass}
                type="button"
                onClick={() => setDebugLines([])}
              >
                {t("window.hydrus.clear")}
              </button>
            </header>
            <div className={hydrusDebugListClass}>
              {debugLines.length > 0 ? (
                debugLines.map((line, index) => (
                  <div
                    className="min-h-5 border-b border-(--splitter-hover-bg) px-1.5 leading-5 text-(--muted)"
                    key={`${index}:${line}`}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div className="px-1.5 text-(--muted)">
                  {t("window.hydrus.noDebugInfo")}
                </div>
              )}
            </div>
          </section>
        </main>
      }
    />
  );
}

function createIdleProgress(message: string): HydrusImportProgress {
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

function createConnectionStatus(
  ok: boolean,
  message: string,
): HydrusConnectionStatus {
  return {
    ok,
    message,
    hydrusVersion: null,
    apiVersion: null,
    permissions: "",
    debug: [],
  };
}
