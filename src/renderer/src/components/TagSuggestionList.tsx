import {
  formatTagLabel,
  getSearchTokenStyle,
  getTagNamespaceClassName,
} from "../utils/tags";

export interface TagSuggestionItem {
  id: number;
  namespace: string;
  name: string;
  displayName?: string | null;
  fileCount?: number | null;
  color?: string | null;
  kind?: string;
}

interface TagSuggestionListProps<T extends TagSuggestionItem> {
  suggestions: T[];
  selectedIndex: number | null;
  className: string;
  onPick: (tag: T) => void;
}

const suggestionRowClass =
  "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 cursor-default border-0 border-b border-(--line) bg-transparent px-1.5 text-left text-[12px] text-(--ink) last:border-b-0 hover:bg-(--accent-weak)";
const suggestionRowActiveClass = `${suggestionRowClass} bg-(--accent-weak)`;

export function TagSuggestionList<T extends TagSuggestionItem>({
  suggestions,
  selectedIndex,
  className,
  onPick,
}: TagSuggestionListProps<T>): JSX.Element | null {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={`ui-popover ${className}`}>
      {suggestions.map((tag, index) => (
        <button
          className={getTagNamespaceClassName(
            tag,
            index === selectedIndex
              ? suggestionRowActiveClass
              : suggestionRowClass,
          )}
          key={`${tag.kind ?? "tag"}-${tag.id}`}
          style={getSearchTokenStyle(tag)}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(tag);
          }}
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {formatTagLabel(tag)}
          </span>
          <span className="min-w-0 overflow-hidden text-right text-ellipsis whitespace-nowrap text-(--muted)">
            {tag.fileCount ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}
