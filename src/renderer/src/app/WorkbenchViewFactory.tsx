import type { TabNode } from "flexlayout-react";
import logoUrl from "../../../../resources/images/logo.png";
import type {
  ImportProgress,
  ImportQueueFileRecord,
  TagRecord,
} from "../../../shared/ipc";
import {
  FileBrowserView,
  type BrowserViewState,
} from "../views/FileBrowserView";
import { ImportView } from "../views/ImportView";
import {
  buildSearchExpression,
  SearchView,
  type SearchFilter,
  type SearchInputState,
  type SearchInputToken,
} from "../views/SearchView";
import { TagListView, type TagListViewState } from "../views/TagListView";
import type { TranslationFunction } from "../utils/language";
import type { PageItem } from "./workbenchTypes";

type WorkbenchViewComponent =
  | "empty-page"
  | "file-import"
  | "file-browser"
  | "search"
  | "tag-list";

interface RenderWorkbenchViewOptions {
  activePage: PageItem | null;
  defaultBrowserViewState: BrowserViewState;
  defaultSearchInputState: SearchInputState;
  defaultTagListViewState: TagListViewState;
  dragActive: boolean;
  node: TabNode;
  percent: number;
  progress: ImportProgress;
  t: TranslationFunction;
  onAppendSearchTag: (tag: TagRecord) => void;
  onBrowserSelectionChange: (fileIds: number[]) => void;
  onBrowserStateChange: (state: BrowserViewState) => void;
  onCancelImportQueue: () => void | Promise<void>;
  onCommitImportQueue: (
    queueFiles: ImportQueueFileRecord[],
  ) => void | Promise<void>;
  onDeactivateImportQueue: () => void;
  onRemoveSearchFilters: (indexes: number[]) => void;
  onSearch: (tokens: SearchInputToken[]) => void;
  onSearchInputChange: (state: SearchInputState) => void;
  onTagListStateChange: (state: TagListViewState) => void;
}

const emptyPageClass =
  "grid h-full min-h-0 min-w-0 place-items-center bg-(--panel)";
const emptyPageLogoClass = "h-80 w-80 object-contain opacity-80";

export function renderWorkbenchView({
  activePage,
  defaultBrowserViewState,
  defaultSearchInputState,
  defaultTagListViewState,
  dragActive,
  node,
  percent,
  progress,
  t,
  onAppendSearchTag,
  onBrowserSelectionChange,
  onBrowserStateChange,
  onCancelImportQueue,
  onCommitImportQueue,
  onDeactivateImportQueue,
  onRemoveSearchFilters,
  onSearch,
  onSearchInputChange,
  onTagListStateChange,
}: RenderWorkbenchViewOptions): JSX.Element {
  const component = node.getComponent() as WorkbenchViewComponent;
  const refreshSequence =
    activePage?.viewRefreshSequenceByTabId[node.getId()] ?? 0;

  if (component === "empty-page") {
    return <EmptyPagePlaceholder />;
  }

  if (component === "file-import") {
    return (
      <ImportView
        dragActive={dragActive}
        percent={percent}
        progress={progress}
        onCancelQueue={() => void onCancelImportQueue()}
        onCommitQueue={(queueFiles) => void onCommitImportQueue(queueFiles)}
      />
    );
  }

  if (component === "file-browser") {
    return (
      <FileBrowserView
        importQueueMode={Boolean(activePage?.importQueueActive)}
        refreshSequence={refreshSequence}
        searchQuery={buildCombinedSearchQuery(activePage?.searchFilters ?? [])}
        state={activePage?.browserViewState ?? defaultBrowserViewState}
        onImportQueueEmpty={onDeactivateImportQueue}
        onSelectionChange={onBrowserSelectionChange}
        onStateChange={onBrowserStateChange}
      />
    );
  }

  if (component === "search") {
    return (
      <SearchView
        appendTagRequest={activePage?.searchAppendTagRequest ?? null}
        inputState={activePage?.searchInputState ?? defaultSearchInputState}
        refreshSequence={refreshSequence}
        filters={activePage?.searchFilters ?? []}
        onInputStateChange={onSearchInputChange}
        onRemoveFilters={onRemoveSearchFilters}
        onSearch={onSearch}
        locked={Boolean(activePage?.importQueueActive)}
      />
    );
  }

  if (component === "tag-list") {
    return (
      <TagListView
        locked={Boolean(activePage?.importQueueActive)}
        refreshSequence={refreshSequence}
        selectedFileIds={activePage?.selectedBrowserFileIds ?? []}
        state={activePage?.tagListViewState ?? defaultTagListViewState}
        onAppendSearchTag={onAppendSearchTag}
        onStateChange={onTagListStateChange}
      />
    );
  }

  return (
    <div className="grid h-full place-items-center text-(--muted)">
      {t("app.unknownView")}
    </div>
  );
}

export function EmptyPagePlaceholder(): JSX.Element {
  return (
    <section className={emptyPageClass}>
      <img className={emptyPageLogoClass} alt="Asteria" src={logoUrl} />
    </section>
  );
}

function buildCombinedSearchQuery(filters: SearchFilter[]): string {
  return filters
    .map((filter) => buildSearchExpression(filter.tokens, ""))
    .filter((filter) => filter.trim().length > 0)
    .map((filter) => `(${filter})`)
    .join("+");
}
