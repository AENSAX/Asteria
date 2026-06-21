import { BrowserWindow } from "electron";
import type {
  ConfirmDialogOptions,
  GenericDialogState,
  OperationProgress,
} from "../../shared/ipc.js";
import { IpcEvent } from "../../shared/ipcChannels.js";
import type { MainLanguageId } from "../i18n.js";
import { mainT } from "../i18n.js";
import {
  createAsteriaWindow,
  loadRenderer,
  setupWindowDiagnostics,
} from "./windowFactory.js";

interface DialogManagerOptions {
  readLanguageId: (window?: BrowserWindow | null) => Promise<MainLanguageId>;
}

interface DialogRequest {
  state: GenericDialogState;
  window: BrowserWindow | null;
  resolve?: (confirmed: boolean) => void;
}

const GENERIC_DIALOG_WIDTH = 520;

export interface DialogManager {
  openConfirmDialog: (
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ) => Promise<boolean>;
  openAlertDialog: (
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ) => Promise<void>;
  openProgressDialog: (
    progress: OperationProgress,
    parent?: BrowserWindow | null,
  ) => string;
  updateProgressDialog: (id: string, progress: OperationProgress) => void;
  getDialogState: (id: string) => GenericDialogState | null;
  resizeGenericDialog: (id: string, width: number, height: number) => void;
  resolveGenericDialog: (id: string, confirmed: boolean) => void;
}

