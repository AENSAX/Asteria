import type { IJsonModel } from "flexlayout-react";
import type { SortDirection } from "../../../shared/ipc";
import type {
  BrowserNamespaceGroupState,
  BrowserSortDirection,
  BrowserSortKey,
  BrowserViewState,
} from "../views/FileBrowserView";
import type {
  SearchFilter,
  SearchInputState,
  SearchInputToken,
  SearchOperator,
} from "../views/SearchView";
import type { TagListFilterMode, TagListViewState } from "../views/TagListView";

export type PageTitleMode = "default" | "custom";

export interface SavedPageItem {
  id: string;
  title: string;
  titleMode: PageTitleMode;
  modelJson: IJsonModel;
  searchFilters: SearchFilter[];
  searchInputState: SearchInputState;
  importQueueActive: boolean;
  browserViewState: BrowserViewState;
  tagListViewState: TagListViewState;
}

export interface SavedWorkbenchState {
  activePageId: string;
  pages: SavedPageItem[];
}

interface WorkbenchPageStateSnapshot {
  id: string;
  title: string;
  titleMode: PageTitleMode;
  model: {
    toJson: () => IJsonModel;
  };
  searchFilters: SearchFilter[];
  searchInputState: SearchInputState;
  importQueueActive: boolean;
  browserViewState: BrowserViewState;
  tagListViewState: TagListViewState;
}

const WORKBENCH_STATE_KEY = "asteria.workbench-state.v1";

export const emptySearchInputState: SearchInputState = {
  tokens: [],
  text: "",
};

export const defaultBrowserViewState: BrowserViewState = {
  sortKey: "importedAt",
  sortDirection: "desc",
  namespaceGroupingEnabled: false,
  selectedNamespaceGroup: "",
  activeNamespaceGroup: null,
};

export const defaultTagListViewState: TagListViewState = {
  direction: "asc",
  namespaceFirst: false,
  filterMode: "all",
};

export function writeSavedWorkbenchState(state: SavedWorkbenchState): void {
  window.localStorage.setItem(WORKBENCH_STATE_KEY, JSON.stringify(state));
}

export function createSavedWorkbenchState<
  Page extends WorkbenchPageStateSnapshot,
>(pages: Page[], activePageId: string): SavedWorkbenchState {
  return {
    activePageId,
    pages: pages.map((page) => ({
      id: page.id,
      title: page.title,
      titleMode: page.titleMode,
      modelJson: page.model.toJson(),
      searchFilters: page.searchFilters,
      searchInputState: page.searchInputState,
      importQueueActive: page.importQueueActive,
      browserViewState: page.browserViewState,
      tagListViewState: page.tagListViewState,
    })),
  };
}

export function readSavedWorkbenchState(): SavedWorkbenchState | null {
  const rawState = window.localStorage.getItem(WORKBENCH_STATE_KEY);

  if (!rawState) {
    return null;
  }

  try {
    const state = JSON.parse(rawState) as Partial<SavedWorkbenchState>;

    if (!Array.isArray(state.pages)) {
      return null;
    }

    return {
      activePageId:
        typeof state.activePageId === "string" ? state.activePageId : "",
      pages: state.pages
        .map((page) => normalizeSavedPage(page))
        .filter((page): page is SavedPageItem => page !== null),
    };
  } catch {
    return null;
  }
}

export function normalizeSearchInputTokens(
  tokens: SearchInputToken[],
): SearchInputToken[] {
  return tokens
    .map((token): SearchInputToken | null => {
      if (token.kind === "operator" && isSearchOperator(token.value)) {
        return { kind: "operator", value: token.value };
      }

      if (token.kind === "tag") {
        return { kind: "tag", token: token.token };
      }

      return null;
    })
    .filter((token): token is SearchInputToken => token !== null);
}

function normalizeSavedPage(value: unknown): SavedPageItem | null {
  const page = value as Partial<SavedPageItem> | null;

  if (
    !page ||
    typeof page.id !== "string" ||
    typeof page.title !== "string" ||
    !page.modelJson
  ) {
    return null;
  }

  const searchInputState = page.searchInputState;

  return {
    id: page.id,
    title: page.title,
    titleMode:
      page.titleMode === "default" || page.titleMode === "custom"
        ? page.titleMode
        : inferPageTitleMode(page.title, page.id),
    modelJson: page.modelJson,
    searchFilters: normalizeSearchFilters(page.searchFilters),
    searchInputState:
      searchInputState &&
      Array.isArray(searchInputState.tokens) &&
      typeof searchInputState.text === "string"
        ? searchInputState
        : emptySearchInputState,
    importQueueActive: page.importQueueActive === true,
    browserViewState: normalizeBrowserViewState(page.browserViewState),
    tagListViewState: normalizeTagListViewState(page.tagListViewState),
  };
}

