import { useEffect, useState } from 'react';
import type { ImportProgress, ImportQueueFileRecord } from '../../../shared/ipc';
import { formatBytes } from '../utils/format';

interface ImportViewProps {
  dragActive: boolean;
  percent: number;
  progress: ImportProgress;
  onCommitQueue: (queueFiles: ImportQueueFileRecord[]) => void;
  onCancelQueue: () => void;
}

export function ImportView({
  dragActive,
  percent,
  progress,
  onCancelQueue,
  onCommitQueue
}: ImportViewProps): JSX.Element {
  const [queueFiles, setQueueFiles] = useState<ImportQueueFileRecord[]>([]);

  useEffect(() => {
    void loadQueue();

    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onImportQueueChanged(() => {
      void loadQueue();
    });
  }, []);

  async function loadQueue(): Promise<void> {
    if (!window.asteria) {
      setQueueFiles([]);
      return;
    }

    setQueueFiles(await window.asteria.listImportQueueFiles());
  }

  const duplicateCount = queueFiles.filter((file) => file.duplicate).length;
  const failedCount = queueFiles.filter((file) => file.status === 'failed').length;
  const readyCount = queueFiles.filter((file) => file.status === 'ready').length;

  return (
    <section className="module-view import-page-view">
      <header className="import-toolbar">
        <button disabled={readyCount === 0} type="button" onClick={() => onCommitQueue(queueFiles)}>
          现在导入
        </button>
        <button disabled={queueFiles.length === 0} type="button" onClick={onCancelQueue}>
          取消
        </button>
      </header>

      <div className="progress-block compact">
        <div className="import-status">{dragActive ? '松开导入媒体文件或文件夹' : progress.message}</div>
        <div className="progress-row">
          <progress max={100} value={percent} />
          <span>{percent}%</span>
        </div>
      </div>

      <dl className="import-info">
        <div>
          <dt>批次</dt>
          <dd>{progress.batchId ?? '-'}</dd>
        </div>
        <div>
          <dt>总数</dt>
          <dd>{queueFiles.length}</dd>
        </div>
        <div>
          <dt>可导入</dt>
          <dd>{readyCount}</dd>
        </div>
        <div>
          <dt>新增</dt>
          <dd>{Math.max(readyCount - duplicateCount, 0)}</dd>
        </div>
        <div>
          <dt>重复</dt>
          <dd>{duplicateCount}</dd>
        </div>
        <div>
          <dt>失败</dt>
          <dd>{failedCount}</dd>
        </div>
        <div>
          <dt>分片</dt>
          <dd>{progress.chunkTotal > 0 ? `${progress.chunkIndex} / ${progress.chunkTotal}` : '-'}</dd>
        </div>
        <div className="wide">
          <dt>当前文件</dt>
          <dd title={progress.currentFile ?? ''}>{progress.currentFile ?? '-'}</dd>
        </div>
      </dl>

      <div className="import-queue-table">
        <div className="import-queue-row head">
          <span>状态</span>
          <span>大小</span>
          <span>扩展名</span>
          <span>路径</span>
        </div>
        {queueFiles.length > 0 ? (
          queueFiles.map((file) => (
            <div className="import-queue-row" key={file.id}>
              <span>{file.duplicate ? `重复:${file.duplicate.domainName}` : file.status === 'failed' ? '失败' : '新增'}</span>
              <span>{formatBytes(file.sizeBytes)}</span>
              <span>{file.extension ?? '-'}</span>
              <span title={file.originalPath}>{file.originalPath}</span>
            </div>
          ))
        ) : (
          <div className="import-queue-empty">没有待导入文件</div>
        )}
      </div>
    </section>
  );
}
