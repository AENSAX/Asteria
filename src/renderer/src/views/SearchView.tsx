import { useEffect, useState } from "react";
import type { SearchHintRecord, TagRecord } from "../../../shared/ipc";
import {
  createTagToken,
  formatTagLabel,
  getTagNamespaceClassName,
  getSearchTokenStyle,
  parseTagText,
  type TagToken,
} from "../utils/tags";
import { mergeIds } from "../utils/ids";

export type SearchOperator = "+" | "-" | "/" | "(" | ")";

export type SearchInputToken =
  | { kind: "tag"; token: TagToken }
  | { kind: "operator"; value: SearchOperator };

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

const searchRootClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] bg-(--panel)";
const lockMessageClass = "h-6 px-2 leading-6 text-(--muted)";
const searchInputWrapClass = "relative min-w-0";
const tokenInputClass =
  "flex min-h-[30px] flex-wrap items-center gap-1 p-1 border border-(--line-strong) bg-(--surface-inset-bg) [&>input]:h-5 [&>input]:min-w-[96px] [&>input]:flex-1 [&>input]:border-0 [&>input]:bg-transparent [&>input]:p-0 [&>input]:text-(--ink) [&>input]:outline-0 [&>input::placeholder]:text-(--disabled-ink)";
const operatorTokenClass =
  "inline-flex h-[18px] min-w-[18px] items-center justify-center border border-(--line-strong) bg-(--surface-bg) text-(--muted)";
const suggestionListClass =
  "absolute left-0 top-full z-[4] border border-(--line-strong) bg-(--panel) [&>button]:block [&>button]:h-6 [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:border-b [&>button]:border-(--line) [&>button]:bg-transparent [&>button]:px-1.5 [&>button]:text-left [&>button]:text-[11px] [&>button:last-child]:border-b-0 [&>button:hover]:bg-(--accent-weak)";
const selectedSuggestionClass = "bg-(--accent-weak)";
const suggestionItemClass = "text-(--ink)";
const tagTokenClass =
  "inline-flex min-h-[18px] max-w-full overflow-hidden border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[11px] text-(--ink)";
const pendingTagTokenClass = "border-(--danger)";
const filterListClass =
  "min-h-0 overflow-auto border border-(--line) bg-(--surface-bg) [&>div]:flex [&>div]:min-h-[26px] [&>div]:w-full [&>div]:flex-wrap [&>div]:items-center [&>div]:gap-1 [&>div]:border-0 [&>div]:border-b [&>div]:border-(--line) [&>div]:px-1.5 [&>div]:text-[11px] [&>div]:last:border-b-0 [&>div:hover]:bg-(--button-hover)";
const pendingFilterClass = "border-(--danger) bg-(--danger-bg)";
const searchFilterEmptyClass = "h-6 px-2 leading-6 text-(--muted)";
const searchFilterTokenClass = "max-w-full";

