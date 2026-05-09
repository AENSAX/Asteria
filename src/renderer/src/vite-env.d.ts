/// <reference types="vite/client" />

import type { AsteriaApi } from "../../shared/ipc";

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
