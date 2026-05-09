import { useEffect, useState } from "react";
import type { RatingEntryRecord, RatingGroupRecord } from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";
import { useLanguage } from "../utils/language";

const defaultEntryColor = "#d9dde1";
const managerShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[180px_minmax(0,1fr)] bg-(--panel)";
const sidebarClass =
  "flex min-h-0 min-w-0 flex-col border-r border-(--line) bg-(--surface-bg)";
const sidebarHeaderClass =
  "h-7 border-b border-(--line) bg-(--panel-strong) px-2 leading-7 text-[11px] font-semibold";
const listClass = "min-h-0 overflow-auto";
const sidebarItemClass =
  "grid min-h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_42px] items-center border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px] text-(--ink)";
const sidebarItemActiveClass = "bg-(--surface-raised-bg)";
const createRowClass =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-(--line) p-2";
const inputClass =
  "h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)";
const buttonClass =
  "h-6 min-w-[72px] cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)";
const panelClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-(--panel)";
const toolbarClass = "grid gap-1 border-b border-(--line) bg-(--panel) p-2";
const groupEditRowClass =
  "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5";
const entryCreateRowClass =
  "grid grid-cols-[minmax(0,1fr)_24px_minmax(72px,auto)_minmax(0,1fr)] gap-1.5 items-center";
const entryCountClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)";
const entryListClass = "min-h-0 overflow-auto bg-(--surface-bg) p-2";
const emptyClass = "p-2 text-(--muted)";
const entryRowClass =
  "grid grid-cols-[18px_18px_minmax(0,1fr)_24px_auto_auto] items-center gap-1.5 border-b border-(--line) px-2 py-1 text-[11px]";
const entryRowDraggingClass = "bg-(--selection-bg)";
const dragHandleClass = "cursor-grab text-center text-(--muted)";
const swatchClass = "h-4 w-4 border border-(--line-strong)";
const entryActionClass =
  "h-6 min-w-[56px] cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)";

