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
    <section className="module-view standalone-list-window">
      <div className="database-table-area">
        <table className="database-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>扩展名</th>
              <th>大小</th>
              <th>导入时间</th>
              <th>SHA256</th>
            </tr>
          </thead>
          <tbody>
            {databasePage?.files.length ? (
              databasePage.files.map((file) => (
                <tr key={file.id}>
                  <td>{file.id}</td>
                  <td>{file.extension ?? '-'}</td>
                  <td>{formatBytes(file.sizeBytes)}</td>
                  <td>{file.importedAt}</td>
                  <td title={file.sha256}>{file.sha256}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>没有文件记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="database-pager">
        <span>
          第 {databasePage?.page ?? 1} / {databaseTotalPages} 页，总计 {databasePage?.total ?? 0} 个文件，{message}
        </span>
        <div>
          <button disabled={!databasePage || databasePage.page <= 1} type="button" onClick={goToPreviousDatabasePage}>
            上一页
          </button>
          <button
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
