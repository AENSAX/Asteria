import { useEffect, useState } from "react";
import type {
  NetworkSettings,
  PageLayoutConfigRecord,
  PageLayoutSettings,
  StorageSettings,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";
import {
  loadInterfaceSettings,
  normalizeBrowserPageSize,
  saveInterfaceSettings,
} from "../utils/interfaceSettings";
import {
  languageOptions,
  loadLanguageSettings,
  listenLanguageSettingsChanged,
  saveLanguageSettings,
  useLanguage,
  type LanguageId,
  type LanguageSettings,
} from "../utils/language";
import {
  loadThemeSettings,
  saveThemeSettings,
  themeOptions,
  type ThemeId,
} from "../utils/themes";
import {
  createShortcutDefinitionFromKeyboardEvent,
  formatShortcutDefinition,
  loadShortcutSettings,
  resetShortcutSettings,
  saveShortcutSettings,
  setShortcutRecordingActive,
  shortcutActionConfigs,
  type ShortcutDefinition,
  type ShortcutAction,
  type ShortcutSettings,
} from "../utils/shortcuts";

type SettingsCategory =
  | "file"
  | "interface"
  | "appearance"
  | "network"
  | "shortcut";

type NetworkSettingsDraft = Omit<NetworkSettings, "proxyPort"> & {
  proxyPort: string;
};

type SettingsWindowState = {
  storage: {
    settings: StorageSettings | null;
    fileStoragePath: string;
    thumbnailStoragePath: string;
    convertImportedImagesToPng: boolean;
    savingStoragePath: boolean;
    savingThumbnailPath: boolean;
  };
  network: {
    settings: NetworkSettings;
    draft: NetworkSettingsDraft;
  };
  layout: {
    configs: PageLayoutConfigRecord[];
    settings: PageLayoutSettings;
    selectedConfigId: string | null;
    configName: string;
    loaded: boolean;
  };
  interface: {
    browserPageSize: string;
  };
  appearance: {
    themeId: ThemeId;
    languageId: LanguageId;
  };
  shortcuts: ShortcutSettings;
};

const defaultNetworkSettings: NetworkSettings = {
  proxyEnabled: false,
  proxyHost: "",
  proxyPort: 7890,
};

const defaultLayoutSettings: PageLayoutSettings = {
  defaultConfigId: null,
  newPageConfigId: null,
};

function createNetworkSettingsDraft(
  settings: NetworkSettings,
): NetworkSettingsDraft {
  return {
    proxyEnabled: settings.proxyEnabled,
    proxyHost: settings.proxyHost,
    proxyPort: String(settings.proxyPort),
  };
}
const navItemClass =
  "block h-7 w-full cursor-default border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px]";
const activeNavItemClass =
  "block h-7 w-full cursor-default border-0 border-b border-l-2 border-b-(--line) border-l-(--accent) bg-(--panel-strong) px-[7px] text-left text-[11px] font-semibold text-(--ink)";
const panelClass = "border border-(--line) bg-(--panel)";
const titleClass =
  "h-7 border-b border-(--line) bg-(--panel-strong) px-2 font-semibold leading-7";
const pathListClass = "grid gap-2 p-2";
const pathRowClass =
  "grid grid-cols-[104px_minmax(0,1fr)_32px_58px] items-center gap-1.5 [&>span]:text-[11px] [&>span]:text-(--text) [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>input::placeholder]:text-(--disabled-ink) [&>button]:h-6 [&>button]:min-w-0 [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong) [&>button]:text-[11px] [&>button:disabled]:text-(--disabled-ink)";
const checkRowClass =
  "grid min-h-6 grid-cols-[16px_minmax(0,1fr)_70px] items-center gap-1.5 text-[11px] [&>input]:m-0 [&>input]:h-3.5 [&>input]:w-3.5 [&>span]:text-(--text) [&>button]:h-6 [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong) [&>button]:text-[11px]";
const configTitleClass =
  "flex h-6 items-center justify-between border-b border-(--line) bg-(--panel-strong) px-2 text-[11px] font-semibold leading-6 text-(--text)";
const smallInputButtonClass =
  "[&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>input::placeholder]:text-(--disabled-ink) [&>button]:h-6 [&>button]:min-w-0 [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong) [&>button]:px-1.5 [&>button]:text-(--ink) [&>button:disabled]:text-(--disabled-ink)";
const compactSelectRowClass =
  "grid grid-cols-[104px_160px_58px_minmax(0,1fr)] items-center gap-1.5 [&>span]:text-[11px] [&>span]:text-(--text) [&>select]:h-6 [&>select]:min-w-0 [&>select]:border [&>select]:border-(--line-strong) [&>select]:bg-(--surface-inset-bg) [&>select]:px-1.5 [&>select]:text-(--ink) [&>button]:h-6 [&>button]:min-w-0 [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong) [&>button]:text-(--ink)";
const shortcutRowClass =
  "grid min-h-7 grid-cols-[130px_150px_minmax(0,1fr)] items-center gap-1.5 border-b border-(--line) px-2 py-[3px] text-(--ink)";
const shortcutControlsClass =
  "flex min-w-0 flex-wrap gap-1 [&_button]:h-[22px] [&_button]:cursor-default [&_button]:border [&_button]:border-(--line-strong) [&_button]:bg-(--surface-inset-bg) [&_button]:px-1.5 [&_button]:leading-5 [&_button]:text-(--ink) [&_button:disabled]:text-(--disabled-ink)";

export function SettingsWindow(): JSX.Element {
  const { t } = useLanguage();
  const [category, setCategory] = useState<SettingsCategory>("file");
  const [settingsState, setSettingsState] = useState<SettingsWindowState>(
    () => ({
      storage: {
        settings: null,
        fileStoragePath: "",
        thumbnailStoragePath: "",
        convertImportedImagesToPng: false,
        savingStoragePath: false,
        savingThumbnailPath: false,
      },
      network: {
        settings: defaultNetworkSettings,
        draft: createNetworkSettingsDraft(defaultNetworkSettings),
      },
      layout: {
        configs: [],
        settings: defaultLayoutSettings,
        selectedConfigId: null,
        configName: "",
        loaded: false,
      },
      interface: {
        browserPageSize: String(loadInterfaceSettings().browserPageSize),
      },
      appearance: {
        themeId: loadThemeSettings().themeId,
        languageId: loadLanguageSettings().languageId,
      },
      shortcuts: loadShortcutSettings(),
    }),
  );
  const [recordingShortcut, setRecordingShortcut] = useState<{
    action: ShortcutAction;
    index: number;
  } | null>(null);

  const {
    storage,
    network,
    layout,
    interface: interfaceSettings,
    appearance,
    shortcuts,
  } = settingsState;

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(
    () =>
      listenLanguageSettingsChanged((settings) => {
        setSettingsState((state) => ({
          ...state,
          appearance: { ...state.appearance, languageId: settings.languageId },
        }));
      }),
    [],
  );

  useEffect(() => {
    updateLayoutState({
      configName:
        layout.configs.find((config) => config.id === layout.selectedConfigId)
          ?.name ?? "",
    });
  }, [layout.configs, layout.selectedConfigId]);

  function updateSettingsState(
    updater: (currentState: SettingsWindowState) => SettingsWindowState,
  ): void {
    setSettingsState(updater);
  }

  function updateStorageState(
    patch:
      | Partial<SettingsWindowState["storage"]>
      | ((
          currentStorage: SettingsWindowState["storage"],
        ) => SettingsWindowState["storage"]),
  ): void {
    updateSettingsState((currentState) => ({
      ...currentState,
      storage:
        typeof patch === "function"
          ? patch(currentState.storage)
          : { ...currentState.storage, ...patch },
    }));
  }

  function updateNetworkState(
    patch:
      | Partial<SettingsWindowState["network"]>
      | ((
          currentNetwork: SettingsWindowState["network"],
        ) => SettingsWindowState["network"]),
  ): void {
    updateSettingsState((currentState) => ({
      ...currentState,
      network:
        typeof patch === "function"
          ? patch(currentState.network)
          : { ...currentState.network, ...patch },
    }));
  }

  function updateNetworkDraft(patch: Partial<NetworkSettingsDraft>): void {
    updateNetworkState((currentNetwork) => ({
      ...currentNetwork,
      draft: { ...currentNetwork.draft, ...patch },
    }));
  }

  function updateLayoutState(
    patch:
      | Partial<SettingsWindowState["layout"]>
      | ((
          currentLayout: SettingsWindowState["layout"],
        ) => SettingsWindowState["layout"]),
  ): void {
    updateSettingsState((currentState) => ({
      ...currentState,
      layout:
        typeof patch === "function"
          ? patch(currentState.layout)
          : { ...currentState.layout, ...patch },
    }));
  }

  function updateInterfaceState(
    patch: Partial<SettingsWindowState["interface"]>,
  ): void {
    updateSettingsState((currentState) => ({
      ...currentState,
      interface: { ...currentState.interface, ...patch },
    }));
  }

  function updateAppearanceState(
    patch: Partial<SettingsWindowState["appearance"]>,
  ): void {
    updateSettingsState((currentState) => ({
      ...currentState,
      appearance: { ...currentState.appearance, ...patch },
    }));
  }

  function updateShortcutsState(
    updater:
      | ShortcutSettings
      | ((currentSettings: ShortcutSettings) => ShortcutSettings),
  ): void {
    updateSettingsState((currentState) => ({
      ...currentState,
      shortcuts:
        typeof updater === "function"
          ? updater(currentState.shortcuts)
          : updater,
    }));
  }

  useEffect(() => {
    if (!recordingShortcut) {
      setShortcutRecordingActive(false);
      return undefined;
    }

    setShortcutRecordingActive(true);
    const currentRecordingShortcut = recordingShortcut;

    function handleKeyDown(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();

      const definition = createShortcutDefinitionFromKeyboardEvent(
        currentRecordingShortcut.action,
        event,
      );

      if (!definition) {
        return;
      }

      updateShortcutsState((currentSettings) =>
        updateShortcutDefinition(
          currentSettings,
          currentRecordingShortcut.action,
          currentRecordingShortcut.index,
          definition,
        ),
      );
      setRecordingShortcut(null);
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      setShortcutRecordingActive(false);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [recordingShortcut]);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const [
      nextSettings,
      nextNetworkSettings,
      nextLayoutSettings,
      nextLayoutConfigs,
    ] = await Promise.all([
      window.asteria.getStorageSettings(),
      window.asteria.getNetworkSettings(),
      window.asteria.getPageLayoutSettings(),
      window.asteria.listPageLayoutConfigs(),
    ]);
    updateStorageState({
      settings: nextSettings,
      fileStoragePath: nextSettings.fileStoragePath,
      thumbnailStoragePath: nextSettings.thumbnailStoragePath,
      convertImportedImagesToPng: nextSettings.convertImportedImagesToPng,
    });
    applyNetworkSettings(nextNetworkSettings);
    updateLayoutState((currentLayout) => ({
      ...currentLayout,
      settings: nextLayoutSettings,
      configs: nextLayoutConfigs,
      selectedConfigId:
        currentLayout.selectedConfigId ?? nextLayoutConfigs[0]?.id ?? null,
      loaded: true,
    }));
    updateInterfaceState({
      browserPageSize: String(loadInterfaceSettings().browserPageSize),
    });
    updateAppearanceState({ themeId: loadThemeSettings().themeId });
    updateShortcutsState(loadShortcutSettings());
  }

  async function browseStoragePath(): Promise<void> {
    const selectedPath = await window.asteria?.selectStorageDirectory();

    if (selectedPath) {
      updateStorageState({ fileStoragePath: selectedPath });
    }
  }

  async function browseThumbnailPath(): Promise<void> {
    const selectedPath = await window.asteria?.selectStorageDirectory();

    if (selectedPath) {
      updateStorageState({ thumbnailStoragePath: selectedPath });
    }
  }

  async function saveStoragePath(): Promise<void> {
    if (!window.asteria || !storage.fileStoragePath.trim()) {
      return;
    }

    updateStorageState({ savingStoragePath: true });

    try {
      const nextSettings = await window.asteria.updateFileStoragePath(
        storage.fileStoragePath,
      );
      updateStorageState({
        settings: nextSettings,
        fileStoragePath: nextSettings.fileStoragePath,
      });
    } finally {
      updateStorageState({ savingStoragePath: false });
    }
  }

  async function saveThumbnailPath(): Promise<void> {
    if (!window.asteria || !storage.thumbnailStoragePath.trim()) {
      return;
    }

    updateStorageState({ savingThumbnailPath: true });

    try {
      const nextSettings = await window.asteria.updateThumbnailStoragePath(
        storage.thumbnailStoragePath,
      );
      updateStorageState({
        settings: nextSettings,
        thumbnailStoragePath: nextSettings.thumbnailStoragePath,
      });
    } finally {
      updateStorageState({ savingThumbnailPath: false });
    }
  }

  async function saveConvertImportedImagesToPng(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateConvertImportedImagesToPng(
      storage.convertImportedImagesToPng,
    );
    updateStorageState({
      settings: nextSettings,
      convertImportedImagesToPng: nextSettings.convertImportedImagesToPng,
    });
  }

  async function createLayoutConfig(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const configs = await window.asteria.createPageLayoutConfig();
    updateLayoutState({
      configs,
      selectedConfigId: configs[0]?.id ?? null,
      loaded: true,
    });
  }

  async function renameSelectedLayoutConfig(): Promise<void> {
    if (
      !window.asteria ||
      !layout.selectedConfigId ||
      !layout.configName.trim()
    ) {
      return;
    }

    const configs = await window.asteria.renamePageLayoutConfig(
      layout.selectedConfigId,
      layout.configName,
    );
    updateLayoutState({
      configs,
      selectedConfigId:
        configs.find((config) => config.name === layout.configName.trim())
          ?.id ??
        configs[0]?.id ??
        null,
      loaded: true,
    });
  }

  async function deleteSelectedLayoutConfig(): Promise<void> {
    if (!window.asteria || !layout.selectedConfigId) {
      return;
    }

    const configs = await window.asteria.deletePageLayoutConfig(
      layout.selectedConfigId,
    );
    updateLayoutState({
      configs,
      selectedConfigId: configs[0]?.id ?? null,
      settings: await window.asteria.getPageLayoutSettings(),
      loaded: true,
    });
  }

  async function openSelectedLayoutConfig(): Promise<void> {
    if (!window.asteria || !layout.selectedConfigId) {
      return;
    }

    await window.asteria.openPageLayoutConfig(layout.selectedConfigId);
  }

  async function updateLayoutSetting(
    kind: "default" | "newPage",
    enabled: boolean,
    id: string,
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings =
      kind === "default"
        ? await window.asteria.setDefaultPageLayoutConfig(enabled ? id : null)
        : await window.asteria.setNewPageLayoutConfig(enabled ? id : null);
    updateLayoutState({
      settings: nextSettings,
      configs: await window.asteria.listPageLayoutConfigs(),
    });
  }

  function saveShortcuts(): void {
    saveShortcutSettings(shortcuts);
    setRecordingShortcut(null);
  }

  function resetShortcuts(): void {
    updateShortcutsState(resetShortcutSettings());
    setRecordingShortcut(null);
  }

  function saveBrowserPageSize(): void {
    const settings = saveInterfaceSettings({
      browserPageSize: normalizeBrowserPageSize(
        interfaceSettings.browserPageSize,
      ),
    });

    updateInterfaceState({ browserPageSize: String(settings.browserPageSize) });
  }

  function saveTheme(): void {
    updateAppearanceState({
      themeId: saveThemeSettings({ themeId: appearance.themeId }).themeId,
    });
  }

  function saveLanguage(): void {
    updateAppearanceState({
      languageId: saveLanguageSettings({
        languageId: settingsState.appearance.languageId,
      }).languageId,
    });
  }

  async function saveNetworkSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateNetworkSettings({
      proxyEnabled: network.draft.proxyEnabled,
      proxyHost: network.draft.proxyHost,
      proxyPort: Number(network.draft.proxyPort),
    });
    applyNetworkSettings(nextSettings);
  }

  function applyNetworkSettings(nextSettings: NetworkSettings): void {
    updateNetworkState({
      settings: nextSettings,
      draft: createNetworkSettingsDraft(nextSettings),
    });
  }

  function removeShortcut(action: ShortcutAction, index: number): void {
    updateShortcutsState((currentSettings) => ({
      ...currentSettings,
      [action]: (currentSettings[action] ?? []).filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    }));
  }

  const filePathChanged = storage.settings
    ? storage.settings.fileStoragePath !== storage.fileStoragePath
    : false;
  const thumbnailPathChanged = storage.settings
    ? storage.settings.thumbnailStoragePath !== storage.thumbnailStoragePath
    : false;
  const convertImportedImagesChanged = storage.settings
    ? storage.settings.convertImportedImagesToPng !==
      storage.convertImportedImagesToPng
    : false;
  const languageChanged =
    loadLanguageSettings().languageId !== settingsState.appearance.languageId;
  const networkChanged =
    network.settings.proxyEnabled !== network.draft.proxyEnabled ||
    network.settings.proxyHost !== network.draft.proxyHost ||
    String(network.settings.proxyPort) !== network.draft.proxyPort;
  const selectedLayoutConfig =
    layout.configs.find((config) => config.id === layout.selectedConfigId) ??
    null;
  const layoutMessage = layout.loaded
    ? t("settings.interface.layoutConfigCount", {
        count: layout.configs.length,
      })
    : t("settings.interface.layoutConfigNotLoaded");

  return (
    <ResizableColumns
      className="relative grid h-full min-h-0 min-w-0 grid-cols-[148px_minmax(0,1fr)] border border-(--line) bg-(--panel)"
      defaultLeftWidth={148}
      minLeftWidth={110}
      minRightWidth={360}
      storageKey="asteria:settings-sidebar-width"
      left={
        <aside className="min-h-0 min-w-0 border-r border-(--line) bg-(--surface-bg)">
          <button
            className={category === "file" ? activeNavItemClass : navItemClass}
            type="button"
            onClick={() => setCategory("file")}
          >
            {t("settings.category.file")}
          </button>
          <button
            className={
              category === "interface" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("interface")}
          >
            {t("settings.category.interface")}
          </button>
          <button
            className={
              category === "appearance" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("appearance")}
          >
            {t("settings.category.appearance")}
          </button>
          <button
            className={
              category === "network" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("network")}
          >
            {t("settings.category.network")}
          </button>
          <button
            className={
              category === "shortcut" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("shortcut")}
          >
            {t("settings.category.shortcut")}
          </button>
        </aside>
      }
      right={
        <main className="min-h-0 min-w-0 bg-(--bg) p-2">
          {category === "file" ? (
            <section className={panelClass}>
              <div className={pathListClass}>
                <label className={pathRowClass}>
                  <span>{t("settings.file.fileStoragePath")}</span>
                  <input
                    aria-label={t("settings.file.fileStoragePath")}
                    placeholder={t("settings.file.fileStoragePlaceholder")}
                    value={storage.fileStoragePath}
                    onChange={(event) =>
                      updateStorageState({
                        fileStoragePath: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void browseStoragePath()}
                  >
                    ...
                  </button>
                  <ActionFeedbackButton
                    disabled={!filePathChanged || storage.savingStoragePath}
                    label={t("common.save")}
                    onAction={saveStoragePath}
                  />
                </label>
                <label className={pathRowClass}>
                  <span>{t("settings.file.thumbnailStoragePath")}</span>
                  <input
                    aria-label={t("settings.file.thumbnailStoragePath")}
                    placeholder={t("settings.file.thumbnailStoragePlaceholder")}
                    value={storage.thumbnailStoragePath}
                    onChange={(event) =>
                      updateStorageState({
                        thumbnailStoragePath: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void browseThumbnailPath()}
                  >
                    ...
                  </button>
                  <ActionFeedbackButton
                    disabled={
                      !thumbnailPathChanged || storage.savingThumbnailPath
                    }
                    label={t("common.save")}
                    onAction={saveThumbnailPath}
                  />
                </label>
                <label className={checkRowClass}>
                  <input
                    checked={storage.convertImportedImagesToPng}
                    type="checkbox"
                    onChange={(event) =>
                      updateStorageState({
                        convertImportedImagesToPng: event.target.checked,
                      })
                    }
                  />
                  <span>{t("settings.file.convertImportedImagesToPng")}</span>
                  <ActionFeedbackButton
                    disabled={!convertImportedImagesChanged}
                    feedbackKind="apply"
                    label={t("common.apply")}
                    onAction={saveConvertImportedImagesToPng}
                  />
                </label>
              </div>
            </section>
          ) : category === "interface" ? (
            <div>
              <section
                className={`${panelClass} grid min-h-0 grid-rows-[28px_auto_24px_minmax(0,1fr)]`}
              >
                <header className={titleClass}>
                  {t("settings.category.interface")}
                </header>
                <div className="grid gap-1.5 border-b border-(--line) bg-(--surface-bg) p-2">
                  <div className={configTitleClass}>
                    {t("settings.interface.browser")}
                  </div>
                  <label
                    className={`grid grid-cols-[104px_120px_58px_minmax(0,1fr)] items-center gap-1.5 [&>span]:text-[11px] [&>span]:text-(--text) ${smallInputButtonClass}`}
                  >
                    <span>{t("settings.interface.browserPageSize")}</span>
                    <input
                      aria-label={t("settings.interface.browserPageSize")}
                      min={20}
                      placeholder={t(
                        "settings.interface.browserPageSizePlaceholder",
                      )}
                      type="number"
                      value={interfaceSettings.browserPageSize}
                      onChange={(event) =>
                        updateInterfaceState({
                          browserPageSize: event.target.value,
                        })
                      }
                    />
                    <ActionFeedbackButton
                      label={t("common.save")}
                      onAction={saveBrowserPageSize}
                    />
                  </label>
                </div>
                <div className={configTitleClass}>
                  <span>{t("settings.interface.pageLayout")}</span>
                  <span className="text-[11px] font-normal text-(--muted)">
                    {layoutMessage}
                  </span>
                </div>
                <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)]">
                  <div className="flex min-h-0 flex-col border-r border-(--line) bg-(--surface-bg)">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {layout.configs.length > 0 ? (
                        layout.configs.map((config) => (
                          <div
                            className={`grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)] border-0 border-b border-l-[3px] border-b-(--line) p-0 text-[11px] text-(--ink) ${config.id === layout.selectedConfigId ? "border-l-(--accent) bg-(--surface-raised-bg)" : "border-l-transparent bg-transparent"}`}
                            key={config.id}
                          >
                            <button
                              className="min-w-0 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent px-1.5 text-left text-(--ink)"
                              title={config.path}
                              type="button"
                              onClick={() =>
                                updateLayoutState({
                                  selectedConfigId: config.id,
                                })
                              }
                            >
                              <span className="block overflow-hidden text-ellipsis whitespace-nowrap leading-[26px]">
                                {config.name}
                              </span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="px-2 py-1.5 text-(--muted)">
                          {t("common.noConfig")}
                        </div>
                      )}
                    </div>
                    <div
                      className={`border-t border-(--line) p-2 ${smallInputButtonClass}`}
                    >
                      <button
                        type="button"
                        onClick={() => void createLayoutConfig()}
                      >
                        {t("settings.interface.newConfig")}
                      </button>
                    </div>
                  </div>

                  <div className="grid min-w-0 content-start gap-1.5 p-2">
                    <div
                      className={`grid grid-cols-[minmax(0,1fr)_72px] gap-1.5 ${smallInputButtonClass}`}
                    >
                      <input
                        aria-label={t("settings.interface.configName")}
                        placeholder={t(
                          "settings.interface.configNamePlaceholder",
                        )}
                        value={layout.configName}
                        onChange={(event) =>
                          updateLayoutState({
                            configName: event.target.value,
                          })
                        }
                        onFocus={() =>
                          updateLayoutState({
                            configName: selectedLayoutConfig?.name ?? "",
                          })
                        }
                      />
                      <button
                        disabled={!selectedLayoutConfig}
                        type="button"
                        onClick={() => void renameSelectedLayoutConfig()}
                      >
                        {t("common.rename")}
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex min-w-0 cursor-pointer items-center justify-start gap-1 border-0 bg-transparent p-0 text-[11px] text-(--ink)">
                        <input
                          checked={
                            selectedLayoutConfig
                              ? selectedLayoutConfig.id ===
                                layout.settings.defaultConfigId
                              : false
                          }
                          disabled={!selectedLayoutConfig}
                          type="checkbox"
                          onChange={(event) =>
                            selectedLayoutConfig
                              ? void updateLayoutSetting(
                                  "default",
                                  event.target.checked,
                                  selectedLayoutConfig.id,
                                )
                              : undefined
                          }
                        />
                        <span>{t("settings.interface.defaultImportPage")}</span>
                      </label>
                      <label className="flex min-w-0 cursor-pointer items-center justify-start gap-1 border-0 bg-transparent p-0 text-[11px] text-(--ink)">
                        <input
                          checked={
                            selectedLayoutConfig
                              ? selectedLayoutConfig.id ===
                                layout.settings.newPageConfigId
                              : false
                          }
                          disabled={!selectedLayoutConfig}
                          type="checkbox"
                          onChange={(event) =>
                            selectedLayoutConfig
                              ? void updateLayoutSetting(
                                  "newPage",
                                  event.target.checked,
                                  selectedLayoutConfig.id,
                                )
                              : undefined
                          }
                        />
                        <span>{t("settings.interface.defaultNewPage")}</span>
                      </label>
                    </div>

                    <div
                      className={`grid grid-cols-[repeat(3,minmax(82px,1fr))] gap-1.5 ${smallInputButtonClass}`}
                    >
                      <button
                        disabled={!selectedLayoutConfig}
                        type="button"
                        onClick={() => void openSelectedLayoutConfig()}
                      >
                        {t("common.openConfigFile")}
                      </button>
                      <button
                        disabled={!selectedLayoutConfig}
                        type="button"
                        onClick={() => void deleteSelectedLayoutConfig()}
                      >
                        {t("settings.interface.deleteConfig")}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className={panelClass}>
                <header className={titleClass}>
                  {t("settings.language.languageSettings")}
                </header>
                <div className="grid gap-1.5 bg-(--surface-bg) p-2">
                  <label className={compactSelectRowClass}>
                    <span>{t("settings.language.interfaceLanguage")}</span>
                    <select
                      aria-label={t("settings.language.interfaceLanguage")}
                      value={settingsState.appearance.languageId}
                      onChange={(event) =>
                        updateAppearanceState({
                          languageId: event.target.value as LanguageId,
                        })
                      }
                    >
                      {languageOptions.map((language) => (
                        <option key={language.id} value={language.id}>
                          {language.name}
                        </option>
                      ))}
                    </select>
                    <ActionFeedbackButton
                      feedbackKind="apply"
                      disabled={!languageChanged}
                      label={t("common.apply")}
                      onAction={saveLanguage}
                    />
                  </label>
                </div>
              </section>
            </div>
          ) : category === "appearance" ? (
            <section className={panelClass}>
              <header className={titleClass}>
                {t("settings.theme.themeSettings")}
              </header>
              <div className="grid gap-1.5 bg-(--surface-bg) p-2">
                <label className={compactSelectRowClass}>
                  <span>{t("settings.theme.theme")}</span>
                  <select
                    aria-label={t("settings.theme.theme")}
                    value={appearance.themeId}
                    onChange={(event) =>
                      updateAppearanceState({
                        themeId: event.target.value as ThemeId,
                      })
                    }
                  >
                    {themeOptions.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {t(theme.nameKey)}
                      </option>
                    ))}
                  </select>
                  <ActionFeedbackButton
                    feedbackKind="apply"
                    label={t("common.apply")}
                    onAction={saveTheme}
                  />
                </label>
              </div>
            </section>
          ) : category === "network" ? (
            <section className={panelClass}>
              <label className="grid min-h-7 grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 border-b border-(--line) bg-(--surface-bg) px-2 text-[11px]">
                <input
                  checked={network.draft.proxyEnabled}
                  type="checkbox"
                  onChange={(event) =>
                    updateNetworkDraft({
                      proxyEnabled: event.target.checked,
                    })
                  }
                />
                <span>{t("settings.network.enableProxy")}</span>
              </label>
              <div className={pathListClass}>
                <label className={pathRowClass}>
                  <span>{t("settings.network.proxyAddress")}</span>
                  <input
                    aria-label={t("settings.network.proxyAddress")}
                    placeholder={t("settings.network.proxyAddressPlaceholder")}
                    value={network.draft.proxyHost}
                    onChange={(event) =>
                      updateNetworkDraft({ proxyHost: event.target.value })
                    }
                  />
                </label>
                <label
                  className={`${pathRowClass} grid-cols-[104px_minmax(0,1fr)_70px]`}
                >
                  <span>{t("settings.network.proxyPort")}</span>
                  <input
                    aria-label={t("settings.network.proxyPort")}
                    max={65535}
                    min={1}
                    placeholder={t("settings.network.proxyPortPlaceholder")}
                    type="number"
                    value={network.draft.proxyPort}
                    onChange={(event) =>
                      updateNetworkDraft({ proxyPort: event.target.value })
                    }
                  />
                  <ActionFeedbackButton
                    className="min-w-[70px]"
                    disabled={!networkChanged}
                    label={t("common.save")}
                    onAction={saveNetworkSettings}
                  />
                </label>
              </div>
            </section>
          ) : (
            <section
              className={`${panelClass} grid min-h-0 grid-rows-[minmax(0,1fr)_32px]`}
            >
              <div className="min-h-0 overflow-auto bg-(--surface-bg)">
                {shortcutActionConfigs.map((config) => {
                  const definitions = shortcuts[config.action] ?? [];

                  return (
                    <div className={shortcutRowClass} key={config.action}>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {t(config.labelKey)}
                      </span>
                      <small className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
                        {t(config.descriptionKey)}
                      </small>
                      <div className={shortcutControlsClass}>
                        {definitions.map((definition, index) => (
                          <span
                            className="inline-grid h-[22px] min-w-0 grid-cols-[minmax(42px,auto)_20px]"
                            key={`${config.action}-${index}`}
                          >
                            <button
                              className={
                                recordingShortcut?.action === config.action &&
                                recordingShortcut.index === index
                                  ? "border-(--accent) text-(--active-ink)"
                                  : ""
                              }
                              type="button"
                              onClick={() =>
                                setRecordingShortcut({
                                  action: config.action,
                                  index,
                                })
                              }
                            >
                              {recordingShortcut?.action === config.action &&
                              recordingShortcut.index === index
                                ? t("settings.shortcut.recording")
                                : formatShortcutDefinition(definition)}
                            </button>
                            <button
                              aria-label={t("settings.shortcut.deleteShortcut")}
                              disabled={definitions.length <= 1}
                              type="button"
                              onClick={() =>
                                removeShortcut(config.action, index)
                              }
                            >
                              x
                            </button>
                          </span>
                        ))}
                        <button
                          className={
                            recordingShortcut?.action === config.action &&
                            recordingShortcut.index === definitions.length
                              ? "border-(--accent) text-(--active-ink)"
                              : ""
                          }
                          type="button"
                          onClick={() =>
                            setRecordingShortcut({
                              action: config.action,
                              index: definitions.length,
                            })
                          }
                        >
                          {recordingShortcut?.action === config.action &&
                          recordingShortcut.index === definitions.length
                            ? t("settings.shortcut.recording")
                            : t("common.add")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[72px_72px_minmax(0,1fr)] items-center gap-1.5 border-t border-(--line) bg-(--panel) px-2 py-1 [&>button]:h-[22px] [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong) [&>button]:text-(--ink)">
                <ActionFeedbackButton
                  label={t("common.save")}
                  onAction={saveShortcuts}
                />
                <button type="button" onClick={resetShortcuts}>
                  {t("settings.shortcut.resetDefaults")}
                </button>
              </div>
            </section>
          )}
        </main>
      }
    />
  );
}

function updateShortcutDefinition(
  settings: ShortcutSettings,
  action: ShortcutAction,
  index: number,
  definition: ShortcutDefinition,
): ShortcutSettings {
  const definitions = [...(settings[action] ?? [])];
  definitions[index] = definition;

  return {
    ...settings,
    [action]: dedupeShortcutDefinitions(definitions),
  };
}

function dedupeShortcutDefinitions(
  definitions: ShortcutDefinition[],
): ShortcutDefinition[] {
  const seen = new Set<string>();
  const result: ShortcutDefinition[] = [];

  for (const definition of definitions) {
    const key = formatShortcutDefinition(definition);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(definition);
  }

  return result;
}
