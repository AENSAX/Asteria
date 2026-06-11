import { useEffect, useRef, useState } from "react";
import type { SearchHintRecord, TagRecord } from "../../../shared/ipc";
import {
  createTagToken,
  formatTagLabel,
  getTagNamespaceClassName,
  getSearchTokenStyle,
  type TagToken,
} from "../utils/tags";
import { useShortcut } from "../hooks/useShortcut";
import { useMultiSelection } from "../hooks/useMultiSelection";
import { TagSuggestionList } from "../components/TagSuggestionList";
import {
  useLanguage,
} from "../utils/language";

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
  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-(--radius) border border-(--line-strong) bg-(--surface-bg) text-(--muted)";
const tagTokenClass =
  "inline-flex min-h-[18px] max-w-full overflow-hidden rounded-(--radius) border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[12px] text-(--ink)";
const pendingTagTokenClass = "pending";
const filterListClass =
  "min-h-0 overflow-auto border border-(--line) bg-(--surface-bg) [&>div]:flex [&>div]:min-h-[26px] [&>div]:w-full [&>div]:flex-wrap [&>div]:items-center [&>div]:gap-1 [&>div]:border-0 [&>div]:border-b [&>div]:border-(--line) [&>div]:px-1.5 [&>div]:text-[12px] [&>div]:last:border-b-0 [&>div:hover]:bg-(--button-hover)";
const pendingFilterClass = "pending";
const searchFilterEmptyClass = "ui-empty";
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
  const { t } = useLanguage();
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionRequestIdRef = useRef(0);
  const selectableTokenIndexes = tokens
    .map((token, index) => (token.kind === "tag" ? index : null))
    .filter((index): index is number => index !== null);
  const selectableFilterIndexes = filters.map((_filter, index) => index);
  const filterSelection = useMultiSelection({
    items: filters,
    getId: (_filter, index) => index,
    selectedIds: pendingFilterIndexes,
    lastSelectedId: lastPendingFilterIndex,
    onSelect: setPendingFilterIndexes,
    onLastSelectedId: setLastPendingFilterIndex,
    onPlainClickSelected: (_filter, index) => {
      const removingIndexes =
        pendingFilterIndexes.length > 1 ? pendingFilterIndexes : [index];
      onRemoveFilters(removingIndexes);
      setPendingFilterIndexes([]);
      setLastPendingFilterIndex(null);
      return true;
    },
  });
  const tokenSelection = useMultiSelection({
    items: tokens,
    getId: (_token, index) => index,
    isSelectable: (token) => token.kind === "tag",
    selectedIds: pendingTokenIndexes,
    lastSelectedId: lastPendingTokenIndex,
    onSelect: setPendingTokenIndexes,
    onLastSelectedId: setLastPendingTokenIndex,
    onPlainClickSelected: (_token, index) => {
      if (pendingTokenIndexes.length === 1) {
        removePendingTokens([index]);
        return true;
      }

      return false;
    },
  });

  useEffect(() => {
    if (locked || text.trim().length === 0) {
      suggestionRequestIdRef.current += 1;
      setSuggestions([]);
      setSelectedSuggestionIndex(0);
      return undefined;
    }

    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;
    const timer = window.setTimeout(() => {
      void loadTagSuggestions(text, requestId);
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
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

  useShortcut(
    "remove-selected",
    () => {
      if (pendingTokenIndexes.length > 0) {
        removePendingTokens(pendingTokenIndexes);
        return;
      }

      onRemoveFilters(pendingFilterIndexes);
      setPendingFilterIndexes([]);
      setLastPendingFilterIndex(null);
    },
    {
      enabled:
        !locked &&
        (pendingTokenIndexes.length > 0 || pendingFilterIndexes.length > 0),
    },
  );

  async function loadTagSuggestions(
    value: string,
    requestId: number,
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSuggestions = await window.asteria.searchHints(value);

    if (suggestionRequestIdRef.current !== requestId) {
      return;
    }

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
      const suggestion = suggestions[selectedSuggestionIndex] ?? suggestions[0];

      if (suggestion) {
        appendSuggestion(suggestion);
      }
      return;
    }

    runSearch();
  }

  function appendSuggestion(tag: SearchHintRecord | TagRecord): void {
    const tokenDraft = {
      id: tag.id,
      namespace: tag.namespace,
      name: tag.name,
      styleName: tag.styleName,
      color: "color" in tag ? tag.color : null,
    };

    appendTagToken(
      createTagToken(
        "kind" in tag && tag.kind === "rating"
          ? { ...tokenDraft, searchValue: `@rating:${tag.id}` }
          : tokenDraft,
      ),
    );
  }

  function appendTagToken(token: TagToken): void {
    setTokens((currentTokens) => [...currentTokens, { kind: "tag", token }]);
    setText("");
    setPendingTokenIndexes([]);
    setLastPendingTokenIndex(null);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
    focusSearchInput();
  }

  function focusSearchInput(): void {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
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
    filter: SearchFilter,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (!locked) {
      filterSelection.handleItemMouseDown(event, filter, index);
    }
  }

  function handleTokenMouseDown(
    event: React.MouseEvent<HTMLElement>,
    token: SearchInputToken,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (!locked && token.kind === "tag") {
      tokenSelection.handleItemMouseDown(event, token, index);
    }
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
        <div className={lockMessageClass}>{t("window.search.locked")}</div>
      ) : null}
      <div className={searchInputWrapClass}>
        <TagSuggestionList
          className="absolute left-0 top-full z-[4]"
          selectedIndex={selectedSuggestionIndex}
          suggestions={suggestions}
          onPick={appendSuggestion}
        />

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
                onMouseDown={(event) =>
                  handleTokenMouseDown(event, token, index)
                }
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
            aria-label={t("window.search.input")}
            disabled={locked}
            placeholder={t("window.search.placeholder")}
            ref={inputRef}
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
              onMouseDown={(event) =>
                handleFilterMouseDown(event, filter, index)
              }
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
          <div className={searchFilterEmptyClass}>{t("window.search.noFilters")}</div>
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
