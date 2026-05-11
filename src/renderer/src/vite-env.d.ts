/// <reference types="vite/client" />

import type { AsteriaApi } from "../../shared/ipc";

declare module "monaco-editor/esm/vs/editor/editor.api.js" {
  export * from "monaco-editor";
}

declare global {
  interface Window {
    asteria: AsteriaApi;
    asteriaPreloadDebug?: {
      loadedAt: string;
      hasIpcRenderer: boolean;
      hasWebUtils: boolean;
    };
  }
}

export {};
