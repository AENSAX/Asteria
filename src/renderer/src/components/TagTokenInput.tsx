import type { TagRecord } from '../../../shared/ipc';
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
  type TagToken
} from '../utils/tags';

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
  onPickSuggestion
}: TagTokenInputProps): JSX.Element {
  return (
    <div className="tag-input-area">
      {suggestions.length > 0 ? (
        <div className="tag-suggestions">
          {suggestions.map((tag, index) => (
            <button
              className={getTagNamespaceClassName(
                tag,
                index === selectedSuggestionIndex ? 'tag-suggestion selected' : 'tag-suggestion'
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

      <div className="tag-token-input">
        {tokens.map((token) => (
          <span
            className={getTagNamespaceClassName(token, 'tag-token')}
            key={token.key}
            style={getTagNamespaceStyle(token)}
          >
            {formatTagLabel(token)}
          </span>
        ))}
        <input
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
