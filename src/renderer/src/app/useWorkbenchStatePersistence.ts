import { useEffect, useRef } from "react";
import type { SavedWorkbenchState } from "./workbenchState";
import { writeSavedWorkbenchState } from "./workbenchState";

interface WorkbenchStatePersistenceOptions<PageItem> {
  activePageId: string;
  languageId: string;
  pages: PageItem[];
  workbenchLoaded: boolean;
  createSavedState: (
    pages: PageItem[],
    activePageId: string,
  ) => SavedWorkbenchState;
}

interface WorkbenchStatePersistence {
  flushWorkbenchStateSave: () => void;
  queueWorkbenchStateSave: () => void;
}

export function useWorkbenchStatePersistence<PageItem>({
  activePageId,
  createSavedState,
  languageId,
  pages,
  workbenchLoaded,
}: WorkbenchStatePersistenceOptions<PageItem>): WorkbenchStatePersistence {
  const pagesRef = useRef(pages);
  const activePageIdRef = useRef(activePageId);
  const createSavedStateRef = useRef(createSavedState);
  const saveWorkbenchStateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    createSavedStateRef.current = createSavedState;
  }, [createSavedState]);

  function saveWorkbenchState(): void {
    writeSavedWorkbenchState(
      createSavedStateRef.current(pagesRef.current, activePageIdRef.current),
    );
  }

  function flushWorkbenchStateSave(): void {
    if (saveWorkbenchStateTimerRef.current !== null) {
      window.clearTimeout(saveWorkbenchStateTimerRef.current);
      saveWorkbenchStateTimerRef.current = null;
    }

    saveWorkbenchState();
  }

  function queueWorkbenchStateSave(): void {
    if (!workbenchLoaded) {
      return;
    }

    if (saveWorkbenchStateTimerRef.current !== null) {
      window.clearTimeout(saveWorkbenchStateTimerRef.current);
    }

    saveWorkbenchStateTimerRef.current = window.setTimeout(() => {
      saveWorkbenchStateTimerRef.current = null;
      saveWorkbenchState();
    }, 0);
  }

  useEffect(() => {
    function saveBeforeClose(): void {
      flushWorkbenchStateSave();
    }

    function saveBeforeHide(): void {
      flushWorkbenchStateSave();
    }

    function saveOnVisibilityChange(): void {
      if (document.visibilityState === "hidden") {
        flushWorkbenchStateSave();
      }
    }

    window.addEventListener("beforeunload", saveBeforeClose);
    window.addEventListener("pagehide", saveBeforeHide);
    document.addEventListener("visibilitychange", saveOnVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", saveBeforeClose);
      window.removeEventListener("pagehide", saveBeforeHide);
      document.removeEventListener("visibilitychange", saveOnVisibilityChange);
    };
  }, []);

  useEffect(() => {
    queueWorkbenchStateSave();

    return () => {
      if (saveWorkbenchStateTimerRef.current !== null) {
        window.clearTimeout(saveWorkbenchStateTimerRef.current);
        saveWorkbenchStateTimerRef.current = null;
      }
    };
  }, [pages, activePageId, workbenchLoaded, languageId]);

  return {
    flushWorkbenchStateSave,
    queueWorkbenchStateSave,
  };
}
