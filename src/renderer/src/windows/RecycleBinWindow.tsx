import { useEffect, useRef, useState } from 'react';
import type { DatabaseFilePage, DatabaseFileRecord } from '../../../shared/ipc';
import { useBoxSelection } from '../hooks/useBoxSelection';
import { useShortcut } from '../hooks/useShortcut';
import { formatBytes } from '../utils/format';
import { mergeIds } from '../utils/ids';

export function RecycleBinWindow(): JSX.Element {
  const [page, setPage] = useState<DatabaseFilePage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pendingFileIds, setPendingFileIds] = useState<number[]>([]);
  const [lastPendingFileId, setLastPendingFileId] = useState<number | null>(null);
  const [message, setMessage] = useState('未加载');
  const [bulkOperating, setBulkOperating] = useState(false);
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const totalPages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  const boxSelection = useBoxSelection({
    containerRef: tableAreaRef,
    itemSelector: '[data-box-select-id]',
    selectedIds: pendingFileIds,
    onSelect: setPendingFileIds,
    onLastSelectedId: setLastPendingFileId
  });

  useEffect(() => {
    void loadPage(pageNumber);
  }, [pageNumber]);

  useShortcut('select-all', () => {
    const fileIds = page?.files.map((file) => file.id) ?? [];
    setPendingFileIds(fileIds);
    setLastPendingFileId(fileIds[fileIds.length - 1] ?? null);
  });

  async function loadPage(nextPageNumber: number): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const nextPage = await window.asteria.listTrashedFiles(nextPageNumber);
    setPage(nextPage);
    setPendingFileIds((currentIds) =>
      currentIds.filter((id) => nextPage.files.some((file) => file.id === id))
    );
    setMessage(`${nextPage.total} 个文件`);
  }

  function handleRowMouseDown(
    event: React.MouseEvent<HTMLTableRowElement>,
    file: DatabaseFileRecord,
    index: number
  ): void {
    event.preventDefault();

    if (!page) {
      return;
    }

    const isPending = pendingFileIds.includes(file.id);

    if (event.shiftKey && lastPendingFileId !== null) {
      const anchorIndex = page.files.findIndex((item) => item.id === lastPendingFileId);

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = page.files.slice(start, end + 1).map((item) => item.id);

        setPendingFileIds((currentIds) => (event.ctrlKey ? mergeIds(currentIds, rangeIds) : rangeIds));
        return;
      }
    }

    if (event.ctrlKey) {
      setPendingFileIds((currentIds) =>
        isPending ? currentIds.filter((id) => id !== file.id) : [...currentIds, file.id]
      );
      setLastPendingFileId(file.id);
      return;
    }

    setPendingFileIds([file.id]);
    setLastPendingFileId(file.id);
  }

  async function restorePendingFiles(): Promise<void> {
    if (!window.asteria || pendingFileIds.length === 0) {
      return;
    }

    await window.asteria.restoreFiles(pendingFileIds);
    setPendingFileIds([]);
    setLastPendingFileId(null);
    await loadPage(pageNumber);
  }

  async function deletePendingFiles(): Promise<void> {
    if (!window.asteria || pendingFileIds.length === 0) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: '确认彻底删除',
      message: `确认彻底删除${pendingFileIds.length}个文件吗`
    });

    if (!confirmed) {
      return;
    }

    await window.asteria.deleteFilesPermanently(pendingFileIds);
    setPendingFileIds([]);
    setLastPendingFileId(null);
    await loadPage(pageNumber);
  }

  async function collectAllTrashedFileIds(): Promise<number[]> {
    if (!window.asteria || !page) {
      return [];
    }

    const firstPage = await window.asteria.listTrashedFiles(1);
    const totalPageCount = Math.max(1, Math.ceil(firstPage.total / firstPage.pageSize));
    const fileIds = firstPage.files.map((file) => file.id);

    for (let nextPageNumber = 2; nextPageNumber <= totalPageCount; nextPageNumber += 1) {
      const nextPage = await window.asteria.listTrashedFiles(nextPageNumber);
      fileIds.push(...nextPage.files.map((file) => file.id));
    }

    return fileIds;
  }

  async function restoreAllFiles(): Promise<void> {
    if (!window.asteria || !page || page.total === 0 || bulkOperating) {
      return;
    }

    setBulkOperating(true);

    try {
      const fileIds = await collectAllTrashedFileIds();

      if (fileIds.length === 0) {
        return;
      }

      await window.asteria.restoreFiles(fileIds);
      setPendingFileIds([]);
      setLastPendingFileId(null);
      setPageNumber(1);
      await loadPage(1);
    } finally {
      setBulkOperating(false);
    }
  }

  async function deleteAllFiles(): Promise<void> {
    if (!window.asteria || !page || page.total === 0 || bulkOperating) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: '确认清空回收站',
      message: `确认彻底删除回收站中的 ${page.total} 个文件吗`
    });

    if (!confirmed) {
      return;
    }

    setBulkOperating(true);

    try {
      const fileIds = await collectAllTrashedFileIds();

      if (fileIds.length === 0) {
        return;
      }

      await window.asteria.deleteFilesPermanently(fileIds);
      setPendingFileIds([]);
      setLastPendingFileId(null);
      setPageNumber(1);
      await loadPage(1);
    } finally {
      setBulkOperating(false);
    }
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_32px] bg-[var(--panel)]">
      <div
        className="relative min-h-0 min-w-0 overflow-auto"
        ref={tableAreaRef}
        onMouseDownCapture={boxSelection.handleMouseDownCapture}
      >
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="h-[26px] border-b border-r border-[var(--line)] bg-[var(--surface-bg)] px-2 text-left font-medium text-[var(--muted)]">ID</th>
              <th className="h-[26px] border-b border-r border-[var(--line)] bg-[var(--surface-bg)] px-2 text-left font-medium text-[var(--muted)]">扩展名</th>
              <th className="h-[26px] border-b border-r border-[var(--line)] bg-[var(--surface-bg)] px-2 text-left font-medium text-[var(--muted)]">大小</th>
              <th className="h-[26px] border-b border-r border-[var(--line)] bg-[var(--surface-bg)] px-2 text-left font-medium text-[var(--muted)]">导入时间</th>
              <th className="h-[26px] border-b border-r border-[var(--line)] bg-[var(--surface-bg)] px-2 text-left font-medium text-[var(--muted)]">SHA256</th>
            </tr>
          </thead>
          <tbody>
            {page?.files.length ? (
              page.files.map((file, index) => (
                <tr
                  className={pendingFileIds.includes(file.id) ? 'bg-[var(--danger-bg)] text-[var(--danger-ink)]' : ''}
                  data-box-select-id={file.id}
                  key={file.id}
                  onMouseDown={(event) => handleRowMouseDown(event, file, index)}
                >
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2">{file.id}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2">{file.extension ?? '-'}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2">{formatBytes(file.sizeBytes)}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2">{file.importedAt}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2" title={file.sha256}>{file.sha256}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-2 text-[var(--muted)]" colSpan={5}>没有文件记录</td>
              </tr>
            )}
          </tbody>
        </table>
        {boxSelection.selectionBox ? (
          <div className="absolute z-40 border border-[var(--accent)] bg-[var(--accent-overlay)] pointer-events-none" style={boxSelection.selectionBox} />
        ) : null}
      </div>

      <footer className="flex h-8 items-center justify-between border-t border-[var(--line)] px-2 text-[var(--muted)]">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          第 {page?.page ?? 1} / {totalPages} 页，总计 {page?.total ?? 0} 个文件，已选 {pendingFileIds.length}，{message}
        </span>
        <div className="flex gap-1.5">
          <button className="h-6 cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)] px-2 text-[11px]" disabled={pendingFileIds.length === 0} type="button" onClick={() => void restorePendingFiles()}>
            还原
          </button>
          <button className="h-6 cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)] px-2 text-[11px]" disabled={pendingFileIds.length === 0} type="button" onClick={() => void deletePendingFiles()}>
            彻底删除
          </button>
          <button className="h-6 cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)] px-2 text-[11px]" disabled={!page || page.total === 0 || bulkOperating} type="button" onClick={() => void restoreAllFiles()}>
            一键还原
          </button>
          <button className="h-6 cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)] px-2 text-[11px]" disabled={!page || page.total === 0 || bulkOperating} type="button" onClick={() => void deleteAllFiles()}>
            一键彻底删除
          </button>
          <button className="h-6 cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)] px-2 text-[11px]" disabled={!page || page.page <= 1} type="button" onClick={() => setPageNumber((value) => value - 1)}>
            上一页
          </button>
          <button
            className="h-6 cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)] px-2 text-[11px]"
            disabled={!page || page.page >= totalPages}
            type="button"
            onClick={() => setPageNumber((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      </footer>
    </section>
  );
}
