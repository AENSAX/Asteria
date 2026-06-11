import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ImportProgress, WorkStatus } from "../../../shared/ipc";
import {
  applyLanguage,
  listenLanguageSettingsChanged,
  type TranslationFunction,
} from "../utils/language";
import { applyTheme, listenThemeSettingsChanged } from "../utils/themes";

interface WorkbenchExternalEventsOptions {
  createIdleProgress: (t: TranslationFunction) => ImportProgress;
  reloadPageLayoutState: () => Promise<unknown>;
  setProgress: Dispatch<SetStateAction<ImportProgress>>;
  setWorkStatus: Dispatch<SetStateAction<WorkStatus>>;
  syncImportQueueLockFromMain: () => Promise<void>;
  t: TranslationFunction;
}

export function useWorkbenchExternalEvents({
  createIdleProgress,
  reloadPageLayoutState,
  setProgress,
  setWorkStatus,
  syncImportQueueLockFromMain,
  t,
}: WorkbenchExternalEventsOptions): void {
  useEffect(
    () =>
      listenThemeSettingsChanged((settings) => {
        applyTheme(settings.themeId);
      }),
    [],
  );

  useEffect(
    () =>
      listenLanguageSettingsChanged((settings) => {
        applyLanguage(settings.languageId);
      }),
    [],
  );

  useEffect(() => {
    if (!window.asteria) {
      setProgress({
        ...createIdleProgress(t),
        phase: "failed",
        message: t("app.status.preloadUnavailable"),
      });
      return undefined;
    }

    return window.asteria.onImportProgress((nextProgress) => {
      setProgress(nextProgress);
    });
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    void window.asteria.getWorkStatus().then(setWorkStatus);

    return window.asteria.onWorkStatusChanged((nextStatus) => {
      setWorkStatus(nextStatus);
    });
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onImportQueueChanged(() => {
      void syncImportQueueLockFromMain();
    });
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onPageLayoutChanged(() => {
      void reloadPageLayoutState();
    });
  }, []);
}
