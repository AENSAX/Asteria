import { useEffect, useMemo, useState } from "react";
import type {
  HydrusConnectionStatus,
  HydrusImportOptions,
  HydrusImportProgress,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";

const idleProgress: HydrusImportProgress = {
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
  "h-6 cursor-default border border-(--line-strong) bg-(--surface-raised-bg) px-2 text-[11px] text-(--ink)";
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
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:45869");
  const [accessKey, setAccessKey] = useState("");
  const [searchText, setSearchText] = useState("");
  const [tagStyleName, setTagStyleName] = useState("hydrus");
  const [limit, setLimit] = useState(0);
  const [metadataBatchSize, setMetadataBatchSize] = useState(100);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [status, setStatus] = useState<HydrusConnectionStatus | null>(null);
  const [progress, setProgress] = useState<HydrusImportProgress>(idleProgress);
  const [debugLines, setDebugLines] = useState<string[]>(["等待操作"]);
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
      appendDebug("preload 不可用，请重启应用");
      return undefined;
    }

    appendDebug("preload 可用");
    void loadSettings();

    return window.asteria.onHydrusImportProgress((nextProgress) => {
      if (shouldLogProgress(nextProgress)) {
        appendDebug(
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

    const settings = await window.asteria.getHydrusImportSettings();
    applySettings(settings);
    appendDebug("配置已加载");
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings =
      await window.asteria.updateHydrusImportSettings(createOptions());
    applySettings(settings);
    appendDebug("配置已保存");
  }

  async function testConnection(): Promise<void> {
    if (importing) {
      appendDebug("测试连接被忽略：正在执行任务");
      return;
    }

    if (
      !window.asteria ||
      typeof window.asteria.testHydrusConnection !== "function"
    ) {
      const failedStatus = createConnectionStatus(
        false,
        "Hydrus 导入 API 不可用，请重启应用",
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
    appendDebug("点击测试连接");
    appendDebug(`baseUrl=${baseUrl}`);
    appendDebug(`accessKeyLength=${accessKey.trim().length}`);
    const testingStatus = createConnectionStatus(false, "正在测试连接");
    setStatus(testingStatus);
    setProgress({ ...idleProgress, phase: "testing", message: "测试连接" });

    try {
      appendDebug("invoke hydrus:test-connection");
      const nextStatus =
        await window.asteria.testHydrusConnection(createOptions());
      appendDebug(
        `连接${nextStatus.ok ? "成功" : "失败"}：${nextStatus.message}`,
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
        error instanceof Error ? error.message : "测试连接失败",
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
      appendDebug("开始导入被忽略：正在执行任务");
      return;
    }

    if (
      !window.asteria ||
      typeof window.asteria.importFromHydrus !== "function"
    ) {
      appendDebug("importFromHydrus 不存在");
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: "Hydrus 导入 API 不可用，请重启应用",
      });
      return;
    }

    await saveSettings();
    appendDebug("点击开始导入");
    appendDebug(
      `searchTags=${createOptions().searchTags.join(",") || "system:everything"}`,
    );
    setStatus(null);
    setProgress({
      ...idleProgress,
      phase: "testing",
      message: "准备 Hydrus 导入",
    });

    try {
      appendDebug("invoke hydrus:import");
      const result = await window.asteria.importFromHydrus(createOptions());
      appendDebug(
        `导入结束：新增=${result.imported} 重复对象=${result.duplicated} 跳过=${result.skipped} 失败=${result.failed}`,
      );
      setProgress(result);
    } catch (error) {
      appendDebug(
        `import exception=${error instanceof Error ? error.message : "unknown"}`,
      );
      setProgress({
        ...idleProgress,
        phase: "failed",
        message: error instanceof Error ? error.message : "Hydrus 导入失败",
      });
    }
  }

  async function cancelImport(): Promise<void> {
    appendDebug("点击取消导入");
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

    return (
      nextProgress.message.includes("失败") ||
      nextProgress.message.includes("异常") ||
      nextProgress.message.includes("缺少")
    );
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
            <span>地址</span>
            <input
              aria-label="Hydrus 地址"
              placeholder="输入 Hydrus API 地址"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>Access Key</span>
            <input
              aria-label="Hydrus Access Key"
              placeholder="输入 Hydrus Access Key"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>标签风格</span>
            <input
              aria-label="标签风格"
              placeholder="输入迁移标签风格"
              value={tagStyleName}
              onChange={(event) => setTagStyleName(event.target.value)}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>数量限制</span>
            <input
              aria-label="数量限制"
              min={0}
              placeholder="0 表示不限"
              type="number"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
          </label>
          <label className={hydrusFieldClass}>
            <span>元数据分片</span>
            <input
              aria-label="元数据分片"
              min={1}
              placeholder="输入元数据分片大小"
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
            <span>重复文件创建新对象</span>
          </label>
        </aside>
      }
      right={
        <main className={hydrusContentClass}>
          <div className={hydrusToolbarClass}>
            <ActionFeedbackButton label="保存" onAction={saveSettings} />
            <button
              className={hydrusButtonClass}
              disabled={importing}
              type="button"
              onClick={() => void testConnection()}
            >
              测试连接
            </button>
            <button
              className={hydrusButtonClass}
              disabled={importing}
              type="button"
              onClick={() => void startImport()}
            >
              开始导入
            </button>
            <button
              className={hydrusButtonClass}
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

          <label className={hydrusFieldClass}>
            <span>搜索标签</span>
            <textarea
              aria-label="Hydrus 搜索标签"
              placeholder="输入 Hydrus 搜索标签，使用逗号或换行分隔；空白表示全部"
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
              <dt className={hydrusStatLabelClass}>总数</dt>
              <dd className={hydrusStatValueClass}>{progress.total}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>已处理</dt>
              <dd className={hydrusStatValueClass}>{progress.processed}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>新增</dt>
              <dd className={hydrusStatValueClass}>{progress.imported}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>重复对象</dt>
              <dd className={hydrusStatValueClass}>{progress.duplicated}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>跳过</dt>
              <dd className={hydrusStatValueClass}>{progress.skipped}</dd>
            </div>
            <div className={hydrusStatClass}>
              <dt className={hydrusStatLabelClass}>失败</dt>
              <dd className={hydrusStatValueClass}>{progress.failed}</dd>
            </div>
            <div className={`${hydrusStatClass} ${hydrusWideStatClass}`}>
              <dt className={hydrusStatLabelClass}>当前</dt>
              <dd className={hydrusStatValueClass}>
                {progress.currentFile ?? "-"}
              </dd>
            </div>
          </dl>

          <section className={hydrusPanelClass}>
            <header className={hydrusPanelHeaderClass}>连接状态</header>
            {status ? (
              <div
                className={`${hydrusStatusClass} ${status.ok ? hydrusStatusOkClass : ""}`}
              >
                <span>{status.message}</span>
                <span>Hydrus: {status.hydrusVersion ?? "-"}</span>
                <span>API: {status.apiVersion ?? "-"}</span>
                <span title={status.permissions}>
                  权限: {status.permissions || "-"}
                </span>
              </div>
            ) : (
              <div className={hydrusStatusClass}>未测试</div>
            )}
          </section>

          <section className={hydrusDebugClass}>
            <header className={hydrusDebugHeaderClass}>
              <span>Debug</span>
              <button
                className={hydrusButtonClass}
                type="button"
                onClick={() => setDebugLines([])}
              >
                清空
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
                <div className="px-1.5 text-(--muted)">没有 debug 信息</div>
              )}
            </div>
          </section>
        </main>
      }
    />
  );
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
