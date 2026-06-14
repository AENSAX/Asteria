import { useEffect, useState } from "react";
import type { RatingEntryRecord, RatingGroupRecord } from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import {
  buttonScopeClassNames,
  getButtonClassName,
} from "../components/Button";
import { Icon } from "../components/Icon";
import {
  ManagerSidebar,
  managerShellClass,
} from "../components/ManagerSidebar";
import { ResizableColumns } from "../components/ResizableColumns";
import { useLanguage } from "../utils/language";

const defaultEntryColor = "#d9dde1";
const inputClass =
  "ui-input";
const buttonClass = getButtonClassName({ size: "medium" });
const panelClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-(--panel)";
const toolbarClass = "grid gap-1 border-b border-(--line) bg-(--panel) p-2";
const groupEditRowClass =
  `${buttonScopeClassNames.default} grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5`;
const entryCreateRowClass =
  "grid grid-cols-[minmax(0,1fr)_24px_minmax(72px,auto)_minmax(0,1fr)] gap-1.5 items-center";
const entryCountClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)";
const entryListClass = "min-h-0 overflow-auto bg-(--surface-bg) p-2";
const emptyClass = "ui-empty";
const entryRowClass =
  "grid grid-cols-[18px_18px_minmax(0,1fr)_24px_auto_auto] items-center gap-1.5 border-b border-(--line) px-2 py-1 text-[12px]";
const entryRowDraggingClass = "bg-(--selection-bg)";
const dragHandleClass = "cursor-grab text-center text-(--muted)";
const swatchClass = "h-4 w-4 border border-(--line-strong)";
const entryActionClass = getButtonClassName({ size: "medium" });

export function RatingManagerWindow(): JSX.Element {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<RatingGroupRecord[]>([]);
  const [entries, setEntries] = useState<RatingEntryRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
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

  async function createGroup(name: string): Promise<boolean> {
    if (!window.asteria) {
      return false;
    }

    const nextGroups = await window.asteria.createRatingGroup(name);
    const createdGroup =
      nextGroups.find((group) => group.name === name.trim()) ?? nextGroups[0];
    setGroups(nextGroups);
    setSelectedGroupId(createdGroup?.id ?? null);
    return true;
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

    const groupName =
      groups.find((group) => group.id === selectedGroupId)?.name ?? "";
    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.deleteRatingGroup", { name: groupName }),
    });

    if (!confirmed) {
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

    const entryLabel =
      entries.find((entry) => entry.id === entryId)?.label ?? "";
    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.deleteRatingEntry", { label: entryLabel }),
    });

    if (!confirmed) {
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
        <ManagerSidebar
          activeId={selectedGroupId}
          createButtonLabel={t("common.create")}
          createInputLabel={t("window.rating.createInput")}
          createPlaceholder={t("window.rating.createPlaceholder")}
          getCount={(group) => group.entryCount}
          getId={(group) => group.id}
          getLabel={(group) => group.name}
          headerLabel={t("window.rating.group")}
          isMarked={(group) => group.isActive}
          items={groups}
          onCreate={createGroup}
          onSelect={setSelectedGroupId}
        />
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
                {t("common.rename")}
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
                {t("common.delete")}
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
        aria-label={t("common.delete")}
        className="ui-button ui-icon-button"
        title={t("common.delete")}
        type="button"
        onClick={() => void onDelete(entry.id)}
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}
