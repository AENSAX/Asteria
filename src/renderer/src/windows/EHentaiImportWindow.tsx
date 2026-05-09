import { useEffect, useMemo, useState } from "react";
import type {
  EHentaiGalleryStatus,
  EHentaiImportOptions,
  EHentaiImportProgress,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";

const idleProgress: EHentaiImportProgress = {
  phase: "idle",
  total: 0,
  processed: 0,
  imported: 0,
  duplicated: 0,
  skipped: 0,
  failed: 0,
  currentFile: null,
  message: "未开始",
};
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
  const [galleryUrl, setGalleryUrl] = useState("");
  const [cookie, setCookie] = useState("");
  const [importGalleryTags, setImportGalleryTags] = useState(true);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(45000);
  const [startIndex, setStartIndex] = useState(1);
  const [limit, setLimit] = useState(0);
  const [status, setStatus] = useState<EHentaiGalleryStatus | null>(null);
  const [progress, setProgress] = useState<EHentaiImportProgress>(idleProgress);
  const [logs, setLogs] = useState<string[]>(["等待操作"]);
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
      appendLog("preload 不可用，请重启应用");
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
  }, []);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings = await window.asteria.getEHentaiImportSettings();
    applySettings(settings);
    appendLog("配置已加载");
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings =
      await window.asteria.updateEHentaiImportSettings(createOptions());
    applySettings(settings);
    appendLog("配置已保存");
  }

  async function testGallery(): Promise<void> {
    if (importing) {
      return;
    }

    if (!window.asteria) {
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: "E-Hentai API 不可用，请重启应用",
      });
      return;
    }

    await saveSettings();
    setStatus(null);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: "检测 gallery 链接",
    });
    appendLog("点击检测链接");

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
        `${nextStatus.ok ? "检测成功" : "检测失败"}：${nextStatus.message}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "检测失败";
      setStatus({ ok: false, message, galleryTitle: "", imageCount: 0 });
      setProgress({ ...idleProgress, phase: "failed", message });
      appendLog(`检测异常：${message}`);
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
        message: "E-Hentai API 不可用，请重启应用",
      });
      return;
    }

    await saveSettings();
    setStatus(null);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: "准备 E-Hentai 导入",
    });
    appendLog(
      `开始导入：start=${startIndex} limit=${limit || "不限"} cooldown=10000ms timeout=${requestTimeoutMs}ms`,
    );

    try {
      const result = await window.asteria.importFromEHentai(createOptions());
      setProgress(result);
      appendLog(
        `导入结束：新增=${result.imported} 重复对象=${result.duplicated} 失败=${result.failed}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "E-Hentai 导入失败";
      setProgress({ ...idleProgress, phase: "failed", message });
      appendLog(`导入异常：${message}`);
    }
  }

  async function cancelImport(): Promise<void> {
    appendLog("点击取消导入");
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
            <span>Gallery 链接</span>
            <textarea
              aria-label="E-Hentai gallery 链接"
              className="h-[46px]"
              placeholder="输入 https://e-hentai.org/g/..."
              value={galleryUrl}
              onChange={(event) => setGalleryUrl(event.target.value)}
            />
          </label>
          <label className={fieldClass}>
            <span>Cookie</span>
            <textarea
              aria-label="E-Hentai cookie"
              className="h-28"
              placeholder="输入浏览器复制出的 Cookie"
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
            <span>导入 gallery 标签</span>
          </label>
          <label className={checkClass}>
            <input
              checked={forceDuplicate}
              type="checkbox"
              onChange={(event) => setForceDuplicate(event.target.checked)}
            />
            <span>重复文件创建新对象</span>
          </label>
          <label className={fieldClass}>
            <span>起始序号</span>
            <input
              aria-label="起始序号"
              min={1}
              type="number"
              value={startIndex}
              onChange={(event) => setStartIndex(Number(event.target.value))}
            />
            <small>
              从 gallery 第几张开始，最小为 1；中断后可填下一张序号继续。
            </small>
          </label>
          <label className={fieldClass}>
            <span>数量限制</span>
            <input
              aria-label="数量限制"
              min={0}
              placeholder="0 表示不限"
              type="number"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
            <small>本次最多导入多少张，0 表示从起始序号开始直到结尾。</small>
          </label>
          <label className={fieldClass}>
            <span>请求超时 ms</span>
            <input
              aria-label="请求超时"
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
            <ActionFeedbackButton label="保存" onAction={saveSettings} />
            <button
              className={buttonClass}
              disabled={importing}
              type="button"
              onClick={() => void testGallery()}
            >
              检测链接
            </button>
            <button
              className={buttonClass}
              disabled={importing}
              type="button"
              onClick={() => void startImport()}
            >
              开始导入
            </button>
            <button
              className={buttonClass}
              disabled={!importing}
              type="button"
              onClick={() => void cancelImport()}
            >
              取消
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
              <dt className={statLabelClass}>总数</dt>
              <dd className={statValueClass}>{progress.total}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>已处理</dt>
              <dd className={statValueClass}>{progress.processed}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>新增</dt>
              <dd className={statValueClass}>{progress.imported}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>重复对象</dt>
              <dd className={statValueClass}>{progress.duplicated}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>跳过</dt>
              <dd className={statValueClass}>{progress.skipped}</dd>
            </div>
            <div className={statClass}>
              <dt className={statLabelClass}>失败</dt>
              <dd className={statValueClass}>{progress.failed}</dd>
            </div>
            <div className={`${statClass} col-span-6`}>
              <dt className={statLabelClass}>当前</dt>
              <dd className={statValueClass}>{progress.currentFile ?? "-"}</dd>
            </div>
          </dl>

          <section className={panelClass}>
            <header className={panelHeaderClass}>Gallery 状态</header>
            {status ? (
              <div
                className={`${statusClass} ${status.ok ? "text-(--success-ink)" : ""}`}
              >
                <span>{status.message}</span>
                <span title={status.galleryTitle}>
                  {status.galleryTitle || "-"}
                </span>
                <span>首页: {status.imageCount}</span>
                <span>风格: e-hentai</span>
              </div>
            ) : (
              <div className={statusClass}>未检测</div>
            )}
          </section>

          <section className={panelClass}>
            <header className={panelHeaderClass}>导入规则</header>
            <div className="p-1.5 leading-[18px] text-(--muted)">
              默认写入 e-hentai 风格标签 gallery:gallery名字；勾选导入 gallery
              标签后，会同时写入页面中的标签。重复文件默认跳过，勾选重复文件创建新对象后会复用物理文件。请求冷却固定为
              10000ms。
            </div>
          </section>

          <section className={debugClass}>
            <header className={debugHeaderClass}>
              <span>日志</span>
              <button
                className={buttonClass}
                type="button"
                onClick={() => setLogs([])}
              >
                清空
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
                <div className="px-1.5 text-(--muted)">没有日志</div>
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
    progress.message.includes("失败") ||
    progress.processed % 10 === 0
  );
}

function isDebugLinkProgress(message: string): boolean {
  return message.includes("链接：");
}
