import type { TagRecord } from "../../../shared/ipc";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
  type TagToken,
} from "../utils/tags";

interface TagTokenInputProps {
  ariaLabel: string;
  placeholder: string;
  tokens: TagToken[];
  text: string;
  suggestions: TagRecord[];
  selectedSuggestionIndex: number;
  onTextChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onPickSuggestion: (tag: TagRecord) => void;
}

export function TagTokenInput({
  ariaLabel,
  placeholder,
  tokens,
  text,
  suggestions,
  selectedSuggestionIndex,
  onTextChange,
  onKeyDown,
  onPickSuggestion,
}: TagTokenInputProps): JSX.Element {
  return (
    <div className="relative min-w-0 border-t border-(--line) bg-(--surface-input-panel-bg)">
      {suggestions.length > 0 ? (
        <div className="absolute bottom-full left-[-1px] right-[-1px] z-[4] border border-(--line-strong) bg-(--panel)">
          {suggestions.map((tag, index) => (
            <button
              className={getTagNamespaceClassName(
                tag,
                index === selectedSuggestionIndex
                  ? "block h-6 w-full border-0 border-b border-(--line) bg-(--accent-weak) px-1.5 text-left text-[11px] text-(--ink)"
                  : "block h-6 w-full border-0 border-b border-(--line) bg-transparent px-1.5 text-left text-[11px] text-(--ink)",
              )}
              key={tag.id}
              style={getTagNamespaceStyle(tag)}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onPickSuggestion(tag);
              }}
            >
              {formatTagLabel(tag)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-[30px] flex-wrap items-center gap-1 p-1">
        {tokens.map((token) => (
          <span
            className={getTagNamespaceClassName(
              token,
              "inline-flex min-h-[18px] max-w-full overflow-hidden border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[11px] text-(--ink)",
            )}
            key={token.key}
            style={getTagNamespaceStyle(token)}
          >
            {formatTagLabel(token)}
          </span>
        ))}
        <input
          className="h-5 min-w-[48px] flex-1 border-0 bg-transparent p-0 text-(--ink) outline-0"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
