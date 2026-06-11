import { BrowserWindow, type IpcMain } from "electron";
import type {
  ConfirmDialogOptions,
  GenericDialogState,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";

export interface DialogHandlersContext {
  openConfirmDialog: (
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ) => Promise<boolean>;
  openAlertDialog: (
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ) => Promise<void>;
  getDialogState: (dialogId: string) => GenericDialogState | null;
  resizeGenericDialog: (
    dialogId: string,
    width: number,
    height: number,
  ) => void;
  resolveGenericDialog: (dialogId: string, confirmed: boolean) => void;
}

function normalizeConfirmDialogOptions(value: unknown): ConfirmDialogOptions {
  const options = value as Partial<ConfirmDialogOptions> | null;
  const message =
    typeof options?.message === "string" ? options.message.trim() : "";

  if (!message) {
    throw new Error("dialog message required");
  }

  return {
    ...(typeof options?.title === "string" && options.title.trim()
      ? { title: options.title.trim() }
      : {}),
    ...(typeof options?.titleKey === "string" && options.titleKey.trim()
      ? { titleKey: options.titleKey.trim() }
      : {}),
    ...(isDialogValues(options?.titleValues)
      ? { titleValues: options.titleValues }
      : {}),
    message,
    ...(typeof options?.messageKey === "string" && options.messageKey.trim()
      ? { messageKey: options.messageKey.trim() }
      : {}),
    ...(isDialogValues(options?.messageValues)
      ? { messageValues: options.messageValues }
      : {}),
    ...(typeof options?.confirmText === "string" && options.confirmText.trim()
      ? { confirmText: options.confirmText.trim() }
      : {}),
    ...(typeof options?.confirmTextKey === "string" &&
    options.confirmTextKey.trim()
      ? { confirmTextKey: options.confirmTextKey.trim() }
      : {}),
    ...(typeof options?.cancelText === "string" && options.cancelText.trim()
      ? { cancelText: options.cancelText.trim() }
      : {}),
    ...(typeof options?.cancelTextKey === "string" &&
    options.cancelTextKey.trim()
      ? { cancelTextKey: options.cancelTextKey.trim() }
      : {}),
  };
}

function isDialogValues(
  value: unknown,
): value is Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => typeof item === "string" || typeof item === "number",
  );
}

export function registerDialogHandlers(
  ipcMain: IpcMain,
  context: DialogHandlersContext,
): void {
  ipcMain.handle(IpcChannel.DIALOG_CONFIRM, (event, options: unknown) =>
    context.openConfirmDialog(
      normalizeConfirmDialogOptions(options),
      BrowserWindow.fromWebContents(event.sender),
    ),
  );
  ipcMain.handle(IpcChannel.DIALOG_ALERT, (event, options: unknown) =>
    context.openAlertDialog(
      normalizeConfirmDialogOptions(options),
      BrowserWindow.fromWebContents(event.sender),
    ),
  );
  ipcMain.handle(IpcChannel.DIALOG_GET_STATE, (_event, dialogId: unknown) => {
    if (typeof dialogId !== "string") {
      return null;
    }

    return context.getDialogState(dialogId);
  });
  ipcMain.handle(
    IpcChannel.DIALOG_RESIZE,
    (_event, dialogId: unknown, width: unknown, height: unknown) => {
      if (
        typeof dialogId === "string" &&
        typeof width === "number" &&
        typeof height === "number"
      ) {
        context.resizeGenericDialog(dialogId, width, height);
      }
    },
  );
  ipcMain.handle(
    IpcChannel.DIALOG_RESOLVE,
    (_event, dialogId: unknown, confirmed: unknown) => {
      if (typeof dialogId === "string") {
        context.resolveGenericDialog(dialogId, confirmed === true);
      }
    },
  );
}
