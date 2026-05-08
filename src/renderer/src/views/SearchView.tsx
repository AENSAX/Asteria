import { useEffect, useState } from 'react';
import type { SearchHintRecord, TagRecord } from '../../../shared/ipc';
import {
  createTagToken,
  formatTagLabel,
  getTagNamespaceClassName,
  getSearchTokenStyle,
  parseTagText,
  type TagToken
} from '../utils/tags';
import { mergeIds } from '../utils/ids';

export type SearchOperator = '+' | '-' | '/' | '(' | ')';

export type SearchInputToken =
  | { kind: 'tag'; token: TagToken }
  | { kind: 'operator'; value: SearchOperator };

export interface SearchInputState {
  tokens: SearchInputToken[];
  text: string;
}

export interface SearchFilter {
  tokens: SearchInputToken[];
}

interface SearchViewProps {
  inputState: SearchInputState;
  appendTagRequest: SearchAppendTagRequest | null;
  filters: SearchFilter[];
  refreshSequence: number;
  locked: boolean;
  onSearch: (tokens: SearchInputToken[]) => void;
  onRemoveFilters: (indexes: number[]) => void;
  onInputStateChange: (state: SearchInputState) => void;
}

export interface SearchAppendTagRequest {
  sequence: number;
  tag: TagRecord;
}

