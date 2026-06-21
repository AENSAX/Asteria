import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { TranslationFunction } from "../utils/language";
import { createPageItemFromTemplate } from "./workbenchPageFactory";
import {
  createPageModelFromJson,
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

      if (savedState && savedState.pages.length > 0) {
        const restoredPages = await Promise.all(savedState.pages.map(async (page) => {
          const hasImportQueue = window.asteria
            ? (await window.asteria.listImportQueueFiles(page.id)).length > 0
            : false;
          const restoredPage: PageItem = {
            id: page.id,
            title:
              page.titleMode === "default"
                ? getPageTitle(getPageNumber(page.id), t)
                : page.title,
            titleMode: page.titleMode,
            model: createPageModelFromJson(page.modelJson),
            searchFilters: page.searchFilters,
            searchInputState: page.searchInputState,
            searchAppendTagRequest: null,
            viewRefreshSequenceByTabId: {},
            importQueueActive: page.importQueueActive || hasImportQueue,
            selectedBrowserFileIds: [],
            browserViewState: page.browserViewState,
            tagListViewState: page.tagListViewState,
          };

          return syncViewTabTitles(restoredPage, t);
        }));

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
        page.importQueueActive = window.asteria
          ? (await window.asteria.listImportQueueFiles(page.id)).length > 0
          : false;
        setPages([page]);
        setActivePageId(page.id);
        syncCountersFromPages([page]);
      }

      setWorkbenchLoaded(true);
    }
  }, []);
}
