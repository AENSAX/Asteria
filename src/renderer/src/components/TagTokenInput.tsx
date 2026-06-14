import type { TagRecord } from "../../../shared/ipc";
import { TagSuggestionList } from "./TagSuggestionList";
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
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
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
  onPaste,
}: TagTokenInputProps): JSX.Element {
  return (
    <div className="relative min-w-0 border-t border-(--line) bg-(--surface-input-panel-bg)">
      <TagSuggestionList
        className="absolute bottom-full left-[-1px] right-[-1px] z-[4]"
        selectedIndex={selectedSuggestionIndex}
        suggestions={suggestions}
        onPick={onPickSuggestion}
      />

      <div
        className="flex min-h-[30px] flex-wrap items-center gap-1 p-1"
        data-file-detail-tag-input
      >
        {tokens.map((token) => (
          <span
            className={getTagNamespaceClassName(
              token,
              "inline-flex min-h-[18px] max-w-full overflow-hidden rounded-(--radius) border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[12px] text-(--ink)",
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
          onPaste={onPaste}
        />
      </div>
    </div>
  );
}