export function SearchView({
  inputState,
  appendTagRequest,
  filters,
  refreshSequence,
  locked,
  onSearch,
  onRemoveFilters,
  onInputStateChange
}: SearchViewProps): JSX.Element {
  const [tokens, setTokens] = useState<SearchInputToken[]>(inputState.tokens);
  const [text, setText] = useState(inputState.text);
  const [suggestions, setSuggestions] = useState<SearchHintRecord[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [handledAppendSequence, setHandledAppendSequence] = useState(0);
  const [pendingTokenIndexes, setPendingTokenIndexes] = useState<number[]>([]);
  const [lastPendingTokenIndex, setLastPendingTokenIndex] = useState<number | null>(null);
  const [pendingFilterIndexes, setPendingFilterIndexes] = useState<number[]>([]);
  const [lastPendingFilterIndex, setLastPendingFilterIndex] = useState<number | null>(null);
  const selectableTokenIndexes = tokens
    .map((token, index) => (token.kind === 'tag' ? index : null))
    .filter((index): index is number => index !== null);
  const selectableFilterIndexes = filters.map((_filter, index) => index);

  useEffect(() => {
    if (locked) {
      setSuggestions([]);
      setSelectedSuggestionIndex(0);
      return;
    }

    void searchTagSuggestions(text);
  }, [locked, text, refreshSequence]);

  useEffect(() => {
    onInputStateChange({ tokens, text });
  }, [tokens, text]);

  useEffect(() => {
    setPendingTokenIndexes((currentIndexes) =>
      currentIndexes.filter((index) => tokens[index]?.kind === 'tag')
    );
    setLastPendingTokenIndex((currentIndex) =>
      currentIndex !== null && tokens[currentIndex]?.kind === 'tag' ? currentIndex : null
    );
  }, [tokens]);

  useEffect(() => {
    if (locked || !appendTagRequest || appendTagRequest.sequence <= handledAppendSequence) {
      return;
    }

    appendSuggestion(appendTagRequest.tag);
    setHandledAppendSequence(appendTagRequest.sequence);
  }, [appendTagRequest, handledAppendSequence]);

  useEffect(() => {
    setPendingFilterIndexes((currentIndexes) =>
      currentIndexes.filter((index) => filters[index])
    );
    setLastPendingFilterIndex((currentIndex) =>
      currentIndex !== null && filters[currentIndex] ? currentIndex : null
    );
  }, [filters]);

  async function searchTagSuggestions(value: string): Promise<void> {
    if (!window.asteria || value.trim().length === 0) {
      setSuggestions([]);
      setSelectedSuggestionIndex(0);
      return;
    }

    const nextSuggestions = await window.asteria.searchHints(value);
    setSuggestions(nextSuggestions);
    setSelectedSuggestionIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (locked) {
      event.preventDefault();
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
      if (pendingTokenIndexes.length > 0) {
        removePendingTokens(pendingTokenIndexes);
        return;
      }

      setTokens((currentTokens) => currentTokens.slice(0, -1));
      return;
    }

    if (event.key.toLowerCase() === 'a' && event.ctrlKey) {
      event.preventDefault();
      if (tokens.length > 0) {
        setPendingTokenIndexes(selectableTokenIndexes);
        setLastPendingTokenIndex(selectableTokenIndexes[selectableTokenIndexes.length - 1] ?? null);
      } else {
        setPendingFilterIndexes(selectableFilterIndexes);
        setLastPendingFilterIndex(selectableFilterIndexes[selectableFilterIndexes.length - 1] ?? null);
      }
      return;
    }

    if (isSearchOperator(event.key)) {
      event.preventDefault();
      appendOperator(event.key);
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    if (text.trim().length > 0 && suggestions.length > 0) {
      appendSuggestion(suggestions[selectedSuggestionIndex] ?? suggestions[0]);
      return;
    }

    runSearch();
  }

  function appendSuggestion(tag: SearchHintRecord | TagRecord): void {
    appendTagToken(
      createTagToken({
        id: tag.id,
        namespace: tag.namespace,
        name: tag.name,
        styleName: tag.styleName,
        color: 'color' in tag ? tag.color : null,
        searchValue: 'kind' in tag && tag.kind === 'rating' ? `@rating:${tag.id}` : undefined
      })
    );
  }

  function appendTextAsTag(): void {
    const draft = parseTagText(text);

    if (draft) {
      appendTagToken(createTagToken(draft));
    }
  }

  function appendTagToken(token: TagToken): void {
    setTokens((currentTokens) => [...currentTokens, { kind: 'tag', token }]);
    setText('');
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  function appendOperator(operator: SearchOperator): void {
    if (text.trim().length > 0) {
      return;
    }

    setTokens((currentTokens) => [...currentTokens, { kind: 'operator', value: operator }]);
    setText('');
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  function runSearch(): void {
    if (locked) {
      return;
    }

    if (text.trim().length > 0 || !tokens.some((token) => token.kind === 'tag')) {
      return;
    }

    onSearch(tokens);
    setTokens([]);
    setText('');
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  function handleFilterMouseDown(event: React.MouseEvent<HTMLElement>, index: number): void {
    event.preventDefault();
    event.stopPropagation();

    if (locked) {
      return;
    }

    const isPending = pendingFilterIndexes.includes(index);

    if (event.shiftKey && lastPendingFilterIndex !== null) {
      const start = Math.min(lastPendingFilterIndex, index);
      const end = Math.max(lastPendingFilterIndex, index);
      const rangeIndexes = selectableFilterIndexes.filter(
        (filterIndex) => filterIndex >= start && filterIndex <= end
      );

      setPendingFilterIndexes((currentIndexes) =>
        event.ctrlKey ? mergeIds(currentIndexes, rangeIndexes) : rangeIndexes
      );
      return;
    }

    if (event.ctrlKey) {
      if (isPending) {
        onRemoveFilters(pendingFilterIndexes);
        setPendingFilterIndexes([]);
        setLastPendingFilterIndex(null);
        return;
      }

      setPendingFilterIndexes((currentIndexes) =>
        [...currentIndexes, index]
      );
      setLastPendingFilterIndex(index);
      return;
    }

    if (isPending) {
      const removingIndexes = pendingFilterIndexes.length > 1 ? pendingFilterIndexes : [index];
      onRemoveFilters(removingIndexes);
      setPendingFilterIndexes([]);
      setLastPendingFilterIndex(null);
      return;
    }

    setPendingFilterIndexes([index]);
    setLastPendingFilterIndex(index);
  }

  function handleTokenMouseDown(event: React.MouseEvent<HTMLElement>, index: number): void {
    event.preventDefault();
    event.stopPropagation();

    if (locked || tokens[index]?.kind !== 'tag') {
      return;
    }

    const isPending = pendingTokenIndexes.includes(index);

    if (event.shiftKey && lastPendingTokenIndex !== null) {
      const start = Math.min(lastPendingTokenIndex, index);
      const end = Math.max(lastPendingTokenIndex, index);
      const rangeIndexes = selectableTokenIndexes.filter(
        (tokenIndex) => tokenIndex >= start && tokenIndex <= end
      );

      setPendingTokenIndexes((currentIndexes) =>
        event.ctrlKey ? mergeIds(currentIndexes, rangeIndexes) : rangeIndexes
      );
      return;
    }

    if (event.ctrlKey) {
      if (isPending) {
        removePendingTokens(pendingTokenIndexes);
        return;
      }

      setPendingTokenIndexes((currentIndexes) => [...currentIndexes, index]);
      setLastPendingTokenIndex(index);
      return;
    }

    if (isPending && pendingTokenIndexes.length === 1) {
      removePendingTokens([index]);
      return;
    }

    setPendingTokenIndexes([index]);
    setLastPendingTokenIndex(index);
  }

  function removePendingTokens(indexes: number[]): void {
    const removingIndexes = new Set(indexes);
    setTokens((currentTokens) => currentTokens.filter((_, index) => !removingIndexes.has(index)));
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
  }

  function clearPendingTokens(event: React.MouseEvent<HTMLDivElement>): void {
    const target = event.target as Element | null;

    if (!target?.closest('.search-token-item')) {
      setPendingTokenIndexes([]);
      setLastPendingTokenIndex(null);
    }

    if (!target?.closest('.search-filter-item')) {
      setPendingFilterIndexes([]);
      setLastPendingFilterIndex(null);
    }
  }

  return (
    <section className="module-view search-view">
      {locked ? <div className="view-lock-message">不可操作，因为正在导入文件</div> : null}
      <div className="search-input-wrap">
        {suggestions.length > 0 ? (
          <div className="tag-suggestions search-suggestions">
            {suggestions.map((tag, index) => (
              <button
                className={getTagNamespaceClassName(
                  tag,
                  index === selectedSuggestionIndex ? 'tag-suggestion selected' : 'tag-suggestion'
                )}
                key={`${tag.kind}-${tag.id}`}
                style={getSearchTokenStyle(tag)}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  appendSuggestion(tag);
                }}
              >
                {formatTagLabel(tag)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="search-token-input" onMouseDown={clearPendingTokens}>
          {tokens.map((token, index) =>
            token.kind === 'tag' ? (
              <span
                className={getTagNamespaceClassName(
                  token.token,
                  pendingTokenIndexes.includes(index)
                    ? 'tag-token search-token-item pending'
                    : 'tag-token search-token-item'
                )}
                key={`${token.token.key}-${index}`}
                style={getSearchTokenStyle(token.token)}
                onMouseDown={(event) => handleTokenMouseDown(event, index)}
              >
                {formatTagLabel(token.token)}
              </span>
            ) : (
              <span className="search-operator-token" key={`${token.value}-${index}`}>
                {token.value}
              </span>
            )
          )}
          <input
            aria-label="搜索"
            disabled={locked}
            placeholder="输入标签以搜索"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="search-filter-list" onMouseDown={clearPendingTokens}>
        {filters.length > 0 ? (
          filters.map((filter, index) => (
            <div
              className={
                pendingFilterIndexes.includes(index)
                  ? 'search-filter-item pending'
                  : 'search-filter-item'
              }
              key={`${buildSearchExpression(filter.tokens, '')}-${index}`}
              title={buildSearchExpression(filter.tokens, '')}
              onMouseDown={(event) => handleFilterMouseDown(event, index)}
            >
              {filter.tokens.map((token, tokenIndex) =>
                token.kind === 'tag' ? (
                  <span
                    className={getTagNamespaceClassName(token.token, 'tag-token search-filter-token')}
                    key={`${token.token.key}-${tokenIndex}`}
                    style={getSearchTokenStyle(token.token)}
                  >
                    {formatTagLabel(token.token)}
                  </span>
                ) : (
                  <span className="search-operator-token" key={`${token.value}-${tokenIndex}`}>
                    {token.value}
                  </span>
                )
              )}
            </div>
          ))
        ) : (
          <div className="search-filter-empty">没有筛选项</div>
        )}
      </div>
    </section>
  );
}

export function buildSearchExpression(tokens: SearchInputToken[], text: string): string {
  const parts: string[] = [];
  let previousCanJoinImplicitly = false;

  for (const token of tokens) {
    if (token.kind === 'tag') {
      if (previousCanJoinImplicitly) {
        parts.push('+');
      }

      parts.push(quoteSearchTag(token.token.searchValue ?? formatTagLabel(token.token)));
      previousCanJoinImplicitly = true;
      continue;
    }

    if (token.value === '(' && previousCanJoinImplicitly) {
      parts.push('+');
    }

    parts.push(token.value);
    previousCanJoinImplicitly = token.value === ')';
  }

  const pendingText = text.trim();

  if (pendingText) {
    if (previousCanJoinImplicitly) {
      parts.push('+');
    }

    parts.push(pendingText);
  }

  return parts.join('');
}

function quoteSearchTag(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function isSearchOperator(value: string): value is SearchOperator {
  return value === '+' || value === '-' || value === '/' || value === '(' || value === ')';
}
