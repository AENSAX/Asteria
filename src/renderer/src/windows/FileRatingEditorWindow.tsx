import { useEffect, useMemo, useState } from 'react';
import type {
  BrowserFileRecord,
  RatingEntryRecord,
  RatingGroupRecord
} from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';
import { useShortcut } from '../hooks/useShortcut';

interface FileRatingEditorWindowProps {
  fileIds: number[];
  groupId: number;
}

export function FileRatingEditorWindow({
  fileIds,
  groupId
}: FileRatingEditorWindowProps): JSX.Element {
  const [group, setGroup] = useState<RatingGroupRecord | null>(null);
  const [entries, setEntries] = useState<RatingEntryRecord[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [message, setMessage] = useState('加载中');

  const normalizedFileIds = useMemo(
    () => [...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0))],
    [fileIds]
  );

  useEffect(() => {
    void loadEditorState();
  }, [groupId, normalizedFileIds.join(',')]);

  useShortcut('select-all', () => {
    setSelectedEntryIds(entries.map((entry) => entry.id));
  });

  async function loadEditorState(): Promise<void> {
    if (!window.asteria || normalizedFileIds.length === 0 || !Number.isInteger(groupId) || groupId <= 0) {
      setMessage('参数无效');
      return;
    }

    try {
      const [groups, nextEntries, browserFiles] = await Promise.all([
        window.asteria.listRatingGroups(),
        window.asteria.listRatingEntries(groupId),
        window.asteria.listBrowserFiles()
      ]);
      const nextGroup = groups.find((item) => item.id === groupId) ?? null;
      const selectedFiles = browserFiles.filter((file) => normalizedFileIds.includes(file.id));

      setGroup(nextGroup);
      setEntries(nextEntries);
      setSelectedEntryIds(resolveCommonEntryIds(nextEntries, selectedFiles, normalizedFileIds));
      setMessage(nextGroup ? '' : '分级不存在');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败');
    }
  }

  function toggleEntry(entryId: number): void {
    setSelectedEntryIds((currentIds) =>
      currentIds.includes(entryId)
        ? currentIds.filter((id) => id !== entryId)
        : [...currentIds, entryId]
    );
  }

  async function save(): Promise<void> {
    if (!window.asteria || !group) {
      return;
    }

    await window.asteria.setFileRatingEntries(normalizedFileIds, group.id, selectedEntryIds);
  }

  return (
    <section className="file-rating-editor-window">
      <div className="file-rating-editor-meta">
        <span>{group ? `分级:${group.name}` : '分级'}</span>
        <span>{normalizedFileIds.length} 个文件</span>
      </div>

      <div className="rating-select-list">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <label key={entry.id}>
              <input
                checked={selectedEntryIds.includes(entry.id)}
                type="checkbox"
                onChange={() => toggleEntry(entry.id)}
              />
              <span style={{ color: entry.color }}>{entry.label}</span>
            </label>
          ))
        ) : (
          <div className="rating-select-empty">{message || '没有条目'}</div>
        )}
      </div>

      <footer>
        <button type="button" onClick={() => window.close()}>
          取消
        </button>
        <ActionFeedbackButton
          afterFeedback={() => window.close()}
          disabled={!group || normalizedFileIds.length === 0}
          label="保存"
          onAction={save}
        />
      </footer>
    </section>
  );
}

function resolveCommonEntryIds(
  entries: RatingEntryRecord[],
  files: BrowserFileRecord[],
  expectedFileIds: number[]
): number[] {
  if (files.length !== expectedFileIds.length || files.length === 0) {
    return [];
  }

  return entries
    .filter((entry) =>
      files.every((file) => file.ratings.some((rating) => rating.entryId === entry.id))
    )
    .map((entry) => entry.id);
}