export function SearchView({
  inputState,
  appendTagRequest,
  filters,
  refreshSequence,
  locked,
  onSearch,
  onRemoveFilters,
  onInputStateChange,
}: SearchViewProps): JSX.Element {
  const [tokens, setTokens] = useState<SearchInputToken[]>(inputState.tokens);
  const [text, setText] = useState(inputState.text);
  const [suggestions, setSuggestions] = useState<SearchHintRecord[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [handledAppendSequence, setHandledAppendSequence] = useState(0);
  const [pendingTokenIndexes, setPendingTokenIndexes] = useState<number[]>([]);
  const [lastPendingTokenIndex, setLastPendingTokenIndex] = useState<
    number | null
  >(null);
  const [pendingFilterIndexes, setPendingFilterIndexes] = useState<number[]>(
    [],
  );
  const [lastPendingFilterIndex, setLastPendingFilterIndex] = useState<
    number | null
  >(null);
  const selectableTokenIndexes = tokens
    .map((token, index) => (token.kind === "tag" ? index : null))
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
      currentIndexes.filter((index) => tokens[index]?.kind === "tag"),
    );
    setLastPendingTokenIndex((currentIndex) =>
      currentIndex !== null && tokens[currentIndex]?.kind === "tag"
        ? currentIndex
        : null,
    );
  }, [tokens]);

  useEffect(() => {
    if (
      locked ||
      !appendTagRequest ||
      appendTagRequest.sequence <= handledAppendSequence
    ) {
      return;
    }

    appendSuggestion(appendTagRequest.tag);
    setHandledAppendSequence(appendTagRequest.sequence);
  }, [appendTagRequest, handledAppendSequence]);

  useEffect(() => {
    setPendingFilterIndexes((currentIndexes) =>
      currentIndexes.filter((index) => filters[index]),
    );
    setLastPendingFilterIndex((currentIndex) =>
      currentIndex !== null && filters[currentIndex] ? currentIndex : null,
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

    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setSelectedSuggestionIndex((index) =>
        Math.min(index + 1, suggestions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setSelectedSuggestionIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Backspace" && text.length === 0 && tokens.length > 0) {
      if (pendingTokenIndexes.length > 0) {
        removePendingTokens(pendingTokenIndexes);
        return;
      }

      setTokens((currentTokens) => currentTokens.slice(0, -1));
      return;
    }

    if (event.key.toLowerCase() === "a" && event.ctrlKey) {
      event.preventDefault();
      if (tokens.length > 0) {
        setPendingTokenIndexes(selectableTokenIndexes);
        setLastPendingTokenIndex(
          selectableTokenIndexes[selectableTokenIndexes.length - 1] ?? null,
        );
      } else {
        setPendingFilterIndexes(selectableFilterIndexes);
        setLastPendingFilterIndex(
          selectableFilterIndexes[selectableFilterIndexes.length - 1] ?? null,
        );
      }
      return;
    }

    if (isSearchOperator(event.key)) {
      event.preventDefault();
      appendOperator(event.key);
      return;
    }

    if (event.key !== "Enter") {
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
        color: "color" in tag ? tag.color : null,
        searchValue:
          "kind" in tag && tag.kind === "rating"
            ? `@rating:${tag.id}`
            : undefined,
      }),
    );
  }

  function appendTextAsTag(): void {
    const draft = parseTagText(text);

    if (draft) {
      appendTagToken(createTagToken(draft));
    }
  }

  function appendTagToken(token: TagToken): void {
    setTokens((currentTokens) => [...currentTokens, { kind: "tag", token }]);
    setText("");
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  function appendOperator(operator: SearchOperator): void {
    if (text.trim().length > 0) {
      return;
    }

    setTokens((currentTokens) => [
      ...currentTokens,
      { kind: "operator", value: operator },
    ]);
    setText("");
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  function runSearch(): void {
    if (locked) {
      return;
    }

    if (
      text.trim().length > 0 ||
      !tokens.some((token) => token.kind === "tag")
    ) {
      return;
    }

    onSearch(tokens);
    setTokens([]);
    setText("");
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  }

  function handleFilterMouseDown(
    event: React.MouseEvent<HTMLElement>,
    index: number,
  ): void {
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
        (filterIndex) => filterIndex >= start && filterIndex <= end,
      );

      setPendingFilterIndexes((currentIndexes) =>
        event.ctrlKey ? mergeIds(currentIndexes, rangeIndexes) : rangeIndexes,
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

      setPendingFilterIndexes((currentIndexes) => [...currentIndexes, index]);
      setLastPendingFilterIndex(index);
      return;
    }

    if (isPending) {
      const removingIndexes =
        pendingFilterIndexes.length > 1 ? pendingFilterIndexes : [index];
      onRemoveFilters(removingIndexes);
      setPendingFilterIndexes([]);
      setLastPendingFilterIndex(null);
      return;
    }

    setPendingFilterIndexes([index]);
    setLastPendingFilterIndex(index);
  }

  function handleTokenMouseDown(
    event: React.MouseEvent<HTMLElement>,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (locked || tokens[index]?.kind !== "tag") {
      return;
    }

    const isPending = pendingTokenIndexes.includes(index);

    if (event.shiftKey && lastPendingTokenIndex !== null) {
      const start = Math.min(lastPendingTokenIndex, index);
      const end = Math.max(lastPendingTokenIndex, index);
      const rangeIndexes = selectableTokenIndexes.filter(
        (tokenIndex) => tokenIndex >= start && tokenIndex <= end,
      );

      setPendingTokenIndexes((currentIndexes) =>
        event.ctrlKey ? mergeIds(currentIndexes, rangeIndexes) : rangeIndexes,
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
    setTokens((currentTokens) =>
      currentTokens.filter((_, index) => !removingIndexes.has(index)),
    );
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
  }

  function clearPendingTokens(event: React.MouseEvent<HTMLDivElement>): void {
    const target = event.target as Element | null;

    if (!target?.closest(".search-token-item")) {
      setPendingTokenIndexes([]);
      setLastPendingTokenIndex(null);
    }

    if (!target?.closest(".search-filter-item")) {
      setPendingFilterIndexes([]);
      setLastPendingFilterIndex(null);
    }
  }

  return (
    <section className={searchRootClass}>
      {locked ? (
        <div className={lockMessageClass}>不可操作，因为正在导入文件</div>
      ) : null}
      <div className={searchInputWrapClass}>
        {suggestions.length > 0 ? (
          <div className={suggestionListClass}>
            {suggestions.map((tag, index) => (
              <button
                className={getTagNamespaceClassName(
                  tag,
                  index === selectedSuggestionIndex
                    ? `${suggestionItemClass} ${selectedSuggestionClass}`
                    : suggestionItemClass,
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

        <div className={tokenInputClass} onMouseDown={clearPendingTokens}>
          {tokens.map((token, index) =>
            token.kind === "tag" ? (
              <span
                className={getTagNamespaceClassName(
                  token.token,
                  pendingTokenIndexes.includes(index)
                    ? `${tagTokenClass} search-token-item ${pendingTagTokenClass}`
                    : `${tagTokenClass} search-token-item`,
                )}
                key={`${token.token.key}-${index}`}
                style={getSearchTokenStyle(token.token)}
                onMouseDown={(event) => handleTokenMouseDown(event, index)}
              >
                {formatTagLabel(token.token)}
              </span>
            ) : (
              <span
                className={operatorTokenClass}
                key={`${token.value}-${index}`}
              >
                {token.value}
              </span>
            ),
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

      <div className={filterListClass} onMouseDown={clearPendingTokens}>
        {filters.length > 0 ? (
          filters.map((filter, index) => (
            <div
              className={`search-filter-item ${pendingFilterIndexes.includes(index) ? pendingFilterClass : ""}`}
              key={`${buildSearchExpression(filter.tokens, "")}-${index}`}
              title={buildSearchExpression(filter.tokens, "")}
              onMouseDown={(event) => handleFilterMouseDown(event, index)}
            >
              {filter.tokens.map((token, tokenIndex) =>
                token.kind === "tag" ? (
                  <span
                    className={getTagNamespaceClassName(
                      token.token,
                      `${tagTokenClass} ${searchFilterTokenClass}`,
                    )}
                    key={`${token.token.key}-${tokenIndex}`}
                    style={getSearchTokenStyle(token.token)}
                  >
                    {formatTagLabel(token.token)}
                  </span>
                ) : (
                  <span
                    className={operatorTokenClass}
                    key={`${token.value}-${tokenIndex}`}
                  >
                    {token.value}
                  </span>
                ),
              )}
            </div>
          ))
        ) : (
          <div className={searchFilterEmptyClass}>没有筛选项</div>
        )}
      </div>
    </section>
  );
}

export function buildSearchExpression(
  tokens: SearchInputToken[],
  text: string,
): string {
  const parts: string[] = [];
  let previousCanJoinImplicitly = false;

  for (const token of tokens) {
    if (token.kind === "tag") {
      if (previousCanJoinImplicitly) {
        parts.push("+");
      }

      parts.push(
        quoteSearchTag(token.token.searchValue ?? formatTagLabel(token.token)),
      );
      previousCanJoinImplicitly = true;
      continue;
    }

    if (token.value === "(" && previousCanJoinImplicitly) {
      parts.push("+");
    }

    parts.push(token.value);
    previousCanJoinImplicitly = token.value === ")";
  }

  const pendingText = text.trim();

  if (pendingText) {
    if (previousCanJoinImplicitly) {
      parts.push("+");
    }

    parts.push(pendingText);
  }

  return parts.join("");
}

function quoteSearchTag(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isSearchOperator(value: string): value is SearchOperator {
  return (
    value === "+" ||
    value === "-" ||
    value === "/" ||
    value === "(" ||
    value === ")"
  );
}