export function createDialogManager({
  readLanguageId,
}: DialogManagerOptions): DialogManager {
  const dialogs = new Map<string, DialogRequest>();
  let dialogCounter = 1;

  function createGenericDialogWindow(
    state: GenericDialogState,
    parent?: BrowserWindow | null,
  ): BrowserWindow {
    const parentOptions = parent ? { parent } : {};
    const window = createAsteriaWindow({
      width: GENERIC_DIALOG_WIDTH,
      height: state.kind === "progress" ? 170 : 210,
      minWidth: GENERIC_DIALOG_WIDTH,
      maxWidth: GENERIC_DIALOG_WIDTH,
      minHeight: 150,
      title: state.title,
      show: false,
      ...parentOptions,
      modal: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
    });

    setupWindowDiagnostics(window);
    loadRenderer(window, { window: "dialog", dialogId: state.id });

    // 等渲染端按内容完成首次 resize 后再显示（见 resizeGenericDialog），
    // 避免默认尺寸先闪一下；ready-to-show 后短暂兜底，防止窗口永不显示
    window.once("ready-to-show", () => {
      setTimeout(() => showDialogWindow(window), 300);
    });

    window.once("closed", () => {
      const request = dialogs.get(state.id);

      if (!request) {
        return;
      }

      request.window = null;

      if (
        (state.kind === "confirm" || state.kind === "alert") &&
        request.resolve
      ) {
        request.resolve(false);
        dialogs.delete(state.id);
      }
    });

    return window;
  }

  function needsDialogDefaultText(options: ConfirmDialogOptions): boolean {
    return (
      (options.title === undefined && options.titleKey === undefined) ||
      (options.confirmText === undefined &&
        options.confirmTextKey === undefined) ||
      (options.cancelText === undefined && options.cancelTextKey === undefined)
    );
  }

  function createGenericDialogId(): string {
    const id = `dialog-${dialogCounter}`;
    dialogCounter += 1;
    return id;
  }

  function closeGenericDialog(id: string): void {
    const request = dialogs.get(id);

    if (!request) {
      return;
    }

    dialogs.delete(id);
    request.window?.close();
  }

  async function openConfirmDialog(
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ): Promise<boolean> {
    const languageId = needsDialogDefaultText(options)
      ? await readLanguageId(parent)
      : "zh-CN";
    const id = createGenericDialogId();
    const state: GenericDialogState = {
      id,
      kind: "confirm",
      title: options.title ?? getGenericConfirmTitle(languageId),
      ...(options.titleKey ? { titleKey: options.titleKey } : {}),
      ...(options.titleValues ? { titleValues: options.titleValues } : {}),
      message: options.message,
      ...(options.messageKey ? { messageKey: options.messageKey } : {}),
      ...(options.messageValues
        ? { messageValues: options.messageValues }
        : {}),
      confirmText: options.confirmText ?? getGenericConfirmText(languageId),
      ...(options.confirmTextKey
        ? { confirmTextKey: options.confirmTextKey }
        : {}),
      cancelText: options.cancelText ?? getGenericCancelText(languageId),
      ...(options.cancelTextKey
        ? { cancelTextKey: options.cancelTextKey }
        : {}),
      progress: null,
    };

    return new Promise((resolveDialog) => {
      const window = createGenericDialogWindow(state, parent);
      dialogs.set(id, {
        state,
        window,
        resolve: resolveDialog,
      });
    });
  }

  async function openAlertDialog(
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ): Promise<void> {
    const languageId = needsDialogDefaultText(options)
      ? await readLanguageId(parent)
      : "zh-CN";
    const id = createGenericDialogId();
    const state: GenericDialogState = {
      id,
      kind: "alert",
      title: options.title ?? getGenericAlertTitle(languageId),
      ...(options.titleKey ? { titleKey: options.titleKey } : {}),
      ...(options.titleValues ? { titleValues: options.titleValues } : {}),
      message: options.message,
      ...(options.messageKey ? { messageKey: options.messageKey } : {}),
      ...(options.messageValues
        ? { messageValues: options.messageValues }
        : {}),
      confirmText: options.confirmText ?? getGenericOkText(languageId),
      ...(options.confirmTextKey
        ? { confirmTextKey: options.confirmTextKey }
        : {}),
      cancelText: options.cancelText ?? getGenericCancelText(languageId),
      ...(options.cancelTextKey
        ? { cancelTextKey: options.cancelTextKey }
        : {}),
      progress: null,
    };

    return new Promise((resolveDialog) => {
      const window = createGenericDialogWindow(state, parent);
      dialogs.set(id, {
        state,
        window,
        resolve: () => resolveDialog(),
      });
    });
  }

  function openProgressDialog(
    progress: OperationProgress,
    parent?: BrowserWindow | null,
  ): string {
    const id = createGenericDialogId();
    const state: GenericDialogState = {
      id,
      kind: "progress",
      title: progress.title,
      ...(progress.titleKey ? { titleKey: progress.titleKey } : {}),
      ...(progress.titleValues ? { titleValues: progress.titleValues } : {}),
      message: progress.message,
      confirmText: "确定",
      cancelText: "取消",
      progress,
    };
    const window = createGenericDialogWindow(state, parent);
    dialogs.set(id, { state, window });

    return id;
  }

  function updateProgressDialog(id: string, progress: OperationProgress): void {
    const request = dialogs.get(id);

    if (!request) {
      return;
    }

    const nextState: GenericDialogState = {
      ...request.state,
      title: progress.title,
      message: progress.message,
      progress,
    };

    if (progress.titleKey) {
      nextState.titleKey = progress.titleKey;
    } else {
      delete nextState.titleKey;
    }

    if (progress.titleValues) {
      nextState.titleValues = progress.titleValues;
    } else {
      delete nextState.titleValues;
    }

    request.state = nextState;

    request.window?.webContents.send(
      IpcEvent.DIALOG_STATE_CHANGED,
      request.state,
    );

    if (progress.completed) {
      setTimeout(() => closeGenericDialog(id), 400);
    }
  }

  function getDialogState(id: string): GenericDialogState | null {
    return dialogs.get(id)?.state ?? null;
  }

  function resizeGenericDialog(
    id: string,
    _width: number,
    height: number,
  ): void {
    const request = dialogs.get(id);

    if (!request?.window || request.window.isDestroyed()) {
      return;
    }

    const nextWidth = GENERIC_DIALOG_WIDTH;
    const nextHeight = Math.min(560, Math.max(90, Math.ceil(height)));
    request.window.setContentSize(nextWidth, nextHeight);
    showDialogWindow(request.window);
  }

  function resolveGenericDialog(id: string, confirmed: boolean): void {
    const request = dialogs.get(id);

    if (!request) {
      return;
    }

    request.resolve?.(confirmed);
    dialogs.delete(id);
    request.window?.close();
  }

  return {
    openConfirmDialog,
    openAlertDialog,
    openProgressDialog,
    updateProgressDialog,
    getDialogState,
    resizeGenericDialog,
    resolveGenericDialog,
  };
}

function showDialogWindow(window: BrowserWindow): void {
  if (window.isDestroyed() || window.isVisible()) {
    return;
  }

  window.center();
  window.show();
}

function getGenericConfirmTitle(languageId: MainLanguageId): string {
  return mainT(languageId, "common.confirm");
}

function getGenericAlertTitle(languageId: MainLanguageId): string {
  return mainT(languageId, "common.notice");
}

function getGenericConfirmText(languageId: MainLanguageId): string {
  return mainT(languageId, "common.confirm");
}

function getGenericOkText(languageId: MainLanguageId): string {
  return mainT(languageId, "common.ok");
}

function getGenericCancelText(languageId: MainLanguageId): string {
  return mainT(languageId, "common.cancel");
}
