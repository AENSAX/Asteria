import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GenericDialogState } from '../../../shared/ipc';

interface DialogWindowProps {
  dialogId: string;
}

export function DialogWindow({ dialogId }: DialogWindowProps): JSX.Element {
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
    return <section className="generic-dialog-window" ref={rootRef}>加载中</section>;
  }

  const percent = state.progress && state.progress.total > 0
    ? Math.floor((state.progress.processed / state.progress.total) * 100)
    : 0;

  return (
    <section className="generic-dialog-window" ref={rootRef}>
      <main>
        <div className="generic-dialog-message">{state.message}</div>
        {state.kind === 'progress' && state.progress ? (
          <div className="generic-dialog-progress">
            <div className="progress-row">
              <progress max={100} value={percent} />
              <span>{percent}%</span>
            </div>
            <footer>
              {state.progress.processed} / {state.progress.total}
            </footer>
          </div>
        ) : null}
      </main>
      {state.kind === 'confirm' || state.kind === 'alert' ? (
        <footer>
          {state.kind === 'confirm' ? (
            <button type="button" onClick={() => void resolve(false)}>
              {state.cancelText}
            </button>
          ) : null}
          <button type="button" onClick={() => void resolve(true)}>
            {state.confirmText}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
