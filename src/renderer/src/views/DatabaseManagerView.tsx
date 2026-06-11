import { useEffect, useState } from "react";
import type { DatabaseFilePage } from "../../../shared/ipc";
import { formatBytes, formatDate } from "../utils/format";
import { useLanguage } from "../utils/language";

export function DatabaseManagerView(): JSX.Element {
  const { t } = useLanguage();
  const [databasePage, setDatabasePage] = useState<DatabaseFilePage | null>(
    null,
  );
  const [databasePageNumber, setDatabasePageNumber] = useState(1);
  const [message, setMessage] = useState(() => t("common.loading"));
  const databaseTotalPages = databasePage
    ? Math.max(1, Math.ceil(databasePage.total / databasePage.pageSize))
    : 1;

  useEffect(() => {
    void loadDatabasePage(databasePageNumber);
  }, [databasePageNumber]);

  async function loadDatabasePage(page: number): Promise<void> {
    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    setMessage(t("window.database.loading"));

    try {
      const nextPage = await window.asteria.listDatabaseFiles(page);
      setDatabasePage(nextPage);
      setMessage(t("window.database.readonly"));
    } catch (error) {
      setDatabasePage(null);
      setMessage(
        error instanceof Error ? error.message : t("window.database.loadFailed"),
      );
    }
  }

  function goToPreviousDatabasePage(): void {
    setDatabasePageNumber((page) => Math.max(1, page - 1));
  }

  function goToNextDatabasePage(): void {
    setDatabasePageNumber((page) => Math.min(databaseTotalPages, page + 1));
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_32px] bg-(--panel)">
      <div className="min-h-0 min-w-0 overflow-auto">
        <table className="w-full table-fixed border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="h-[26px] border-b border-r border-(--line) bg-(--surface-bg) px-2 text-left font-medium text-(--muted)">
                {t("window.database.id")}
              </th>
              <th className="h-[26px] border-b border-r border-(--line) bg-(--surface-bg) px-2 text-left font-medium text-(--muted)">
                {t("window.database.extension")}
              </th>
              <th className="h-[26px] border-b border-r border-(--line) bg-(--surface-bg) px-2 text-left font-medium text-(--muted)">
                {t("window.database.size")}
              </th>
              <th className="h-[26px] border-b border-r border-(--line) bg-(--surface-bg) px-2 text-left font-medium text-(--muted)">
                {t("window.database.importedAt")}
              </th>
              <th className="h-[26px] border-b border-r border-(--line) bg-(--surface-bg) px-2 text-left font-medium text-(--muted)">
                SHA256
              </th>
            </tr>
          </thead>
          <tbody>
            {databasePage?.files.length ? (
              databasePage.files.map((file) => (
                <tr key={file.id}>
                  <td className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2 text-left text-(--ink)">
                    {file.id}
                  </td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2 text-left text-(--ink)">
                    {file.extension ?? "-"}
                  </td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2 text-left text-(--ink)">
                    {formatBytes(file.sizeBytes)}
                  </td>
                  <td
                    className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2 text-left text-(--ink)"
                    title={file.importedAt}
                  >
                    {formatDate(file.importedAt)}
                  </td>
                  <td
                    className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2 text-left text-(--ink)"
                    title={file.sha256}
                  >
                    {file.sha256}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="h-[26px] px-2 text-(--muted)" colSpan={5}>
                  {t("window.database.noRecords")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex h-8 items-center justify-between border-t border-(--line) px-2 text-(--muted)">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {t("window.database.pageSummary", {
            page: databasePage?.page ?? 1,
            totalPages: databaseTotalPages,
            total: databasePage?.total ?? 0,
            message,
          })}
        </span>
        <div className="flex gap-1.5">
          <button
            className="ui-button ui-button-md"
            disabled={!databasePage || databasePage.page <= 1}
            type="button"
            onClick={goToPreviousDatabasePage}
          >
            {t("window.database.previous")}
          </button>
          <button
            className="ui-button ui-button-md"
            disabled={!databasePage || databasePage.page >= databaseTotalPages}
            type="button"
            onClick={goToNextDatabasePage}
          >
            {t("window.database.next")}
          </button>
        </div>
      </footer>
    </section>
  );
}