export function RatingManagerWindow(): JSX.Element {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<RatingGroupRecord[]>([]);
  const [entries, setEntries] = useState<RatingEntryRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupInput, setGroupInput] = useState("");
  const [selectedGroupName, setSelectedGroupName] = useState("");
  const [entryInput, setEntryInput] = useState("");
  const [entryColor, setEntryColor] = useState(defaultEntryColor);
  const [draggingEntryId, setDraggingEntryId] = useState<number | null>(null);
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    setSelectedGroupName(selectedGroup?.name ?? "");
    void loadEntries();
  }, [selectedGroupId]);

  async function loadGroups(nextSelectedGroupId?: number): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextGroups = await window.asteria.listRatingGroups();
    const nextSelectedId =
      nextSelectedGroupId ??
      (selectedGroupId &&
      nextGroups.some((group) => group.id === selectedGroupId)
        ? selectedGroupId
        : (nextGroups[0]?.id ?? null));

    setGroups(nextGroups);
    setSelectedGroupId(nextSelectedId);
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
    const createdGroup =
      nextGroups.find((group) => group.name === groupInput.trim()) ??
      nextGroups[0];
    setGroups(nextGroups);
    setSelectedGroupId(createdGroup?.id ?? null);
    setGroupInput("");
  }

  async function renameGroup(): Promise<void> {
    if (
      !window.asteria ||
      selectedGroupId === null ||
      !selectedGroupName.trim()
    ) {
      return;
    }

    const nextGroups = await window.asteria.renameRatingGroup(
      selectedGroupId,
      selectedGroupName,
    );
    setGroups(nextGroups);
  }

  async function toggleGroupActive(group: RatingGroupRecord): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextGroups = await window.asteria.setRatingGroupActive(
      group.id,
      !group.isActive,
    );
    setGroups(nextGroups);
  }

  async function deleteGroup(): Promise<void> {
    if (!window.asteria || selectedGroupId === null) {
      return;
    }

    const nextGroups = await window.asteria.deleteRatingGroup(selectedGroupId);
    setGroups(nextGroups);
    setSelectedGroupId(nextGroups[0]?.id ?? null);
  }

  async function createEntry(): Promise<void> {
    if (!window.asteria || selectedGroupId === null || !entryInput.trim()) {
      return;
    }

    const nextEntries = await window.asteria.createRatingEntry(
      selectedGroupId,
      entryInput,
      entryColor,
    );
    setEntries(nextEntries);
    setEntryInput("");
    setEntryColor(defaultEntryColor);
    await loadGroups(selectedGroupId);
  }

  async function updateEntry(
    entry: RatingEntryRecord,
    label: string,
    color: string,
  ): Promise<void> {
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
    if (
      !window.asteria ||
      selectedGroupId === null ||
      draggingEntryId === null ||
      draggingEntryId === targetEntryId
    ) {
      setDraggingEntryId(null);
      return;
    }

    const draggingEntry = entries.find((entry) => entry.id === draggingEntryId);

    if (!draggingEntry) {
      setDraggingEntryId(null);
      return;
    }

    const withoutDragging = entries.filter(
      (entry) => entry.id !== draggingEntryId,
    );
    const targetIndex = withoutDragging.findIndex(
      (entry) => entry.id === targetEntryId,
    );

    if (targetIndex < 0) {
      setDraggingEntryId(null);
      return;
    }

    const nextEntries = [
      ...withoutDragging.slice(0, targetIndex),
      draggingEntry,
      ...withoutDragging.slice(targetIndex),
    ];

    setEntries(nextEntries);
    setEntries(
      await window.asteria.reorderRatingEntries(
        selectedGroupId,
        nextEntries.map((entry) => entry.id),
      ),
    );
    setDraggingEntryId(null);
  }

  return (
    <ResizableColumns
      className={managerShellClass}
      defaultLeftWidth={180}
      minLeftWidth={130}
      minRightWidth={380}
      storageKey="asteria:rating-manager-sidebar-width"
      left={
        <aside className={sidebarClass}>
          <header className={sidebarHeaderClass}>{t("window.rating.group")}</header>
          <div className={listClass}>
            {groups.map((group) => (
              <button
                className={`${sidebarItemClass} ${group.id === selectedGroupId ? sidebarItemActiveClass : ""}`}
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
              >
                <span className="text-center text-(--success-ink)">
                  {group.isActive ? "√" : ""}
                </span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {group.name}
                </span>
                <span className="text-right text-(--muted)">
                  {group.entryCount}
                </span>
              </button>
            ))}
          </div>
          <div className={createRowClass}>
            <input
              className={inputClass}
              aria-label={t("window.rating.createInput")}
              placeholder={t("window.rating.createPlaceholder")}
              value={groupInput}
              onChange={(event) => setGroupInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void createGroup();
                }
              }}
            />
            <button type="button" onClick={() => void createGroup()}>
              {t("window.rating.create")}
            </button>
          </div>
        </aside>
      }
      right={
        <main className={panelClass}>
          <header className={toolbarClass}>
            <div className={groupEditRowClass}>
              <input
                className={inputClass}
                aria-label={t("window.rating.name")}
                placeholder={t("window.rating.namePlaceholder")}
                value={selectedGroupName}
                onChange={(event) => setSelectedGroupName(event.target.value)}
              />
              <button
                disabled={!selectedGroup}
                type="button"
                onClick={() => void renameGroup()}
              >
                {t("window.rating.rename")}
              </button>
              <button
                disabled={!selectedGroup}
                type="button"
                onClick={() =>
                  selectedGroup && void toggleGroupActive(selectedGroup)
                }
              >
                {selectedGroup?.isActive ? t("window.rating.deactivate") : t("window.rating.activate")}
              </button>
              <button
                disabled={!selectedGroup}
                type="button"
                onClick={() => void deleteGroup()}
              >
                {t("window.rating.delete")}
              </button>
            </div>

            <div className={entryCreateRowClass}>
              <input
                className={inputClass}
                aria-label={t("window.rating.entryInput")}
                placeholder={t("window.rating.entryPlaceholder")}
                value={entryInput}
                onChange={(event) => setEntryInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void createEntry();
                  }
                }}
              />
              <input
                className="h-6 w-6 border border-(--line-strong) bg-(--surface-inset-bg) p-0"
                aria-label={t("window.rating.entryColor")}
                type="color"
                value={entryColor}
                onChange={(event) => setEntryColor(event.target.value)}
              />
              <button
                className={buttonClass}
                disabled={!selectedGroup}
                type="button"
                onClick={() => void createEntry()}
              >
                {t("window.rating.entryCreate")}
              </button>
              <span className={`${entryCountClass} justify-self-end`}>
                {t("window.rating.entryCount", { count: entries.length })}
              </span>
            </div>
          </header>

          <div className={entryListClass}>
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
              <div className={emptyClass}>{t("common.noEntries")}</div>
            )}
          </div>
        </main>
      }
    />
  );
}

interface RatingEntryRowProps {
  entry: RatingEntryRecord;
  dragging: boolean;
  onUpdate: (
    entry: RatingEntryRecord,
    label: string,
    color: string,
  ) => Promise<void>;
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
  onDragEnd,
}: RatingEntryRowProps): JSX.Element {
  const { t } = useLanguage();
  const [label, setLabel] = useState(entry.label);
  const [color, setColor] = useState(entry.color);

  useEffect(() => {
    setLabel(entry.label);
    setColor(entry.color);
  }, [entry]);

  return (
    <div
      className={`${entryRowClass} ${dragging ? entryRowDraggingClass : ""}`}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span
        className={dragHandleClass}
        draggable
        title={t("window.rating.dragHint")}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
      >
        ::
      </span>
      <span className={swatchClass} style={{ background: entry.color }} />
      <input
        className={inputClass}
        aria-label={t("window.rating.entryInput")}
        placeholder={t("window.rating.entryPlaceholder")}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <input
        className="h-6 w-6 border border-(--line-strong) bg-(--surface-inset-bg) p-0"
        aria-label={t("window.rating.entryColor")}
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <ActionFeedbackButton
        className={entryActionClass}
        label={t("common.save")}
        onAction={() => onUpdate(entry, label, color)}
      />
      <button
        className={entryActionClass}
        type="button"
        onClick={() => void onDelete(entry.id)}
      >
        {t("window.rating.delete")}
      </button>
    </div>
  );
}
