import { useEffect, type Dispatch, type SetStateAction } from "react";
import { Model } from "flexlayout-react";
import type { TranslationFunction } from "../utils/language";
import { createPageItemFromTemplate } from "./workbenchPageFactory";
import {
  getPageNumber,
  getPageTitle,
  syncViewTabTitles,
} from "./workbenchModel";
import { readSavedWorkbenchState } from "./workbenchState";
import type { PageItem } from "./workbenchTypes";

interface PageLayoutState {
  templateText: {
    default: string;
    newPage: string;
  };
}

interface WorkbenchInitializerOptions {
  reloadPageLayoutState: () => Promise<PageLayoutState>;
  setActivePageId: Dispatch<SetStateAction<string>>;
  setPages: Dispatch<SetStateAction<PageItem[]>>;
  setWorkbenchLoaded: Dispatch<SetStateAction<boolean>>;
  syncCountersFromPages: (pages: PageItem[]) => void;
  t: TranslationFunction;
}

export function useWorkbenchInitializer({
  reloadPageLayoutState,
  setActivePageId,
  setPages,
  setWorkbenchLoaded,
  syncCountersFromPages,
  t,
}: WorkbenchInitializerOptions): void {
  useEffect(() => {
    void initializeWorkbench();

    async function initializeWorkbench(): Promise<void> {
      const pageLayoutState = await reloadPageLayoutState();
      const savedState = readSavedWorkbenchState();
      const hasImportQueue = window.asteria
        ? (await window.asteria.listImportQueueFiles()).length > 0
        : false;

      if (savedState && savedState.pages.length > 0) {
        const restoredPages = savedState.pages.map((page, index) => {
          const restoredPage: PageItem = {
            id: page.id,
            title:
              page.titleMode === "default"
                ? getPageTitle(getPageNumber(page.id), t)
                : page.title,
            titleMode: page.titleMode,
            model: Model.fromJson(page.modelJson),
            searchFilters: page.searchFilters,
            searchInputState: page.searchInputState,
            searchAppendTagRequest: null,
            viewRefreshSequenceByTabId: {},
            importQueueActive:
              page.importQueueActive ||
              (hasImportQueue &&
                (page.id === savedState.activePageId ||
                  (!savedState.activePageId && index === 0))),
            selectedBrowserFileIds: [],
            browserViewState: page.browserViewState,
            tagListViewState: page.tagListViewState,
          };

          return syncViewTabTitles(restoredPage, t);
        });

        setPages(restoredPages);
        setActivePageId(
          restoredPages.some((page) => page.id === savedState.activePageId)
            ? savedState.activePageId
            : (restoredPages[0]?.id ?? ""),
        );
        syncCountersFromPages(restoredPages);
      } else {
        const page = createPageItemFromTemplate({
          pageNumber: 1,
          t,
          templateText: pageLayoutState.templateText.default,
          title: t("app.pageName", { index: 1 }),
        });
        page.importQueueActive = hasImportQueue;
        setPages([page]);
        setActivePageId(page.id);
        syncCountersFromPages([page]);
      }

      setWorkbenchLoaded(true);
    }
  }, []);
}
