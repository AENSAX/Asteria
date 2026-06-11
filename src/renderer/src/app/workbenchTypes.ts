import type { Model } from "flexlayout-react";
import type { BrowserViewState } from "../views/FileBrowserView";
import type {
  SearchAppendTagRequest,
  SearchFilter,
  SearchInputState,
} from "../views/SearchView";
import type { TagListViewState } from "../views/TagListView";
import type { PageTitleMode } from "./workbenchState";

export interface PageItem {
  id: string;
  title: string;
  titleMode: PageTitleMode;
  model: Model;
  searchFilters: SearchFilter[];
  searchInputState: SearchInputState;
  searchAppendTagRequest: SearchAppendTagRequest | null;
  viewRefreshSequenceByTabId: Record<string, number>;
  importQueueActive: boolean;
  selectedBrowserFileIds: number[];
  browserViewState: BrowserViewState;
  tagListViewState: TagListViewState;
}
