import type { TranslationFunction } from "../utils/language";
import { createPageModel, syncViewTabTitles } from "./workbenchModel";
import {
  defaultBrowserViewState,
  defaultTagListViewState,
  emptySearchInputState,
  type PageTitleMode,
} from "./workbenchState";
import type { PageItem } from "./workbenchTypes";

interface CreatePageItemOptions {
  pageNumber: number;
  templateText: string;
  title: string;
  titleMode?: PageTitleMode;
  t: TranslationFunction;
}

export function createPageItemFromTemplate({
  pageNumber,
  templateText,
  title,
  titleMode = "default",
  t,
}: CreatePageItemOptions): PageItem {
  const page: PageItem = {
    id: `page-${pageNumber}`,
    title,
    titleMode,
    model: createPageModel(templateText),
    searchFilters: [],
    searchInputState: emptySearchInputState,
    searchAppendTagRequest: null,
    viewRefreshSequenceByTabId: {},
    importQueueActive: false,
    selectedBrowserFileIds: [],
    browserViewState: defaultBrowserViewState,
    tagListViewState: defaultTagListViewState,
  };

  return syncViewTabTitles(page, t);
}