function normalizeSearchFilters(filters: unknown): SearchFilter[] {
  if (!Array.isArray(filters)) {
    return [];
  }

  return filters
    .map(normalizeSearchFilter)
    .filter((filter): filter is SearchFilter => filter !== null);
}

function normalizeSearchFilter(value: unknown): SearchFilter | null {
  if (typeof value === "string") {
    return null;
  }

  const filter = value as Partial<SearchFilter> | null;

  if (!filter || !Array.isArray(filter.tokens)) {
    return null;
  }

  const tokens = normalizeSearchInputTokens(filter.tokens);

  return tokens.some((token) => token.kind === "tag") ? { tokens } : null;
}

function normalizeBrowserViewState(value: unknown): BrowserViewState {
  const state = value as Partial<BrowserViewState> | null;
  const sortKey: BrowserSortKey =
    state?.sortKey === "updatedAt" || state?.sortKey === "importedAt"
      ? state.sortKey
      : defaultBrowserViewState.sortKey;
  const sortDirection: BrowserSortDirection =
    state?.sortDirection === "asc" || state?.sortDirection === "desc"
      ? state.sortDirection
      : defaultBrowserViewState.sortDirection;
  const selectedNamespaceGroup =
    typeof state?.selectedNamespaceGroup === "string"
      ? state.selectedNamespaceGroup.trim()
      : defaultBrowserViewState.selectedNamespaceGroup;
  const activeNamespaceGroup = normalizeBrowserNamespaceGroupState(
    state?.activeNamespaceGroup,
    selectedNamespaceGroup,
  );

  return {
    sortKey,
    sortDirection,
    namespaceGroupingEnabled: state?.namespaceGroupingEnabled === true,
    selectedNamespaceGroup,
    activeNamespaceGroup,
  };
}

function normalizeBrowserNamespaceGroupState(
  value: unknown,
  selectedNamespaceGroup: string,
): BrowserNamespaceGroupState | null {
  const group = value as Partial<BrowserNamespaceGroupState> | null;

  if (
    !group ||
    typeof group.namespace !== "string" ||
    group.namespace.trim() !== selectedNamespaceGroup ||
    selectedNamespaceGroup.length === 0
  ) {
    return null;
  }

  return {
    namespace: selectedNamespaceGroup,
    value: typeof group.value === "string" ? group.value.trim() : null,
  };
}

function normalizeTagListViewState(value: unknown): TagListViewState {
  const state = value as Partial<TagListViewState> | null;
  const direction: SortDirection =
    state?.direction === "asc" || state?.direction === "desc"
      ? state.direction
      : defaultTagListViewState.direction;
  const filterMode: TagListFilterMode =
    state?.filterMode === "all" ||
    state?.filterMode === "namespace" ||
    state?.filterMode === "plain" ||
    state?.filterMode === "selection"
      ? state.filterMode
      : defaultTagListViewState.filterMode;

  return {
    direction,
    filterMode,
    namespaceFirst: state?.namespaceFirst === true,
  };
}

function isSearchOperator(value: unknown): value is SearchOperator {
  return (
    value === "+" ||
    value === "-" ||
    value === "/" ||
    value === "(" ||
    value === ")"
  );
}

function inferPageTitleMode(title: string, pageId: string): PageTitleMode {
  const pageNumber = getPageNumber(pageId);

  return pageNumber > 0 && isDefaultPageTitle(title, pageNumber)
    ? "default"
    : "custom";
}

function getPageNumber(pageId: string): number {
  return Number(pageId.match(/^page-(\d+)$/)?.[1] ?? 0);
}

function isDefaultPageTitle(title: string, pageNumber: number): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  return (
    normalizedTitle === `页面 ${pageNumber}`.toLowerCase() ||
    normalizedTitle === `page ${pageNumber}`.toLowerCase()
  );
}
