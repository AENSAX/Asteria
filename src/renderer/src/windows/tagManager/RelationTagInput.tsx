import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../../utils/tags";
import { TagSuggestionList } from "../../components/TagSuggestionList";
import {
  managerButtonClass,
  relationInputClass,
  relationInputShellClass,
  tagPillClass,
} from "./classNames";
import type { RelationTagInputController } from "./useRelationTagInput";

interface RelationTagInputProps {
  controller: RelationTagInputController;
  selectionScope: string;
  ariaLabel: string;
  placeholder: string;
  buttonLabel: string;
  actionDisabled: boolean;
  onAction: () => void;
  inputDisabled?: boolean;
  disabledPlaceholder?: string;
}

export function RelationTagInput({
  controller,
  selectionScope,
  ariaLabel,
  placeholder,
  buttonLabel,
  actionDisabled,
  onAction,
  inputDisabled = false,
  disabledPlaceholder = "",
}: RelationTagInputProps): JSX.Element {
  return (
    <div
      className={relationInputShellClass}
      data-tag-selection-scope={selectionScope}
    >
      {!inputDisabled ? (
        <TagSuggestionList
          className="absolute left-1 right-[74px] top-[31px] z-[6]"
          selectedIndex={controller.selectedSuggestionIndex}
          suggestions={controller.suggestions}
          onPick={controller.addToken}
        />
      ) : null}
      <div className={relationInputClass}>
        {controller.tokens.map((token) => (
          <span
            className={getTagNamespaceClassName(token, tagPillClass)}
            key={token.id}
            style={getTagNamespaceStyle(token)}
            title={formatTagLabel(token)}
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {formatTagLabel(token)}
            </span>
          </span>
        ))}
        <input
          aria-label={ariaLabel}
          disabled={inputDisabled}
          placeholder={
            inputDisabled
              ? disabledPlaceholder
              : controller.tokens.length === 0
                ? placeholder
                : ""
          }
          value={controller.text}
          onChange={(event) => controller.setText(event.target.value)}
          onKeyDown={controller.handleKeyDown}
        />
      </div>
      <button
        className={managerButtonClass}
        disabled={
          actionDisabled ||
          controller.tokens.length === 0 ||
          Boolean(controller.text.trim())
        }
        type="button"
        onClick={onAction}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
