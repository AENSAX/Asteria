import { useEffect, useMemo, useState } from 'react';
import type {
  EHentaiGalleryStatus,
  EHentaiImportOptions,
  EHentaiImportProgress
} from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';
import { ResizableColumns } from '../components/ResizableColumns';

const idleProgress: EHentaiImportProgress = {
  phase: 'idle',
  total: 0,
  processed: 0,
  imported: 0,
  duplicated: 0,
  skipped: 0,
  failed: 0,
  currentFile: null,
  message: '未开始'
};

export function EHentaiImportWindow(): JSX.Element {
  const [galleryUrl, setGalleryUrl] = useState('');
  const [cookie, setCookie] = useState('');
  const [importGalleryTags, setImportGalleryTags] = useState(true);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(45000);
  const [startIndex, setStartIndex] = useState(1);
  const [limit, setLimit] = useState(0);
  const [status, setStatus] = useState<EHentaiGalleryStatus | null>(null);
  const [progress, setProgress] = useState<EHentaiImportProgress>(idleProgress);
  const [logs, setLogs] = useState<string[]>(['等待操作']);
  const importing =
    progress.phase === 'testing' ||
    progress.phase === 'collecting' ||
    progress.phase === 'importing';
  const percent = useMemo(() => {
    if (progress.total === 0) {
      return 0;
    }

    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress.processed, progress.total]);

  useEffect(() => {
    if (!window.asteria) {
      appendLog('preload 不可用，请重启应用');
      return undefined;
    }

    void loadSettings();

    return window.asteria.onEHentaiImportProgress((nextProgress) => {
      if (shouldLogProgress(nextProgress)) {
        appendLog(`${nextProgress.phase} ${nextProgress.processed}/${nextProgress.total} ${nextProgress.message}`);
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
    appendLog('配置已加载');
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const settings = await window.asteria.updateEHentaiImportSettings(createOptions());
    applySettings(settings);
    appendLog('配置已保存');
  }

  async function testGallery(): Promise<void> {
    if (importing) {
      return;
    }

    if (!window.asteria) {
      setProgress({ ...idleProgress, phase: 'failed', message: 'E-Hentai API 不可用，请重启应用' });
      return;
    }

    await saveSettings();
    setStatus(null);
    setProgress({ ...idleProgress, phase: 'testing', message: '检测 gallery 链接' });
    appendLog('点击检测链接');

    try {
      const nextStatus = await window.asteria.testEHentaiGallery(createOptions());
      setStatus(nextStatus);
      setProgress({
        ...idleProgress,
        phase: nextStatus.ok ? 'completed' : 'failed',
        message: nextStatus.message
      });
      appendLog(`${nextStatus.ok ? '检测成功' : '检测失败'}：${nextStatus.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '检测失败';
      setStatus({ ok: false, message, galleryTitle: '', imageCount: 0 });
      setProgress({ ...idleProgress, phase: 'failed', message });
      appendLog(`检测异常：${message}`);
    }
  }

  async function startImport(): Promise<void> {
    if (importing) {
      return;
    }

    if (!window.asteria) {
      setProgress({ ...idleProgress, phase: 'failed', message: 'E-Hentai API 不可用，请重启应用' });
      return;
    }

    await saveSettings();
    setStatus(null);
    setProgress({ ...idleProgress, phase: 'testing', message: '准备 E-Hentai 导入' });
    appendLog(
      `开始导入：start=${startIndex} limit=${limit || '不限'} cooldown=10000ms timeout=${requestTimeoutMs}ms`
    );

    try {
      const result = await window.asteria.importFromEHentai(createOptions());
      setProgress(result);
      appendLog(`导入结束：新增=${result.imported} 重复对象=${result.duplicated} 失败=${result.failed}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'E-Hentai 导入失败';
      setProgress({ ...idleProgress, phase: 'failed', message });
      appendLog(`导入异常：${message}`);
    }
  }

  async function cancelImport(): Promise<void> {
    appendLog('点击取消导入');
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
      limit
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
    setLogs((currentLogs) => [...currentLogs.slice(-120), `${new Date().toLocaleTimeString()} ${line}`]);
  }

  return (
    <ResizableColumns
      className="hydrus-import-window ehentai-import-window"
      defaultLeftWidth={280}
      minLeftWidth={220}
      minRightWidth={420}
      storageKey="asteria:ehentai-import-sidebar-width"
      left={(
        <aside className="hydrus-import-sidebar ehentai-import-sidebar">
          <label>
            <span>Gallery 链接</span>
            <textarea
              aria-label="E-Hentai gallery 链接"
              className="ehentai-compact-textarea"
              placeholder="输入 https://e-hentai.org/g/..."
              value={galleryUrl}
              onChange={(event) => setGalleryUrl(event.target.value)}
            />
          </label>
          <label>
            <span>Cookie</span>
            <textarea
              aria-label="E-Hentai cookie"
              className="ehentai-cookie-input"
              placeholder="输入浏览器复制出的 Cookie"
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
            />
          </label>
          <label className="hydrus-inline-check">
            <input
              checked={importGalleryTags}
              type="checkbox"
              onChange={(event) => setImportGalleryTags(event.target.checked)}
            />
            <span>导入 gallery 标签</span>
          </label>
          <label className="hydrus-inline-check">
            <input
              checked={forceDuplicate}
              type="checkbox"
              onChange={(event) => setForceDuplicate(event.target.checked)}
            />
            <span>重复文件创建新对象</span>
          </label>
          <label>
            <span>起始序号</span>
            <input
              aria-label="起始序号"
              min={1}
              type="number"
              value={startIndex}
              onChange={(event) => setStartIndex(Number(event.target.value))}
            />
            <small>从 gallery 第几张开始，最小为 1；中断后可填下一张序号继续。</small>
          </label>
          <label>
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
          <label>
            <span>请求超时 ms</span>
            <input
              aria-label="请求超时"
              min={1000}
              type="number"
              value={requestTimeoutMs}
              onChange={(event) => setRequestTimeoutMs(Number(event.target.value))}
            />
          </label>
        </aside>
      )}
      right={(
        <main className="hydrus-import-content ehentai-import-content">
          <div className="hydrus-import-toolbar">
            <ActionFeedbackButton label="保存" onAction={saveSettings} />
            <button disabled={importing} type="button" onClick={() => void testGallery()}>
              检测链接
            </button>
            <button disabled={importing} type="button" onClick={() => void startImport()}>
              开始导入
            </button>
            <button disabled={!importing} type="button" onClick={() => void cancelImport()}>
              取消
            </button>
            <span>{progress.message}</span>
          </div>

          <div className="hydrus-progress">
            <progress max={100} value={percent} />
            <span>{percent}%</span>
          </div>

          <dl className="hydrus-import-stats">
            <div>
              <dt>总数</dt>
              <dd>{progress.total}</dd>
            </div>
            <div>
              <dt>已处理</dt>
              <dd>{progress.processed}</dd>
            </div>
            <div>
              <dt>新增</dt>
              <dd>{progress.imported}</dd>
            </div>
            <div>
              <dt>重复对象</dt>
              <dd>{progress.duplicated}</dd>
            </div>
            <div>
              <dt>跳过</dt>
              <dd>{progress.skipped}</dd>
            </div>
            <div>
              <dt>失败</dt>
              <dd>{progress.failed}</dd>
            </div>
            <div className="wide">
              <dt>当前</dt>
              <dd>{progress.currentFile ?? '-'}</dd>
            </div>
          </dl>

          <section className="hydrus-status-panel">
            <header>Gallery 状态</header>
            {status ? (
              <div className={status.ok ? 'hydrus-status ok ehentai-status' : 'hydrus-status ehentai-status'}>
                <span>{status.message}</span>
                <span title={status.galleryTitle}>{status.galleryTitle || '-'}</span>
                <span>首页: {status.imageCount}</span>
                <span>风格: e-hentai</span>
              </div>
            ) : (
              <div className="hydrus-status">未检测</div>
            )}
          </section>

          <section className="hydrus-status-panel ehentai-note-panel">
            <header>导入规则</header>
            <div className="ehentai-note">
              默认写入 e-hentai 风格标签 gallery:gallery名字；勾选导入 gallery 标签后，会同时写入页面中的标签。重复文件默认跳过，勾选重复文件创建新对象后会复用物理文件。请求冷却固定为 10000ms。
            </div>
          </section>

          <section className="hydrus-debug-panel">
            <header>
              <span>日志</span>
              <button type="button" onClick={() => setLogs([])}>
                清空
              </button>
            </header>
            <div className="hydrus-debug-list">
              {logs.length > 0 ? (
                logs.map((line, index) => (
                  <div key={`${index}:${line}`}>{line}</div>
                ))
              ) : (
                <div>没有日志</div>
              )}
            </div>
          </section>
        </main>
      )}
    />
  );
}

function shouldLogProgress(progress: EHentaiImportProgress): boolean {
  if (progress.phase === 'failed' || progress.phase === 'canceled' || progress.phase === 'completed') {
    return true;
  }

  if (progress.phase !== 'importing') {
    return progress.message.length > 0;
  }

  return isDebugLinkProgress(progress.message) ||
    progress.message.includes('失败') ||
    progress.processed % 10 === 0;
}

function isDebugLinkProgress(message: string): boolean {
  return message.includes('链接：');
}
