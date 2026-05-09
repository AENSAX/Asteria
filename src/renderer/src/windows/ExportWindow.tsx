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
const exportRootClass = 'grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_32px] bg-(--panel) text-[11px] text-(--ink)';
const exportConfigClass = 'grid gap-1.5 border-b border-(--line) bg-(--surface-bg) p-2';
const exportRowClass = 'grid grid-cols-[72px_minmax(0,1fr)_32px] items-center gap-1.5';
const exportInputClass = 'h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)';
const exportButtonClass = 'h-6 min-w-[58px] cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)';
const exportPreviewClass = 'flex min-h-6 flex-wrap items-center gap-1 border border-(--line) bg-(--surface-inset-bg) p-1';
const exportTokenClass = 'border border-(--line-strong) bg-(--tag-bg) px-1.5 leading-[18px]';
const exportTokenInvalidClass = 'border-(--danger) text-(--danger-ink)';
const exportProgressClass = 'grid gap-1.5 border-b border-(--line) p-2';
const exportFooterClass = 'flex items-center justify-end gap-1.5 border-t border-(--line) bg-(--surface-bg) px-2';

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
    <section className={exportRootClass}>
      <div className={exportConfigClass}>
        <div className={exportRowClass}>
          <span>文件</span>
          <span>{normalizedFileIds.length}</span>
        </div>

        <label className={exportRowClass}>
          <span>路径</span>
          <input
            className={exportInputClass}
            disabled={exporting}
            placeholder="输入导出路径"
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
          />
          <button className={exportButtonClass} disabled={exporting} type="button" onClick={() => void browseDirectory()}>
            ...
          </button>
        </label>

        <label className={`${exportRowClass} grid-cols-[72px_minmax(0,1fr)]`}>
          <span>文件名</span>
          <input
            className={exportInputClass}
            disabled={exporting}
            placeholder="输入导出文件名格式"
            value={filenameFormat}
            onChange={(event) => setFilenameFormat(event.target.value)}
          />
        </label>

        <div className={exportPreviewClass}>
          {formatSegments.length > 0 ? (
            formatSegments.map((segment, index) =>
              segment.kind === 'variable' ? (
                <span
                  className={segment.valid ? exportTokenClass : `${exportTokenClass} ${exportTokenInvalidClass}`}
                  key={`${segment.value}-${index}`}
                >
                  {segment.value}
                </span>
              ) : (
                <span className="text-(--muted)" key={`${segment.value}-${index}`}>
                  {segment.value}
                </span>
              )
            )
          ) : (
            <span className="text-(--muted)">无格式</span>
          )}
        </div>
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
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{progress.message}</span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{progress.currentFile ?? ''}</span>
        </div>
      </div>

      <footer className={exportFooterClass}>
        <button className={exportButtonClass} type="button" onClick={() => void cancelExport()}>
          {exporting ? '取消' : '关闭'}
        </button>
        <button
          className={exportButtonClass}
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
