import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Model } from "flexlayout-react";
import type { ImportProgress, WorkStatus } from "../../../shared/ipc";
import type { TranslationFunction } from "../utils/language";
import {
  getPageNumber,
  getPageTitle,
  syncViewTabTitles,
} from "./workbenchModel";
import type { PageTitleMode } from "./workbenchState";
import { createIdleProgress, createIdleWorkStatus } from "./workbenchStatus";

interface LanguageSyncedPage {
  id: string;
  title: string;
  titleMode: PageTitleMode;
  model: Model;
}

interface WorkbenchLanguageSyncOptions<PageItem extends LanguageSyncedPage> {
  languageId: string;
  setPages: Dispatch<SetStateAction<PageItem[]>>;
  setProgress: Dispatch<SetStateAction<ImportProgress>>;
  setWorkStatus: Dispatch<SetStateAction<WorkStatus>>;
  t: TranslationFunction;
}

export function useWorkbenchLanguageSync<PageItem extends LanguageSyncedPage>({
  languageId,
  setPages,
  setProgress,
  setWorkStatus,
  t,
}: WorkbenchLanguageSyncOptions<PageItem>): void {
  useEffect(() => {
    setProgress((current) =>
      current.phase === "idle" ? createIdleProgress(t) : current,
    );
    setWorkStatus((current) =>
      current.active ? current : createIdleWorkStatus(t),
    );
  }, [languageId, setProgress, setWorkStatus, t]);

  useEffect(() => {
    setPages((currentPages) => {
      let changed = false;
      const nextPages = currentPages.map((page) => {
        let nextPage = page;

        if (page.titleMode !== "default") {
          const syncedPage = syncViewTabTitles(nextPage, t);
          changed = changed || syncedPage !== nextPage;
          return syncedPage;
        }

        const nextTitle = getPageTitle(getPageNumber(page.id), t);

        if (page.title !== nextTitle) {
          changed = true;
          nextPage = { ...page, title: nextTitle };
        }

        const syncedPage = syncViewTabTitles(nextPage, t);
        changed = changed || syncedPage !== nextPage;
        return syncedPage;
      });

      return changed ? nextPages : currentPages;
    });
  }, [languageId, setPages, t]);
}
