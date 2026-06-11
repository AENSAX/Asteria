export interface InterfaceSettings {
  browserPageSize: number;
  browserPreviewSize: number;
}

const INTERFACE_SETTINGS_KEY = "asteria.interface-settings.v1";
const INTERFACE_SETTINGS_EVENT = "asteria:interface-settings-changed";
const INTERFACE_SETTINGS_CHANNEL = "asteria-interface-settings";
export const DEFAULT_BROWSER_PAGE_SIZE = 100;
export const DEFAULT_BROWSER_PREVIEW_SIZE = 128;
export const MIN_BROWSER_PAGE_SIZE = 20;
export const MIN_BROWSER_PREVIEW_SIZE = 64;
export const MAX_BROWSER_PREVIEW_SIZE = 320;

export function loadInterfaceSettings(): InterfaceSettings {
  const rawSettings = window.localStorage.getItem(INTERFACE_SETTINGS_KEY);

  if (!rawSettings) {
    return createDefaultInterfaceSettings();
  }

  try {
    return normalizeInterfaceSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultInterfaceSettings();
  }
}

export function saveInterfaceSettings(
  settings: InterfaceSettings,
): InterfaceSettings {
  const normalizedSettings = normalizeInterfaceSettings(settings);
  window.localStorage.setItem(
    INTERFACE_SETTINGS_KEY,
    JSON.stringify(normalizedSettings),
  );
  window.dispatchEvent(new CustomEvent(INTERFACE_SETTINGS_EVENT));

  try {
    const channel = new BroadcastChannel(INTERFACE_SETTINGS_CHANNEL);
    channel.postMessage(normalizedSettings);
    channel.close();
  } catch {
    // BroadcastChannel is best-effort; storage still persists the setting.
  }

  return normalizedSettings;
}

export function listenInterfaceSettingsChanged(
  listener: (settings: InterfaceSettings) => void,
): () => void {
  const handleChange = (): void => {
    listener(loadInterfaceSettings());
  };

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === INTERFACE_SETTINGS_KEY) {
      handleChange();
    }
  };

  window.addEventListener(INTERFACE_SETTINGS_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(INTERFACE_SETTINGS_CHANNEL);
    channel.addEventListener("message", handleChange);
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener(INTERFACE_SETTINGS_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleChange);
    channel?.close();
  };
}

function createDefaultInterfaceSettings(): InterfaceSettings {
  return {
    browserPageSize: DEFAULT_BROWSER_PAGE_SIZE,
    browserPreviewSize: DEFAULT_BROWSER_PREVIEW_SIZE,
  };
}

function normalizeInterfaceSettings(value: unknown): InterfaceSettings {
  const settings = value as Partial<InterfaceSettings> | null;

  return {
    browserPageSize: normalizeBrowserPageSize(settings?.browserPageSize),
    browserPreviewSize: normalizeBrowserPreviewSize(
      settings?.browserPreviewSize,
    ),
  };
}

export function normalizeBrowserPageSize(value: unknown): number {
  const size = Number(value);

  if (!Number.isFinite(size)) {
    return DEFAULT_BROWSER_PAGE_SIZE;
  }

  return Math.max(MIN_BROWSER_PAGE_SIZE, Math.round(size));
}

export function normalizeBrowserPreviewSize(value: unknown): number {
  const size = Number(value);

  if (!Number.isFinite(size)) {
    return DEFAULT_BROWSER_PREVIEW_SIZE;
  }

  return Math.min(
    MAX_BROWSER_PREVIEW_SIZE,
    Math.max(MIN_BROWSER_PREVIEW_SIZE, Math.round(size)),
  );
}
