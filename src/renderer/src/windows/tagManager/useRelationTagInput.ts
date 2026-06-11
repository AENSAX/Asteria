import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ManagedTagRecord } from "../../../../shared/ipc";
import { createRelationSuggestions } from "./tagManagerData";

export interface RelationTagInputController {
  text: string;
  tokens: ManagedTagRecord[];
  selectedSuggestionIndex: number | null;
  suggestions: ManagedTagRecord[];
  setText: (value: string) => void;
  addToken: (tag: ManagedTagRecord) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  reset: () => void;
}

interface RelationTagInputOptions {
  tags: ManagedTagRecord[];
  excludedTagIds: number[];
  singleToken?: boolean;
  onSubmit: (tokens: ManagedTagRecord[]) => void;
}

interface RelationInputState {
  text: string;
  tokens: ManagedTagRecord[];
  selectedSuggestionIndex: number | null;
}

function createRelationInputState(): RelationInputState {
  return {
    text: "",
    tokens: [],
    selectedSuggestionIndex: null,
  };
}

export function useRelationTagInput({
  tags,
  excludedTagIds,
  singleToken = false,
  onSubmit,
}: RelationTagInputOptions): RelationTagInputController {
  const [input, setInput] = useState<RelationInputState>(
    createRelationInputState,
  );
  const suggestions = useMemo(
    () =>
      createRelationSuggestions(tags, input.text, input.tokens, excludedTagIds),
    [excludedTagIds, input.text, input.tokens, tags],
  );

  useEffect(() => {
    if (
      input.selectedSuggestionIndex !== null &&
      input.selectedSuggestionIndex >= suggestions.length
    ) {
      setInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex: null,
      }));
    }
  }, [input.selectedSuggestionIndex, suggestions.length]);

  function setText(value: string): void {
    setInput((currentInput) => ({
      ...currentInput,
      text: value,
      selectedSuggestionIndex: null,
    }));
  }

  function addToken(tag: ManagedTagRecord): void {
    setInput((currentInput) => {
      if (singleToken) {
        return {
          text: "",
          tokens: [tag],
          selectedSuggestionIndex: null,
        };
      }

      if (currentInput.tokens.some((token) => token.id === tag.id)) {
        return {
          ...currentInput,
          text: "",
          selectedSuggestionIndex: null,
        };
      }

      return {
        text: "",
        tokens: [...currentInput.tokens, tag],
        selectedSuggestionIndex: null,
      };
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? 0
            : Math.min(
                currentInput.selectedSuggestionIndex + 1,
                suggestions.length - 1,
              ),
      }));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? suggestions.length - 1
            : Math.max(currentInput.selectedSuggestionIndex - 1, 0),
      }));
      return;
    }

    if (event.key === "Backspace" && input.text.length === 0) {
      setInput((currentInput) => ({
        ...currentInput,
        tokens: currentInput.tokens.slice(0, -1),
      }));
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (input.text.trim()) {
      const suggestion =
        input.selectedSuggestionIndex === null
          ? null
          : suggestions[input.selectedSuggestionIndex];

      if (suggestion) {
        addToken(suggestion);
      }

      return;
    }

    if (input.tokens.length > 0) {
      onSubmit(input.tokens);
    }
  }

  function reset(): void {
    setInput(createRelationInputState());
  }

  return {
    text: input.text,
    tokens: input.tokens,
    selectedSuggestionIndex: input.selectedSuggestionIndex,
    suggestions,
    setText,
    addToken,
    handleKeyDown,
    reset,
  };
}
