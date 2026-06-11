import { useEffect, useRef, useState } from "react";
import type { DatabaseFilePage } from "../../../shared/ipc";
import { Icon } from "../components/Icon";
import { useBoxSelection } from "../hooks/useBoxSelection";
import { useMultiSelection } from "../hooks/useMultiSelection";
import { useShortcut } from "../hooks/useShortcut";
import { useLanguage } from "../utils/language";
import { formatBytes, formatDate } from "../utils/format";

export function RecycleBinWindow(): JSX.Element {
  const { t } = useLanguage();
  const [page, setPage] = useState<DatabaseFilePage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pendingFileIds, setPendingFileIds] = useState<number[]>([]);
  const [lastPendingFileId, setLastPendingFileId] = useState<number | null>(
    null,
  );
  const [message, setMessage] = useState(() => t("window.recycle.loading"));
  const [bulkOperating, setBulkOperating] = useState(false);
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const totalPages = page
    ? Math.max(1, Math.ceil(page.total / page.pageSize))
    : 1;
  const boxSelection = useBoxSelection({
    containerRef: tableAreaRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: pendingFileIds,
    onSelect: setPendingFileIds,
    onLastSelectedId: setLastPendingFileId,
  });
  const rowSelection = useMultiSelection({
    items: page?.files ?? [],
    getId: (file) => file.id,
    selectedIds: pendingFileIds,
    lastSelectedId: lastPendingFileId,
    onSelect: setPendingFileIds,
    onLastSelectedId: setLastPendingFileId,
  });

  useEffect(() => {
    void loadPage(pageNumber);
  }, [pageNumber]);

  useShortcut("select-all", () => {
    const fileIds = page?.files.map((file) => file.id) ?? [];
    setPendingFileIds(fileIds);
    setLastPendingFileId(fileIds[fileIds.length - 1] ?? null);
  });
  useShortcut(
    "remove-selected",
    () => void deletePendingFiles(),
    { enabled: pendingFileIds.length > 0 },
  );

  async function loadPage(nextPageNumber: number): Promise<void> {
    if (!window.asteria) {
      setMessage(t("window.recycle.preloadUnavailable"));
      return;
    }

    const nextPage = await window.asteria.listTrashedFiles(nextPageNumber);
    setPage(nextPage);
    setPendingFileIds((currentIds) =>
      currentIds.filter((id) => nextPage.files.some((file) => file.id === id)),
    );
    setMessage(t("window.browser.fileCount", { count: nextPage.total }));
  }

  async function restorePendingFiles(): Promise<void> {
    if (!window.asteria || pendingFileIds.length === 0) {
      return;
    }

    try {
      await window.asteria.restoreFiles(pendingFileIds);
      setPendingFileIds([]);
      setLastPendingFileId(null);
      await loadPage(pageNumber);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function deletePendingFiles(): Promise<void> {
    if (!window.asteria || pendingFileIds.length === 0) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.deleteFilesPermanently", {
        count: pendingFileIds.length,
      }),
    });

    if (!confirmed) {
      return;
    }

    try {
      await window.asteria.deleteFilesPermanently(pendingFileIds);
      setPendingFileIds([]);
      setLastPendingFileId(null);
      await loadPage(pageNumber);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    }
  }

  async function collectAllTrashedFileIds(): Promise<number[]> {
    if (!window.asteria || !page) {
      return [];
    }

    const firstPage = await window.asteria.listTrashedFiles(1);
    const totalPageCount = Math.max(
      1,
      Math.ceil(firstPage.total / firstPage.pageSize),
    );
    const fileIds = firstPage.files.map((file) => file.id);

    for (
      let nextPageNumber = 2;
      nextPageNumber <= totalPageCount;
      nextPageNumber += 1
    ) {
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
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    } finally {
      setBulkOperating(false);
    }
  }

  async function deleteAllFiles(): Promise<void> {
    if (!window.asteria || !page || page.total === 0 || bulkOperating) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.clearRecycleBin", { count: page.total }),
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
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("common.operationFailed"),
      );
    } finally {
      setBulkOperating(false);
    }
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_32px] bg-(--panel)">
      <div
        className="relative min-h-0 min-w-0 overflow-auto"
        ref={tableAreaRef}
        onMouseDownCapture={boxSelection.handleMouseDownCapture}
      >
        <table className="w-full table-fixed border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="h-[26px] border-b border-r border-(--line) bg-(--surface-bg) px-2 text-left font-medium text-(--muted)">
                ID
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
            {page?.files.length ? (
              page.files.map((file, index) => (
                <tr
                  className={
                    pendingFileIds.includes(file.id)
                      ? "bg-(--danger-bg) text-(--danger-ink)"
                      : ""
                  }
                  data-box-select-id={file.id}
                  key={file.id}
                  onMouseDown={(event) =>
                    rowSelection.handleItemMouseDown(event, file, index)
                  }
                >
                  <td className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2">
                    {file.id}
                  </td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2">
                    {file.extension ?? "-"}
                  </td>
                  <td className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2">
                    {formatBytes(file.sizeBytes)}
                  </td>
                  <td
                    className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2"
                    title={file.importedAt}
                  >
                    {formatDate(file.importedAt)}
                  </td>
                  <td
                    className="h-[26px] overflow-hidden border-b border-r border-(--line) px-2"
                    title={file.sha256}
                  >
                    {file.sha256}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-2 text-(--muted)" colSpan={5}>
                {t("window.database.noRecords")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {boxSelection.selectionBox ? (
          <div
            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
            style={boxSelection.selectionBox}
          />
        ) : null}
      </div>

      <footer className="flex h-8 items-center justify-between border-t border-(--line) px-2 text-(--muted)">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {t("window.database.pageSummary", {
            page: page?.page ?? 1,
            totalPages,
            total: page?.total ?? 0,
            message,
          })}
        </span>
        <div className="flex gap-1.5">
          <button
            className="ui-button"
            disabled={pendingFileIds.length === 0}
            type="button"
            onClick={() => void restorePendingFiles()}
          >
            {t("window.recycle.restore")}
          </button>
          <button
            className="ui-button"
            disabled={pendingFileIds.length === 0}
            type="button"
            onClick={() => void deletePendingFiles()}
          >
            {t("window.recycle.delete")}
          </button>
          <button
            className="ui-button"
            disabled={!page || page.total === 0 || bulkOperating}
            type="button"
            onClick={() => void restoreAllFiles()}
          >
            {t("window.recycle.restoreAll")}
          </button>
          <button
            className="ui-button"
            disabled={!page || page.total === 0 || bulkOperating}
            type="button"
            onClick={() => void deleteAllFiles()}
          >
            {t("window.recycle.deleteAll")}
          </button>
          <button
            aria-label={t("window.recycle.previous")}
            className="ui-button ui-icon-button"
            disabled={!page || page.page <= 1}
            title={t("window.recycle.previous")}
            type="button"
            onClick={() => setPageNumber((value) => value - 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            aria-label={t("window.recycle.next")}
            className="ui-button ui-icon-button"
            disabled={!page || page.page >= totalPages}
            title={t("window.recycle.next")}
            type="button"
            onClick={() => setPageNumber((value) => value + 1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </footer>
    </section>
  );
}
