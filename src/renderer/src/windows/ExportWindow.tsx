import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExportProgress } from '../../../shared/ipc';

interface ExportWindowProps {
  fileIds: number[];
}

interface FormatSegment {
  kind: 'text' | 'variable';
  value: string;
  valid: boolean;
}

const defaultFilenameFormat = '{index}-{hash}';

function createIdleProgress(jobId: string, total: number): ExportProgress {
  return {
    jobId,
    phase: 'idle',
    total,
    processed: 0,
    exported: 0,
    failed: 0,
    currentFile: null,
    message: '等待导出'
  };
}

export function ExportWindow({ fileIds }: ExportWindowProps): JSX.Element {
  const normalizedFileIds = useMemo(
    () => [...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0))],
    [fileIds]
  );
  const [directory, setDirectory] = useState('');
  const [filenameFormat, setFilenameFormat] = useState(defaultFilenameFormat);
  const [jobId, setJobId] = useState(() => createExportJobId());
  const jobIdRef = useRef(jobId);
  const [progress, setProgress] = useState(() => createIdleProgress(jobId, normalizedFileIds.length));
  const formatSegments = useMemo(() => parseFormatSegments(filenameFormat), [filenameFormat]);
  const formatValid = formatSegments.every((segment) => segment.kind === 'text' || segment.valid);
  const exporting = progress.phase === 'exporting';
  const percent = progress.total > 0 ? Math.floor((progress.processed / progress.total) * 100) : 0;

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

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

  async function startExport(): Promise<void> {
    if (!window.asteria || exporting || !directory.trim() || !formatValid) {
      return;
    }

    const nextJobId = createExportJobId();
    jobIdRef.current = nextJobId;
    setJobId(nextJobId);
    setProgress(createIdleProgress(nextJobId, normalizedFileIds.length));

    try {
      const result = await window.asteria.exportFiles({
        jobId: nextJobId,
        fileIds: normalizedFileIds,
        directory,
        filenameFormat
      });
      setProgress(result);
    } catch (error) {
      setProgress({
        jobId: nextJobId,
        phase: 'failed',
        total: normalizedFileIds.length,
        processed: 0,
        exported: 0,
        failed: 0,
        currentFile: null,
        message: error instanceof Error ? error.message : '导出失败'
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
    <section className="export-window">
      <div className="export-config">
        <div className="export-row">
          <span>文件</span>
          <span>{normalizedFileIds.length}</span>
        </div>

        <label className="export-row">
          <span>路径</span>
          <input
            disabled={exporting}
            placeholder="输入导出路径"
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
          />
          <button disabled={exporting} type="button" onClick={() => void browseDirectory()}>
            ...
          </button>
        </label>

        <label className="export-row">
          <span>文件名</span>
          <input
            disabled={exporting}
            placeholder="输入导出文件名格式"
            value={filenameFormat}
            onChange={(event) => setFilenameFormat(event.target.value)}
          />
        </label>

        <div className="export-format-preview">
          {formatSegments.length > 0 ? (
            formatSegments.map((segment, index) =>
              segment.kind === 'variable' ? (
                <span
                  className={segment.valid ? 'export-format-token' : 'export-format-token invalid'}
                  key={`${segment.value}-${index}`}
                >
                  {segment.value}
                </span>
              ) : (
                <span className="export-format-text" key={`${segment.value}-${index}`}>
                  {segment.value}
                </span>
              )
            )
          ) : (
            <span className="export-format-empty">无格式</span>
          )}
        </div>
      </div>

      <div className="export-progress">
        <div className="progress-row">
          <progress max={100} value={percent} />
          <span>{percent}%</span>
        </div>
        <div className="export-progress-meta">
          <span>
            {progress.processed} / {progress.total}
          </span>
          <span>{progress.message}</span>
          <span>{progress.currentFile ?? ''}</span>
        </div>
      </div>

      <footer>
        <button type="button" onClick={() => void cancelExport()}>
          {exporting ? '取消' : '关闭'}
        </button>
        <button
          disabled={exporting || normalizedFileIds.length === 0 || !directory.trim() || !formatValid}
          type="button"
          onClick={() => void startExport()}
        >
          导出
        </button>
      </footer>
    </section>
  );
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
        kind: 'text',
        value: format.slice(lastIndex, match.index),
        valid: true
      });
    }

    const value = match[1]?.trim() ?? '';
    segments.push({
      kind: 'variable',
      value,
      valid: isValidExportVariable(value)
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < format.length) {
    segments.push({
      kind: 'text',
      value: format.slice(lastIndex),
      valid: true
    });
  }

  return segments;
}

function isValidExportVariable(variable: string): boolean {
  return (
    variable === 'index' ||
    variable === 'time' ||
    variable === 'hash' ||
    variable === 'tag' ||
    /^namespace:.+/.test(variable) ||
    /^rating:.+/.test(variable)
  );
}
