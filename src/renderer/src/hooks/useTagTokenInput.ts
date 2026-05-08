import { useEffect, useState } from 'react';
import type { TagRecord } from '../../../shared/ipc';
import { createTagToken, parseTagText, type TagToken } from '../utils/tags';

interface UseTagTokenInputOptions {
  onCommit: (tokens: TagToken[]) => Promise<void> | void;
}

export function useTagTokenInput({ onCommit }: UseTagTokenInputOptions): {
  tokens: TagToken[];
  text: string;
  suggestions: TagRecord[];
  selectedSuggestionIndex: number;
  setText: (text: string) => void;
  setTokens: React.Dispatch<React.SetStateAction<TagToken[]>>;
  reset: () => void;
  addTokenFromSuggestion: (tag: TagRecord) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
} {
  const [tokens, setTokens] = useState<TagToken[]>([]);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<TagRecord[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  useEffect(() => {
    void searchTagSuggestions(text);
  }, [text]);

  async function searchTagSuggestions(query: string): Promise<void> {
    if (!window.asteria || query.trim().length === 0) {
      setSuggestions([]);
      setSelectedSuggestionIndex(0);
      return;
    }

    const nextSuggestions = await window.asteria.searchTags(query);
    setSuggestions(nextSuggestions);
    setSelectedSuggestionIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setSelectedSuggestionIndex((index) => Math.min(index + 1, suggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setSelectedSuggestionIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Backspace' && text.length === 0 && tokens.length > 0) {
      setTokens((currentTokens) => currentTokens.slice(0, -1));
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    if (text.trim().length > 0 && suggestions.length > 0) {
      addTokenFromSuggestion(suggestions[selectedSuggestionIndex] ?? suggestions[0]);
      return;
    }

    if (text.trim().length > 0) {
      addTokenFromText(text);
      return;
    }

    if (tokens.length > 0) {
      void commitTokens();
    }
  }

  function addTokenFromSuggestion(tag: TagRecord): void {
    addToken(
      createTagToken({
        id: tag.id,
        namespace: tag.namespace,
        name: tag.name,
        styleName: tag.styleName
      })
    );
  }

  function addTokenFromText(value: string): void {
    const draft = parseTagText(value);

    if (draft) {
      addToken(createTagToken(draft));
    }
  }

  function addToken(token: TagToken): void {
    setTokens((currentTokens) => {
      if (currentTokens.some((currentToken) => currentToken.key === token.key)) {
        return currentTokens;
      }

      return [...currentTokens, token];
    });
    setText('');
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  async function commitTokens(): Promise<void> {
    if (tokens.length === 0) {
      return;
    }

    await onCommit(tokens);
    reset();
  }

  function reset(): void {
    setTokens([]);
    setText('');
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  return {
    tokens,
    text,
    suggestions,
    selectedSuggestionIndex,
    setText,
    setTokens,
    reset,
    addTokenFromSuggestion,
    handleKeyDown
  };
}
