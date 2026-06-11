import { tmpdir } from "node:os";

export const app = {
  getPath: (): string => tmpdir(),
  getName: (): string => "asteria-test",
  isPackaged: false,
};

export const ipcMain = {
  handle: (): void => {},
  on: (): void => {},
  removeHandler: (): void => {},
};

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return [];
  }
}

export const nativeImage = {
  createFromPath: (): never => {
    throw new Error("nativeImage is not available in unit tests");
  },
};

export default { app, ipcMain, BrowserWindow, nativeImage };
