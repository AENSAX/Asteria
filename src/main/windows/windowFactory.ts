import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type ChildWindowOptions = BrowserWindowConstructorOptions & {
  query?: Record<string, string>;
  singleton?: boolean;
  singletonTitle?: string;
  windowMode: string;
};

export function createAsteriaWindow(
  options: BrowserWindowConstructorOptions,
): BrowserWindow {
  const icon = getWindowIconPath();

  return new BrowserWindow({
    backgroundColor: "#1f2225",
    ...(icon ? { icon } : {}),
    ...options,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      ...options.webPreferences,
    },
  });
}

export function showWhenReady(window: BrowserWindow): void {
  window.once("ready-to-show", () => {
    window.show();
  });
}

export function createChildWindow({
  query,
  singleton = false,
  singletonTitle,
  windowMode,
  ...options
}: ChildWindowOptions): BrowserWindow {
  const title = options.title ?? "";
  const existing =
    singleton && title
      ? BrowserWindow.getAllWindows().find(
          (window) =>
            window.getTitle() === (singletonTitle ?? title) &&
            !window.isDestroyed(),
        )
      : null;

  if (existing) {
    existing.show();
    existing.focus();
    return existing;
  }

  const window = createAsteriaWindow({
    show: false,
    ...options,
  });

  setupWindowDiagnostics(window);
  loadRenderer(window, { window: windowMode, ...(query ?? {}) });
  showWhenReady(window);

  return window;
}

export function setupWindowDiagnostics(window: BrowserWindow): void {
  const configuredTitle = window.getTitle();
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(configuredTitle);
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        "Renderer failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
    },
  );

  if (!app.isPackaged && process.env.ASTERIA_RENDERER_LOGS === "1") {
    window.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        console.log(
          `Renderer console [${level}] ${sourceId}:${line} ${message}`,
        );
      },
    );
  }

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details.reason, details.exitCode);
  });
}

export function loadRenderer(
  window: BrowserWindow,
  query?: Record<string, string>,
): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (!app.isPackaged && rendererUrl) {
    const url = new URL(rendererUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    window.loadURL(url.toString());
  } else {
    window.loadFile(
      join(__dirname, "../renderer/index.html"),
      query ? { query } : undefined,
    );
  }
}

function getWindowIconPath(): string | undefined {
  const iconFileName =
    process.platform === "darwin"
      ? "app.icns"
      : process.platform === "win32"
        ? "app.ico"
        : "app.png";
  const candidates = [
    join(process.resourcesPath, "icons", iconFileName),
    join(app.getAppPath(), "resources", "icons", iconFileName),
    join(process.cwd(), "resources", "icons", iconFileName),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}
