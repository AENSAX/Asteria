import { useEffect, useState } from "react";
import type {
  ImportProgress,
  ImportQueueFileRecord,
} from "../../../shared/ipc";
import { formatBytes } from "../utils/format";
import { getFileDomainDisplayName, useLanguage } from "../utils/language";

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
  onCommitQueue,
}: ImportViewProps): JSX.Element {
  const { t } = useLanguage();
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
  const failedCount = queueFiles.filter(
    (file) => file.status === "failed",
  ).length;
  const readyCount = queueFiles.filter(
    (file) => file.status === "ready",
  ).length;

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] bg-(--panel)">
      <header className="flex h-[30px] items-center gap-1.5 border-b border-(--line) bg-(--panel-strong) px-1.5">
        <button
          className="h-[22px] min-w-[66px] cursor-default border border-(--line-strong) bg-(--surface-bg) px-2 text-[11px]"
          disabled={readyCount === 0}
          type="button"
          onClick={() => onCommitQueue(queueFiles)}
        >
          {t("window.import.now")}
        </button>
        <button
          className="h-[22px] min-w-[66px] cursor-default border border-(--line-strong) bg-(--surface-bg) px-2 text-[11px]"
          disabled={queueFiles.length === 0}
          type="button"
          onClick={onCancelQueue}
        >
          {t("window.import.cancel")}
        </button>
      </header>

      <div className="border-b border-(--line) p-1.5">
        <div className="h-6 leading-6 text-(--muted)">
          {dragActive ? t("window.import.dropHint") : progress.message}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2">
          <progress max={100} value={percent} />
          <span className="text-right text-(--muted)">{percent}%</span>
        </div>
      </div>

      <dl className="grid grid-cols-[repeat(6,minmax(96px,1fr))] text-(--ink)">
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.batch")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {progress.batchId ?? "-"}
          </dd>
        </div>
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.total")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {queueFiles.length}
          </dd>
        </div>
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.ready")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {readyCount}
          </dd>
        </div>
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.added")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {Math.max(readyCount - duplicateCount, 0)}
          </dd>
        </div>
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.duplicate")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {duplicateCount}
          </dd>
        </div>
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.failed")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {failedCount}
          </dd>
        </div>
        <div className="grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.chunk")}
          </dt>
          <dd className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap">
            {progress.chunkTotal > 0
              ? `${progress.chunkIndex} / ${progress.chunkTotal}`
              : "-"}
          </dd>
        </div>
        <div className="col-span-6 grid min-h-6 grid-cols-[56px_minmax(0,1fr)] border-b border-r border-(--line) bg-(--surface-inset-bg)">
          <dt className="flex min-w-0 items-center px-2 text-(--muted)">
            {t("window.import.currentFile")}
          </dt>
          <dd
            className="flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap"
            title={progress.currentFile ?? ""}
          >
            {progress.currentFile ?? "-"}
          </dd>
        </div>
      </dl>

      <div className="min-h-0 overflow-auto border-t border-(--line) bg-(--surface-inset-bg) text-[11px] text-(--ink)">
        <div className="sticky top-0 grid min-h-6 grid-cols-[96px_78px_62px_minmax(0,1fr)] border-b border-(--line) bg-(--panel-strong) text-(--muted)">
          <span>{t("window.import.status")}</span>
          <span>{t("window.import.size")}</span>
          <span>{t("window.import.extension")}</span>
          <span>{t("window.import.path")}</span>
        </div>
        {queueFiles.length > 0 ? (
          queueFiles.map((file) => (
            <div
              className="grid min-h-6 grid-cols-[96px_78px_62px_minmax(0,1fr)] border-b border-(--line) bg-(--panel)"
              key={file.id}
            >
              <span>
                {file.duplicate
                  ? `${t("window.import.duplicate")}:${getFileDomainDisplayName(
                      file.duplicate.domain,
                      t,
                    )}`
                  : file.status === "failed"
                    ? t("window.import.failed")
                    : t("window.import.added")}
              </span>
              <span>{formatBytes(file.sizeBytes)}</span>
              <span>{file.extension ?? "-"}</span>
              <span title={file.originalPath}>{file.originalPath}</span>
            </div>
          ))
        ) : (
          <div className="h-6 px-2 leading-6 text-(--muted)">
            {t("window.import.noFiles")}
          </div>
        )}
      </div>
    </section>
  );
}
