export type ThemeId = "default" | "light";

interface ThemePalette {
  system: {
    colorScheme: "dark" | "light";
  };
  surface: {
    background: string;
    panel: string;
    panelStrong: string;
    appBar: string;
    tabBar: string;
    statusBar: string;
    base: string;
    raised: string;
    inset: string;
    inputPanel: string;
    media: string;
    deep: string;
    splitterHover: string;
    tag: string;
    tagHover: string;
    groupHeader: string;
    selection: string;
    danger: string;
  };
  text: {
    primary: string;
    muted: string;
    disabled: string;
    disabledStrong: string;
    active: string;
    selection: string;
    groupHeader: string;
    success: string;
    successSoft: string;
    warning: string;
    danger: string;
    accent: string;
    media: string;
  };
  border: {
    normal: string;
    strong: string;
    dark: string;
    hover: string;
  };
  action: {
    accent: string;
    accentWeak: string;
    accentOverlay: string;
    buttonHover: string;
    buttonActive: string;
    success: string;
    successWeak: string;
    danger: string;
    warning: string;
    favorite: string;
  };
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  palette: ThemePalette;
}

export interface ThemeSettings {
  themeId: ThemeId;
}

const THEME_SETTINGS_KEY = "asteria.theme-settings.v1";
const THEME_SETTINGS_EVENT = "asteria:theme-settings-changed";
const THEME_SETTINGS_CHANNEL = "asteria-theme-settings";

export const themeDefinitions: ThemeDefinition[] = [
  {
    id: "default",
    name: "默认主题",
    palette: {
      system: {
        colorScheme: "dark",
      },
      surface: {
        background: "#1f2225",
        panel: "#25292d",
        panelStrong: "#2b3035",
        appBar: "#202326",
        tabBar: "#1b1e21",
        statusBar: "#181b1f",
        base: "#202428",
        raised: "#242a2f",
        inset: "#181a1d",
        inputPanel: "#1d2125",
        media: "#171a1d",
        deep: "#15181b",
        splitterHover: "#252a2f",
        tag: "#26323a",
        tagHover: "#2b3942",
        groupHeader: "#30363b",
        selection: "#202b34",
        danger: "#3a2525",
      },
      text: {
        primary: "#d9dde1",
        muted: "#9aa3aa",
        disabled: "#68727a",
        disabledStrong: "#5d666d",
        active: "#e7f1fb",
        selection: "#eef5fb",
        groupHeader: "#d4d9de",
        success: "#58d68d",
        successSoft: "#6ec17b",
        warning: "#e0c68c",
        danger: "#f0d5cf",
        accent: "#cfe5ff",
        media: "#cfe2f2",
      },
      border: {
        normal: "#373d43",
        strong: "#4a535b",
        dark: "#111417",
        hover: "#5d6872",
      },
      action: {
        accent: "#2d7dd2",
        accentWeak: "#183a5a",
        accentOverlay: "rgb(45 125 210 / 18%)",
        buttonHover: "#323941",
        buttonActive: "#263849",
        success: "#5fa36f",
        successWeak: "#243f2d",
        danger: "#d06b58",
        warning: "#b08d57",
        favorite: "#ff6fae",
      },
    },
  },
  {
    id: "light",
    name: "浅色主题",
    palette: {
      system: {
        colorScheme: "light",
      },
      surface: {
        background: "#eef1f4",
        panel: "#ffffff",
        panelStrong: "#e5e9ee",
        appBar: "#f7f9fb",
        tabBar: "#e7ebf0",
        statusBar: "#dce2e8",
        base: "#f4f6f8",
        raised: "#e9edf2",
        inset: "#ffffff",
        inputPanel: "#f8fafc",
        media: "#f7f9fb",
        deep: "#e1e7ee",
        splitterHover: "#d5dde5",
        tag: "#e7f0f7",
        tagHover: "#d8e7f2",
        groupHeader: "#d8dee6",
        selection: "#d8eafa",
        danger: "#f8ddd8",
      },
      text: {
        primary: "#20262c",
        muted: "#56616d",
        disabled: "#8a949e",
        disabledStrong: "#747f8a",
        active: "#123a5d",
        selection: "#152f45",
        groupHeader: "#1f2933",
        success: "#167344",
        successSoft: "#2f8655",
        warning: "#7a5318",
        danger: "#8b2f25",
        accent: "#174d7a",
        media: "#35566f",
      },
      border: {
        normal: "#c9d1d9",
        strong: "#aeb8c2",
        dark: "#b8c2cc",
        hover: "#7e8b97",
      },
      action: {
        accent: "#2268a8",
        accentWeak: "#d7e9f8",
        accentOverlay: "rgb(34 104 168 / 18%)",
        buttonHover: "#e7edf3",
        buttonActive: "#d8e8f6",
        success: "#3f8f5a",
        successWeak: "#d8efdf",
        danger: "#b85043",
        warning: "#b27622",
        favorite: "#d83d86",
      },
    },
  },
];

export const themeOptions = themeDefinitions.map((theme) => ({
  id: theme.id,
  name: theme.name,
}));

