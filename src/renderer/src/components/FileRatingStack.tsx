import type {
  FileRatingRecord,
  RatingEntryRecord,
  RatingGroupRecord,
} from "../../../shared/ipc";

interface FileRatingStackProps {
  ratings: FileRatingRecord[];
  groups?: RatingGroupRecord[];
  entriesByGroupId?: Map<number, RatingEntryRecord[]>;
  className?: string;
  interactive?: boolean;
  onChange?: (group: RatingGroupRecord, entry: RatingEntryRecord) => void;
}

export function FileRatingStack({
  className = "",
  entriesByGroupId,
  groups,
  interactive = false,
  onChange,
  ratings,
}: FileRatingStackProps): JSX.Element | null {
  const visibleGroups = interactive
    ? (groups ?? []).filter(
        (group) => (entriesByGroupId?.get(group.id)?.length ?? 0) > 0,
      )
    : [];

  if (!interactive && ratings.length === 0) {
    return null;
  }

  if (interactive && visibleGroups.length === 0 && ratings.length === 0) {
    return null;
  }

  return (
    <div
      className={[
        "absolute left-1 top-1 z-[2] grid max-w-[calc(100%-8px)] justify-items-start gap-0.5",
        interactive ? "" : "pointer-events-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        if (interactive) {
          event.stopPropagation();
        }
      }}
      onMouseDown={(event) => {
        if (interactive) {
          event.stopPropagation();
        }
      }}
    >
      {interactive
        ? visibleGroups.map((group) => {
            const entries = entriesByGroupId?.get(group.id) ?? [];
            const currentRating =
              ratings.find((rating) => rating.groupId === group.id) ?? null;
            const currentEntry =
              entries.find((entry) => entry.id === currentRating?.entryId) ??
              entries[0];

            if (!currentEntry) {
              return null;
            }

            return (
              <label
                className="grid min-h-[18px] max-w-full grid-cols-[auto_minmax(0,1fr)_16px] border border-(--line-strong) bg-(--surface-inset-bg) text-[10px] text-(--ink)"
                key={group.id}
              >
                <span className="min-w-0 px-1 leading-[16px]">
                  {group.name}:
                </span>
                <span
                  className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 leading-[16px]"
                  style={{ color: currentEntry.color }}
                >
                  {currentEntry.label}
                </span>
                <select
                  aria-label={group.name}
                  className="h-[16px] w-[16px] border-0 bg-transparent text-transparent outline-none"
                  value={currentEntry.id}
                  onChange={(event) => {
                    const entryId = Number(event.target.value);
                    const entry = entries.find((item) => item.id === entryId);

                    if (entry) {
                      onChange?.(group, entry);
                    }
                  }}
                >
                  {entries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })
        : ratings.map((rating) => (
            <div
              className="grid min-h-[18px] max-w-full grid-cols-[auto_minmax(0,1fr)] border border-(--line-strong) bg-(--surface-inset-bg) text-[10px] text-(--ink)"
              key={`${rating.groupId}-${rating.entryId}`}
            >
              <span className="min-w-0 px-1 leading-[16px]">
                {rating.groupName}:
              </span>
              <span
                className="min-w-0 px-1 leading-[16px]"
                style={{ color: rating.color }}
              >
                {rating.label}
              </span>
            </div>
          ))}
    </div>
  );
}
