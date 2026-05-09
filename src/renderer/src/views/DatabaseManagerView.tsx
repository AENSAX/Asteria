import { useEffect, useState } from 'react';
import type { DatabaseFilePage } from '../../../shared/ipc';
import { formatBytes } from '../utils/format';

export function DatabaseManagerView(): JSX.Element {
  const [databasePage, setDatabasePage] = useState<DatabaseFilePage | null>(null);
  const [databasePageNumber, setDatabasePageNumber] = useState(1);
  const [message, setMessage] = useState('未加载');
  const databaseTotalPages = databasePage
    ? Math.max(1, Math.ceil(databasePage.total / databasePage.pageSize))
    : 1;

  useEffect(() => {
    void loadDatabasePage(databasePageNumber);
  }, [databasePageNumber]);

  async function loadDatabasePage(page: number): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    setMessage('加载中');

    try {
      const nextPage = await window.asteria.listDatabaseFiles(page);
      setDatabasePage(nextPage);
      setMessage('只读');
    } catch (error) {
      setDatabasePage(null);
      setMessage(error instanceof Error ? error.message : '加载失败');
    }
  }

  function goToPreviousDatabasePage(): void {
    setDatabasePageNumber((page) => Math.max(1, page - 1));
  }

  function goToNextDatabasePage(): void {
    setDatabasePageNumber((page) => Math.min(databaseTotalPages, page + 1));
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_32px] bg-[var(--panel)]">
      <div className="min-h-0 min-w-0 overflow-auto">
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
            {databasePage?.files.length ? (
              databasePage.files.map((file) => (
                <tr key={file.id}>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2 text-left text-[var(--ink)]">{file.id}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2 text-left text-[var(--ink)]">{file.extension ?? '-'}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2 text-left text-[var(--ink)]">{formatBytes(file.sizeBytes)}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2 text-left text-[var(--ink)]">{file.importedAt}</td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-[var(--line)] px-2 text-left text-[var(--ink)]" title={file.sha256}>{file.sha256}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="h-[26px] px-2 text-[var(--muted)]" colSpan={5}>没有文件记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex h-8 items-center justify-between border-t border-[var(--line)] px-2 text-[var(--muted)]">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          第 {databasePage?.page ?? 1} / {databaseTotalPages} 页，总计 {databasePage?.total ?? 0} 个文件，{message}
        </span>
        <div className="flex gap-1.5">
          <button className="h-6 min-w-[58px] cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)]" disabled={!databasePage || databasePage.page <= 1} type="button" onClick={goToPreviousDatabasePage}>
            上一页
          </button>
          <button
            className="h-6 min-w-[58px] cursor-default border border-[var(--line-strong)] bg-[var(--panel-strong)]"
            disabled={!databasePage || databasePage.page >= databaseTotalPages}
            type="button"
            onClick={goToNextDatabasePage}
          >
            下一页
          </button>
        </div>
      </footer>
    </section>
  );
}
