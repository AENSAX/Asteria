import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GenericDialogState } from "../../../shared/ipc";
import { useLanguage } from "../utils/language";

interface DialogWindowProps {
  dialogId: string;
}

export function DialogWindow({ dialogId }: DialogWindowProps): JSX.Element {
  const { t } = useLanguage();
  const [state, setState] = useState<GenericDialogState | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void loadState();

    if (!window.asteria) {
      return undefined;
    }

    return window.asteria.onDialogStateChanged((nextState) => {
      if (nextState.id === dialogId) {
        setState(nextState);
      }
    });
  }, [dialogId]);

  async function loadState(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setState(await window.asteria.getDialogState(dialogId));
  }

  async function resolve(confirmed: boolean): Promise<void> {
    await window.asteria?.resolveDialog(dialogId, confirmed);
  }

  useLayoutEffect(() => {
    if (!state || !rootRef.current || !window.asteria) {
      return undefined;
    }

    const root = rootRef.current;
    let resizeFrame = 0;

    function resizeToContent(): void {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const width = Math.ceil(root.scrollWidth) + 4;
        const height = Math.ceil(root.scrollHeight) + 4;
        void window.asteria?.resizeDialog(dialogId, width, height);
      });
    }

    const observer = new ResizeObserver(resizeToContent);
    observer.observe(root);
    resizeToContent();

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
    };
  }, [dialogId, state]);

  if (!state) {
    return (
      <section
        className="grid w-fit min-w-[280px] overflow-hidden bg-(--bg) text-[11px] text-(--ink)"
        ref={rootRef}
      >
        {t("window.dialog.loading")}
      </section>
    );
  }

  const percent =
    state.progress && state.progress.total > 0
      ? Math.floor((state.progress.processed / state.progress.total) * 100)
      : 0;

  return (
    <section
      className="grid w-fit min-w-[280px] max-w-[900px] overflow-hidden bg-(--bg) text-[11px] text-(--ink)"
      ref={rootRef}
    >
      <main className="min-w-0 min-h-0 p-3">
        <div className="max-w-[860px]">{state.message}</div>
        {state.kind === "progress" && state.progress ? (
          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2">
              <progress max={100} value={percent} />
              <span className="text-right text-(--muted)">{percent}%</span>
            </div>
            <footer className="text-(--muted)">
              {state.progress.processed} / {state.progress.total}
            </footer>
          </div>
        ) : null}
      </main>
      {state.kind === "confirm" || state.kind === "alert" ? (
        <footer className="flex justify-end gap-1 border-t border-(--line) bg-(--surface-bg) p-2">
          {state.kind === "confirm" ? (
            <button
              className="ui-button min-w-14.5"
              type="button"
              onClick={() => void resolve(false)}
            >
              {state.cancelText}
            </button>
          ) : null}
          <button
            className="ui-button min-w-[58px]"
            type="button"
            onClick={() => void resolve(true)}
          >
            {state.confirmText}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
