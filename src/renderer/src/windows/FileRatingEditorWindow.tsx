import { useEffect, useMemo, useState } from "react";
import type {
  BrowserFileRecord,
  RatingEntryRecord,
  RatingGroupRecord,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { useShortcut } from "../hooks/useShortcut";
import { useLanguage } from "../utils/language";

interface FileRatingEditorWindowProps {
  fileIds: number[];
  groupId: number;
}

export function FileRatingEditorWindow({
  fileIds,
  groupId,
}: FileRatingEditorWindowProps): JSX.Element {
  const { t } = useLanguage();
  const [group, setGroup] = useState<RatingGroupRecord | null>(null);
  const [entries, setEntries] = useState<RatingEntryRecord[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [message, setMessage] = useState(() => t("common.loading"));

  const normalizedFileIds = useMemo(
    () => [...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0))],
    [fileIds],
  );

  useEffect(() => {
    void loadEditorState();
  }, [groupId, normalizedFileIds.join(",")]);

  useShortcut("select-all", () => {
    setSelectedEntryIds(entries.map((entry) => entry.id));
  });

  async function loadEditorState(): Promise<void> {
    if (
      !window.asteria ||
      normalizedFileIds.length === 0 ||
      !Number.isInteger(groupId) ||
      groupId <= 0
    ) {
      setMessage(t("window.fileRating.invalid"));
      return;
    }

    try {
      const [groups, nextEntries, browserFiles] = await Promise.all([
        window.asteria.listRatingGroups(),
        window.asteria.listRatingEntries(groupId),
        window.asteria.listBrowserFiles(),
      ]);
      const nextGroup = groups.find((item) => item.id === groupId) ?? null;
      const selectedFiles = browserFiles.filter((file) =>
        normalizedFileIds.includes(file.id),
      );

      setGroup(nextGroup);
      setEntries(nextEntries);
      setSelectedEntryIds(
        resolveCommonEntryIds(nextEntries, selectedFiles, normalizedFileIds),
      );
      setMessage(nextGroup ? "" : t("window.fileRating.missing"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("window.fileRating.loadFailed"),
      );
    }
  }

  function toggleEntry(entryId: number): void {
    setSelectedEntryIds((currentIds) =>
      currentIds.includes(entryId)
        ? currentIds.filter((id) => id !== entryId)
        : [...currentIds, entryId],
    );
  }

  async function save(): Promise<void> {
    if (!window.asteria || !group) {
      return;
    }

    await window.asteria.setFileRatingEntries(
      normalizedFileIds,
      group.id,
      selectedEntryIds,
    );
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_32px] bg-(--panel) text-[11px] text-(--ink)">
      <div className="flex items-center justify-between border-b border-(--line) bg-(--surface-bg) px-2 py-1 text-(--muted)">
        <span>
          {group
            ? t("window.fileRating.group") + `:${group.name}`
            : t("window.fileRating.group")}
        </span>
        <span>{t("window.fileRating.files", { count: normalizedFileIds.length })}</span>
      </div>

      <div className="min-h-0 overflow-auto p-2">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <label
              className="flex items-center gap-1.5 border-b border-(--line) py-1.5"
              key={entry.id}
            >
              <input
                checked={selectedEntryIds.includes(entry.id)}
                type="checkbox"
                onChange={() => toggleEntry(entry.id)}
              />
              <span style={{ color: entry.color }}>{entry.label}</span>
            </label>
          ))
        ) : (
          <div className="p-2 text-(--muted)">{message || t("common.noEntries")}</div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-1.5 border-t border-(--line) bg-(--surface-bg) px-2">
        <button
          className="h-6 cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px]"
          type="button"
          onClick={() => window.close()}
        >
          {t("window.fileRating.cancel")}
        </button>
        <ActionFeedbackButton
          className="h-6 cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px]"
          afterFeedback={() => window.close()}
          disabled={!group || normalizedFileIds.length === 0}
          label={t("window.fileRating.save")}
          onAction={save}
        />
      </footer>
    </section>
  );
}

function resolveCommonEntryIds(
  entries: RatingEntryRecord[],
  files: BrowserFileRecord[],
  expectedFileIds: number[],
): number[] {
  if (files.length !== expectedFileIds.length || files.length === 0) {
    return [];
  }

  return entries
    .filter((entry) =>
      files.every((file) =>
        file.ratings.some((rating) => rating.entryId === entry.id),
      ),
    )
    .map((entry) => entry.id);
}