export function loadThemeSettings(): ThemeSettings {
  const rawSettings = window.localStorage.getItem(THEME_SETTINGS_KEY);

  if (!rawSettings) {
    return createDefaultThemeSettings();
  }

  try {
    return normalizeThemeSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultThemeSettings();
  }
}

export function saveThemeSettings(settings: ThemeSettings): ThemeSettings {
  const normalizedSettings = normalizeThemeSettings(settings);
  window.localStorage.setItem(
    THEME_SETTINGS_KEY,
    JSON.stringify(normalizedSettings),
  );
  applyTheme(normalizedSettings.themeId);
  window.dispatchEvent(new CustomEvent(THEME_SETTINGS_EVENT));

  try {
    const channel = new BroadcastChannel(THEME_SETTINGS_CHANNEL);
    channel.postMessage(normalizedSettings);
    channel.close();
  } catch {
    // BroadcastChannel is best-effort; storage still persists the setting.
  }

  return normalizedSettings;
}

export function listenThemeSettingsChanged(
  listener: (settings: ThemeSettings) => void,
): () => void {
  const handleChange = (): void => {
    listener(loadThemeSettings());
  };

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === THEME_SETTINGS_KEY) {
      handleChange();
    }
  };

  window.addEventListener(THEME_SETTINGS_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(THEME_SETTINGS_CHANNEL);
    channel.addEventListener("message", handleChange);
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener(THEME_SETTINGS_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleChange);
    channel?.close();
  };
}

export function applySavedTheme(): void {
  applyTheme(loadThemeSettings().themeId);
}

export function applyTheme(themeId: ThemeId): void {
  const theme = getThemeDefinition(themeId);
  const root = document.documentElement;

  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.palette.system.colorScheme;

  for (const [name, value] of Object.entries(
    createThemeVariables(theme.palette),
  )) {
    root.style.setProperty(name, value);
  }

  void window.asteria?.setNativeTheme(theme.palette.system.colorScheme);
}

function createDefaultThemeSettings(): ThemeSettings {
  return {
    themeId: "default",
  };
}

function normalizeThemeSettings(value: unknown): ThemeSettings {
  const settings = value as Partial<ThemeSettings> | null;
  const themeId = isThemeId(settings?.themeId) ? settings.themeId : "default";

  return { themeId };
}

function isThemeId(value: unknown): value is ThemeId {
  return themeDefinitions.some((theme) => theme.id === value);
}

function getThemeDefinition(themeId: ThemeId): ThemeDefinition {
  return (
    themeDefinitions.find((theme) => theme.id === themeId) ??
    themeDefinitions[0]
  );
}

function createThemeVariables(palette: ThemePalette): Record<string, string> {
  return {
    "--color-scheme": palette.system.colorScheme,
    "--bg": palette.surface.background,
    "--panel": palette.surface.panel,
    "--panel-strong": palette.surface.panelStrong,
    "--ink": palette.text.primary,
    "--text": palette.text.primary,
    "--muted": palette.text.muted,
    "--line": palette.border.normal,
    "--line-strong": palette.border.strong,
    "--accent": palette.action.accent,
    "--accent-weak": palette.action.accentWeak,
    "--accent-overlay": palette.action.accentOverlay,
    "--danger": palette.action.danger,
    "--button-hover": palette.action.buttonHover,
    "--button-active": palette.action.buttonActive,
    "--success": palette.action.success,
    "--success-weak": palette.action.successWeak,
    "--app-bar-bg": palette.surface.appBar,
    "--page-tabbar-bg": palette.surface.tabBar,
    "--statusbar-bg": palette.surface.statusBar,
    "--surface-bg": palette.surface.base,
    "--surface-raised-bg": palette.surface.raised,
    "--surface-inset-bg": palette.surface.inset,
    "--surface-input-panel-bg": palette.surface.inputPanel,
    "--surface-media-bg": palette.surface.media,
    "--surface-deep-bg": palette.surface.deep,
    "--splitter-hover-bg": palette.surface.splitterHover,
    "--tag-bg": palette.surface.tag,
    "--tag-hover-bg": palette.surface.tagHover,
    "--group-header-bg": palette.surface.groupHeader,
    "--selection-bg": palette.surface.selection,
    "--danger-bg": palette.surface.danger,
    "--border-dark": palette.border.dark,
    "--border-hover": palette.border.hover,
    "--disabled-ink": palette.text.disabled,
    "--disabled-strong-ink": palette.text.disabledStrong,
    "--active-ink": palette.text.active,
    "--selection-ink": palette.text.selection,
    "--group-header-ink": palette.text.groupHeader,
    "--success-ink": palette.text.success,
    "--success-soft-ink": palette.text.successSoft,
    "--success-feedback-ink": palette.text.success,
    "--warning": palette.action.warning,
    "--warning-ink": palette.text.warning,
    "--danger-ink": palette.text.danger,
    "--accent-ink": palette.text.accent,
    "--media-ink": palette.text.media,
    "--favorite": palette.action.favorite,
  };
}
