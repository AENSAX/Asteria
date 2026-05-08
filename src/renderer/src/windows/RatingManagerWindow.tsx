import { useEffect, useState } from 'react';
import type { RatingEntryRecord, RatingGroupRecord } from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';
import { ResizableColumns } from '../components/ResizableColumns';

const defaultEntryColor = '#d9dde1';

export function RatingManagerWindow(): JSX.Element {
  const [groups, setGroups] = useState<RatingGroupRecord[]>([]);
  const [entries, setEntries] = useState<RatingEntryRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupInput, setGroupInput] = useState('');
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [entryInput, setEntryInput] = useState('');
  const [entryColor, setEntryColor] = useState(defaultEntryColor);
  const [draggingEntryId, setDraggingEntryId] = useState<number | null>(null);
  const [message, setMessage] = useState('未加载');
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    setSelectedGroupName(selectedGroup?.name ?? '');
    void loadEntries();
  }, [selectedGroupId]);

  async function loadGroups(nextSelectedGroupId?: number): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const nextGroups = await window.asteria.listRatingGroups();
    const nextSelectedId =
      nextSelectedGroupId ??
      (selectedGroupId && nextGroups.some((group) => group.id === selectedGroupId)
        ? selectedGroupId
        : nextGroups[0]?.id ?? null);

    setGroups(nextGroups);
    setSelectedGroupId(nextSelectedId);
    setMessage(`${nextGroups.length} 个分级`);
  }

  async function loadEntries(): Promise<void> {
    if (!window.asteria || selectedGroupId === null) {
      setEntries([]);
      return;
    }

    setEntries(await window.asteria.listRatingEntries(selectedGroupId));
  }

  async function createGroup(): Promise<void> {
    if (!window.asteria || !groupInput.trim()) {
      return;
    }

    const nextGroups = await window.asteria.createRatingGroup(groupInput);
    const createdGroup = nextGroups.find((group) => group.name === groupInput.trim()) ?? nextGroups[0];
    setGroups(nextGroups);
    setSelectedGroupId(createdGroup?.id ?? null);
    setGroupInput('');
  }

  async function renameGroup(): Promise<void> {
    if (!window.asteria || selectedGroupId === null || !selectedGroupName.trim()) {
      return;
    }

    const nextGroups = await window.asteria.renameRatingGroup(selectedGroupId, selectedGroupName);
    setGroups(nextGroups);
    setMessage('已重命名');
  }

  async function toggleGroupActive(group: RatingGroupRecord): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextGroups = await window.asteria.setRatingGroupActive(group.id, !group.isActive);
    setGroups(nextGroups);
  }

  async function deleteGroup(): Promise<void> {
    if (!window.asteria || selectedGroupId === null) {
      return;
    }

    const nextGroups = await window.asteria.deleteRatingGroup(selectedGroupId);
    setGroups(nextGroups);
    setSelectedGroupId(nextGroups[0]?.id ?? null);
    setMessage('已删除分级');
  }

  async function createEntry(): Promise<void> {
    if (!window.asteria || selectedGroupId === null || !entryInput.trim()) {
      return;
    }

    const nextEntries = await window.asteria.createRatingEntry(selectedGroupId, entryInput, entryColor);
    setEntries(nextEntries);
    setEntryInput('');
    setEntryColor(defaultEntryColor);
    setMessage('已新建条目');
    await loadGroups(selectedGroupId);
  }

  async function updateEntry(entry: RatingEntryRecord, label: string, color: string): Promise<void> {
    if (!window.asteria || !label.trim()) {
      return;
    }

    setEntries(await window.asteria.updateRatingEntry(entry.id, label, color));
  }

  async function deleteEntry(entryId: number): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setEntries(await window.asteria.deleteRatingEntry(entryId));
    await loadGroups(selectedGroupId ?? undefined);
  }

  async function moveEntryBefore(targetEntryId: number): Promise<void> {
    if (!window.asteria || selectedGroupId === null || draggingEntryId === null || draggingEntryId === targetEntryId) {
      setDraggingEntryId(null);
      return;
    }

    const draggingEntry = entries.find((entry) => entry.id === draggingEntryId);

    if (!draggingEntry) {
      setDraggingEntryId(null);
      return;
    }

    const withoutDragging = entries.filter((entry) => entry.id !== draggingEntryId);
    const targetIndex = withoutDragging.findIndex((entry) => entry.id === targetEntryId);

    if (targetIndex < 0) {
      setDraggingEntryId(null);
      return;
    }

    const nextEntries = [
      ...withoutDragging.slice(0, targetIndex),
      draggingEntry,
      ...withoutDragging.slice(targetIndex)
    ];

    setEntries(nextEntries);
    setEntries(await window.asteria.reorderRatingEntries(selectedGroupId, nextEntries.map((entry) => entry.id)));
    setMessage('已调整顺序');
    setDraggingEntryId(null);
  }

  return (
    <ResizableColumns
      className="rating-manager-window"
      defaultLeftWidth={180}
      minLeftWidth={130}
      minRightWidth={380}
      storageKey="asteria:rating-manager-sidebar-width"
      left={(
        <aside className="rating-group-panel">
        <header>分级</header>
        <div className="rating-group-list">
          {groups.map((group) => (
            <button
              className={group.id === selectedGroupId ? 'rating-group-item active' : 'rating-group-item'}
              key={group.id}
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
            >
              <span className="rating-active-mark">{group.isActive ? '√' : ''}</span>
              <span>{group.name}</span>
              <span>{group.entryCount}</span>
            </button>
          ))}
        </div>
        <div className="rating-group-create">
          <input
            aria-label="新建分级"
            placeholder="输入分级以新建"
            value={groupInput}
            onChange={(event) => setGroupInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void createGroup();
              }
            }}
          />
          <button type="button" onClick={() => void createGroup()}>
            新建
          </button>
        </div>
        </aside>
      )}
      right={(
        <main className="rating-manager-content">
        <header className="rating-manager-toolbar">
          <div className="rating-group-edit-row">
            <input
              aria-label="分级名称"
              placeholder="输入分级名称"
              value={selectedGroupName}
              onChange={(event) => setSelectedGroupName(event.target.value)}
            />
            <button disabled={!selectedGroup} type="button" onClick={() => void renameGroup()}>
              重命名
            </button>
            <button disabled={!selectedGroup} type="button" onClick={() => selectedGroup && void toggleGroupActive(selectedGroup)}>
              {selectedGroup?.isActive ? '停用' : '激活'}
            </button>
            <button disabled={!selectedGroup} type="button" onClick={() => void deleteGroup()}>
              删除
            </button>
          </div>

          <div className="rating-entry-create-row">
            <input
              aria-label="新建条目"
              placeholder="输入分级条目"
              value={entryInput}
              onChange={(event) => setEntryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void createEntry();
                }
              }}
            />
            <input
              aria-label="条目颜色"
              type="color"
              value={entryColor}
              onChange={(event) => setEntryColor(event.target.value)}
            />
            <button disabled={!selectedGroup} type="button" onClick={() => void createEntry()}>
              新建条目
            </button>
            <span>{message}</span>
          </div>
        </header>

        <div className="rating-entry-list">
          {entries.length > 0 ? (
            entries.map((entry) => (
              <RatingEntryRow
                dragging={draggingEntryId === entry.id}
                entry={entry}
                key={entry.id}
                onDelete={deleteEntry}
                onDragEnd={() => setDraggingEntryId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => setDraggingEntryId(entry.id)}
                onDrop={() => void moveEntryBefore(entry.id)}
                onUpdate={updateEntry}
              />
            ))
          ) : (
            <div className="rating-entry-empty">没有条目</div>
          )}
        </div>
        </main>
      )}
    />
  );
}

interface RatingEntryRowProps {
  entry: RatingEntryRecord;
  dragging: boolean;
  onUpdate: (entry: RatingEntryRecord, label: string, color: string) => Promise<void>;
  onDelete: (entryId: number) => Promise<void>;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function RatingEntryRow({
  dragging,
  entry,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: RatingEntryRowProps): JSX.Element {
  const [label, setLabel] = useState(entry.label);
  const [color, setColor] = useState(entry.color);

  useEffect(() => {
    setLabel(entry.label);
    setColor(entry.color);
  }, [entry]);

  return (
    <div
      className={dragging ? 'rating-entry-row dragging' : 'rating-entry-row'}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span
        className="rating-entry-drag-handle"
        draggable
        title="拖动调整顺序"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
      >
        ::
      </span>
      <span className="rating-entry-swatch" style={{ background: entry.color }} />
      <input
        aria-label="条目文字"
        placeholder="输入条目文字"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <input
        aria-label="条目颜色"
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <ActionFeedbackButton
        className="rating-entry-action"
        label="保存"
        onAction={() => onUpdate(entry, label, color)}
      />
      <button className="rating-entry-action" type="button" onClick={() => void onDelete(entry.id)}>
        删除
      </button>
    </div>
  );
}
