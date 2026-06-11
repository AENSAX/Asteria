import { useState } from "react";
import { Icon } from "./Icon";

export const managerShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[180px_minmax(0,1fr)] bg-(--panel)";

interface ManagerSidebarProps<T> {
  headerLabel: string;
  headerExtra?: string;
  items: T[];
  activeId: number | null;
  getId: (item: T) => number;
  getLabel: (item: T) => string;
  getCount: (item: T) => number;
  isMarked?: (item: T) => boolean;
  createInputLabel: string;
  createPlaceholder: string;
  createButtonLabel: string;
  onSelect: (id: number) => void;
  onCreate: (name: string) => Promise<boolean>;
}

export function ManagerSidebar<T>({
  headerLabel,
  headerExtra,
  items,
  activeId,
  getId,
  getLabel,
  getCount,
  isMarked,
  createInputLabel,
  createPlaceholder,
  createButtonLabel,
  onSelect,
  onCreate,
}: ManagerSidebarProps<T>): JSX.Element {
  const [createInput, setCreateInput] = useState("");

  async function create(): Promise<void> {
    if (!createInput.trim()) {
      return;
    }

    if (await onCreate(createInput)) {
      setCreateInput("");
    }
  }

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-(--line) bg-(--surface-bg)">
      <header className="grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--line) bg-(--panel-strong) px-2 text-[12px] font-semibold">
        <span>{headerLabel}</span>
        {headerExtra ? (
          <span className="font-normal text-(--muted)">{headerExtra}</span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {items.map((item) => {
          const id = getId(item);

          return (
            <button
              className={`grid min-h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_42px] items-center border-0 border-b border-(--line) bg-transparent px-2 text-left text-[12px] text-(--ink) ${
                id === activeId ? "bg-(--surface-raised-bg)" : ""
              }`}
              aria-current={id === activeId ? "true" : undefined}
              key={id}
              type="button"
              onClick={() => onSelect(id)}
            >
              <span className="grid place-items-center text-(--success-ink)">
                {isMarked?.(item) ? <Icon name="check" size={12} /> : null}
              </span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {getLabel(item)}
              </span>
              <span className="text-right text-(--muted)">
                {getCount(item)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-(--line) p-2">
        <input
          className="ui-input"
          aria-label={createInputLabel}
          placeholder={createPlaceholder}
          value={createInput}
          onChange={(event) => setCreateInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void create();
            }
          }}
        />
        <button
          className="ui-button ui-button-md"
          type="button"
          onClick={() => void create()}
        >
          {createButtonLabel}
        </button>
      </div>
    </aside>
  );
}
