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

const navItemClass =
  "block h-7 w-full cursor-default border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px]";
const activeNavItemClass = `${navItemClass} bg-(--panel-strong)`;
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

export function SettingsWindow(): JSX.Element {
  const [category, setCategory] = useState<SettingsCategory>("file");
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [fileStoragePath, setFileStoragePath] = useState("");
  const [thumbnailStoragePath, setThumbnailStoragePath] = useState("");
  const [convertImportedImagesToPng, setConvertImportedImagesToPng] =
    useState(false);
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>({
    proxyEnabled: false,
    proxyHost: "",
    proxyPort: 7890,
  });
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("7890");
  const [layoutConfigs, setLayoutConfigs] = useState<PageLayoutConfigRecord[]>(
    [],
  );
  const [layoutSettings, setLayoutSettings] = useState<PageLayoutSettings>({
    defaultConfigId: null,
    newPageConfigId: null,
  });
  const [selectedLayoutConfigId, setSelectedLayoutConfigId] = useState<
    string | null
  >(null);
  const [layoutConfigName, setLayoutConfigName] = useState("");
  const [layoutMessage, setLayoutMessage] = useState("未加载");
  const [savingStoragePath, setSavingStoragePath] = useState(false);
  const [savingThumbnailPath, setSavingThumbnailPath] = useState(false);
  const [browserPageSize, setBrowserPageSize] = useState(() =>
    String(loadInterfaceSettings().browserPageSize),
  );
  const [themeId, setThemeId] = useState<ThemeId>(
    () => loadThemeSettings().themeId,
  );
  const [shortcutSettings, setShortcutSettings] = useState<ShortcutSettings>(
    () => loadShortcutSettings(),
  );
  const [recordingShortcut, setRecordingShortcut] = useState<{
    action: ShortcutAction;
    index: number;
  } | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    setLayoutConfigName(
      layoutConfigs.find((config) => config.id === selectedLayoutConfigId)
        ?.name ?? "",
    );
  }, [layoutConfigs, selectedLayoutConfigId]);

  useEffect(() => {
    if (!recordingShortcut) {
      setShortcutRecordingActive(false);
      return undefined;
    }

    setShortcutRecordingActive(true);

    function handleKeyDown(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();

      const definition = createShortcutDefinitionFromKeyboardEvent(
        recordingShortcut.action,
        event,
      );

      if (!definition) {
        return;
      }

      setShortcutSettings((currentSettings) =>
        updateShortcutDefinition(
          currentSettings,
          recordingShortcut.action,
          recordingShortcut.index,
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
    setSettings(nextSettings);
    setFileStoragePath(nextSettings.fileStoragePath);
    setThumbnailStoragePath(nextSettings.thumbnailStoragePath);
    setConvertImportedImagesToPng(nextSettings.convertImportedImagesToPng);
    applyNetworkSettings(nextNetworkSettings);
    setLayoutSettings(nextLayoutSettings);
    setLayoutConfigs(nextLayoutConfigs);
    setSelectedLayoutConfigId(
      (currentId) => currentId ?? nextLayoutConfigs[0]?.id ?? null,
    );
    setLayoutMessage(`${nextLayoutConfigs.length} 个配置`);
    setBrowserPageSize(String(loadInterfaceSettings().browserPageSize));
    setThemeId(loadThemeSettings().themeId);
    setShortcutSettings(loadShortcutSettings());
  }

  async function browseStoragePath(): Promise<void> {
    const selectedPath = await window.asteria?.selectStorageDirectory();

    if (selectedPath) {
      setFileStoragePath(selectedPath);
    }
  }

  async function browseThumbnailPath(): Promise<void> {
    const selectedPath = await window.asteria?.selectStorageDirectory();

    if (selectedPath) {
      setThumbnailStoragePath(selectedPath);
    }
  }

  async function saveStoragePath(): Promise<void> {
    if (!window.asteria || !fileStoragePath.trim()) {
      return;
    }

    setSavingStoragePath(true);

    try {
      const nextSettings =
        await window.asteria.updateFileStoragePath(fileStoragePath);
      setSettings(nextSettings);
      setFileStoragePath(nextSettings.fileStoragePath);
    } finally {
      setSavingStoragePath(false);
    }
  }

  async function saveThumbnailPath(): Promise<void> {
    if (!window.asteria || !thumbnailStoragePath.trim()) {
      return;
    }

    setSavingThumbnailPath(true);

    try {
      const nextSettings =
        await window.asteria.updateThumbnailStoragePath(thumbnailStoragePath);
      setSettings(nextSettings);
      setThumbnailStoragePath(nextSettings.thumbnailStoragePath);
    } finally {
      setSavingThumbnailPath(false);
    }
  }

  async function saveConvertImportedImagesToPng(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateConvertImportedImagesToPng(
      convertImportedImagesToPng,
    );
    setSettings(nextSettings);
    setConvertImportedImagesToPng(nextSettings.convertImportedImagesToPng);
  }

  async function createLayoutConfig(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const configs = await window.asteria.createPageLayoutConfig();
    setLayoutConfigs(configs);
    setSelectedLayoutConfigId(configs[0]?.id ?? null);
    setLayoutMessage(`${configs.length} 个配置`);
  }

  async function renameSelectedLayoutConfig(): Promise<void> {
    if (
      !window.asteria ||
      !selectedLayoutConfigId ||
      !layoutConfigName.trim()
    ) {
      return;
    }

    const configs = await window.asteria.renamePageLayoutConfig(
      selectedLayoutConfigId,
      layoutConfigName,
    );
    setLayoutConfigs(configs);
    setSelectedLayoutConfigId(
      configs.find((config) => config.name === layoutConfigName.trim())?.id ??
        configs[0]?.id ??
        null,
    );
    setLayoutMessage(`${configs.length} 个配置`);
  }

  async function deleteSelectedLayoutConfig(): Promise<void> {
    if (!window.asteria || !selectedLayoutConfigId) {
      return;
    }

    const configs = await window.asteria.deletePageLayoutConfig(
      selectedLayoutConfigId,
    );
    setLayoutConfigs(configs);
    setSelectedLayoutConfigId(configs[0]?.id ?? null);
    setLayoutSettings(await window.asteria.getPageLayoutSettings());
    setLayoutMessage(`${configs.length} 个配置`);
  }

  async function openSelectedLayoutConfig(): Promise<void> {
    if (!window.asteria || !selectedLayoutConfigId) {
      return;
    }

    await window.asteria.openPageLayoutConfig(selectedLayoutConfigId);
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
    setLayoutSettings(nextSettings);
    setLayoutConfigs(await window.asteria.listPageLayoutConfigs());
  }

  function saveShortcuts(): void {
    saveShortcutSettings(shortcutSettings);
    setRecordingShortcut(null);
  }

  function resetShortcuts(): void {
    setShortcutSettings(resetShortcutSettings());
    setRecordingShortcut(null);
  }

  function saveBrowserPageSize(): void {
    const settings = saveInterfaceSettings({
      browserPageSize: normalizeBrowserPageSize(browserPageSize),
    });

    setBrowserPageSize(String(settings.browserPageSize));
  }

  function saveTheme(): void {
    setThemeId(saveThemeSettings({ themeId }).themeId);
  }

  async function saveNetworkSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateNetworkSettings({
      proxyEnabled,
      proxyHost,
      proxyPort: Number(proxyPort),
    });
    applyNetworkSettings(nextSettings);
  }

  function applyNetworkSettings(nextSettings: NetworkSettings): void {
    setNetworkSettings(nextSettings);
    setProxyEnabled(nextSettings.proxyEnabled);
    setProxyHost(nextSettings.proxyHost);
    setProxyPort(String(nextSettings.proxyPort));
  }

  function removeShortcut(action: ShortcutAction, index: number): void {
    setShortcutSettings((currentSettings) => ({
      ...currentSettings,
      [action]: (currentSettings[action] ?? []).filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    }));
  }

  const filePathChanged = settings
    ? settings.fileStoragePath !== fileStoragePath
    : false;
  const thumbnailPathChanged = settings
    ? settings.thumbnailStoragePath !== thumbnailStoragePath
    : false;
  const convertImportedImagesChanged = settings
    ? settings.convertImportedImagesToPng !== convertImportedImagesToPng
    : false;
  const networkChanged =
    networkSettings.proxyEnabled !== proxyEnabled ||
    networkSettings.proxyHost !== proxyHost ||
    String(networkSettings.proxyPort) !== proxyPort;
  const selectedLayoutConfig =
    layoutConfigs.find((config) => config.id === selectedLayoutConfigId) ??
    null;

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
            文件
          </button>
          <button
            className={
              category === "interface" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("interface")}
          >
            界面
          </button>
          <button
            className={
              category === "appearance" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("appearance")}
          >
            外观
          </button>
          <button
            className={
              category === "network" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("network")}
          >
            网络
          </button>
          <button
            className={
              category === "shortcut" ? activeNavItemClass : navItemClass
            }
            type="button"
            onClick={() => setCategory("shortcut")}
          >
            快捷键
          </button>
        </aside>
      }
      right={
        <main className="min-h-0 min-w-0 bg-(--bg) p-2">
          {category === "file" ? (
            <section className={panelClass}>
              <header className={titleClass}>文件</header>
              <div className={pathListClass}>
                <label className={pathRowClass}>
                  <span>文件存储位置</span>
                  <input
                    aria-label="文件存储位置"
                    placeholder="输入文件存储位置"
                    value={fileStoragePath}
                    onChange={(event) => setFileStoragePath(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void browseStoragePath()}
                  >
                    ...
                  </button>
                  <ActionFeedbackButton
                    disabled={!filePathChanged || savingStoragePath}
                    label="保存"
                    onAction={saveStoragePath}
                  />
                </label>
                <label className={pathRowClass}>
                  <span>缩略图缓存位置</span>
                  <input
                    aria-label="缩略图缓存位置"
                    placeholder="输入缩略图缓存位置"
                    value={thumbnailStoragePath}
                    onChange={(event) =>
                      setThumbnailStoragePath(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void browseThumbnailPath()}
                  >
                    ...
                  </button>
                  <ActionFeedbackButton
                    disabled={!thumbnailPathChanged || savingThumbnailPath}
                    label="保存"
                    onAction={saveThumbnailPath}
                  />
                </label>
                <label className={checkRowClass}>
                  <input
                    checked={convertImportedImagesToPng}
                    type="checkbox"
                    onChange={(event) =>
                      setConvertImportedImagesToPng(event.target.checked)
                    }
                  />
                  <span>导入图片转为 PNG</span>
                  <ActionFeedbackButton
                    disabled={!convertImportedImagesChanged}
                    feedbackKind="apply"
                    label="应用"
                    onAction={saveConvertImportedImagesToPng}
                  />
                </label>
              </div>
            </section>
          ) : category === "interface" ? (
            <section
              className={`${panelClass} grid min-h-0 grid-rows-[28px_auto_24px_minmax(0,1fr)]`}
            >
              <header className={titleClass}>界面</header>
              <div className="grid gap-1.5 border-b border-(--line) bg-(--surface-bg) p-2">
                <div className={configTitleClass}>浏览</div>
                <label
                  className={`grid grid-cols-[104px_120px_58px_minmax(0,1fr)] items-center gap-1.5 [&>span]:text-[11px] [&>span]:text-(--text) ${smallInputButtonClass}`}
                >
                  <span>单页文件数</span>
                  <input
                    aria-label="文件浏览器单页文件数"
                    min={20}
                    placeholder="输入单页文件数"
                    type="number"
                    value={browserPageSize}
                    onChange={(event) => setBrowserPageSize(event.target.value)}
                  />
                  <ActionFeedbackButton
                    label="保存"
                    onAction={saveBrowserPageSize}
                  />
                </label>
              </div>
              <div className={configTitleClass}>
                <span>页面配置</span>
                <span className="text-[11px] font-normal text-(--muted)">
                  {layoutMessage}
                </span>
              </div>
              <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)]">
                <div className="flex min-h-0 flex-col border-r border-(--line) bg-(--surface-bg)">
                  <div className="min-h-0 flex-1 overflow-auto">
                    {layoutConfigs.length > 0 ? (
                      layoutConfigs.map((config) => (
                        <div
                          className={`grid min-h-[26px] w-full grid-cols-[minmax(0,1fr)] border-0 border-b border-l-[3px] border-b-(--line) p-0 text-[11px] text-(--ink) ${config.id === selectedLayoutConfigId ? "border-l-(--accent) bg-(--surface-raised-bg)" : "border-l-transparent bg-transparent"}`}
                          key={config.id}
                        >
                          <button
                            className="min-w-0 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent px-1.5 text-left text-(--ink)"
                            title={config.path}
                            type="button"
                            onClick={() => setSelectedLayoutConfigId(config.id)}
                          >
                            <span className="block overflow-hidden text-ellipsis whitespace-nowrap leading-[26px]">
                              {config.name}
                            </span>
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-(--muted)">没有配置</div>
                    )}
                  </div>
                  <div
                    className={`border-t border-(--line) p-2 ${smallInputButtonClass}`}
                  >
                    <button
                      type="button"
                      onClick={() => void createLayoutConfig()}
                    >
                      新建配置
                    </button>
                  </div>
                </div>

                <div className="grid min-w-0 content-start gap-1.5 p-2">
                  <div
                    className={`grid grid-cols-[minmax(0,1fr)_72px] gap-1.5 ${smallInputButtonClass}`}
                  >
                    <input
                      aria-label="配置名称"
                      placeholder="输入配置名称"
                      value={layoutConfigName}
                      onChange={(event) =>
                        setLayoutConfigName(event.target.value)
                      }
                      onFocus={() =>
                        setLayoutConfigName(selectedLayoutConfig?.name ?? "")
                      }
                    />
                    <button
                      disabled={!selectedLayoutConfig}
                      type="button"
                      onClick={() => void renameSelectedLayoutConfig()}
                    >
                      重命名
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex min-w-0 cursor-pointer items-center justify-start gap-1 border-0 bg-transparent p-0 text-[11px] text-(--ink)">
                      <input
                        checked={
                          selectedLayoutConfig
                            ? selectedLayoutConfig.id ===
                              layoutSettings.defaultConfigId
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
                      <span>默认导入页</span>
                    </label>
                    <label className="flex min-w-0 cursor-pointer items-center justify-start gap-1 border-0 bg-transparent p-0 text-[11px] text-(--ink)">
                      <input
                        checked={
                          selectedLayoutConfig
                            ? selectedLayoutConfig.id ===
                              layoutSettings.newPageConfigId
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
                      <span>默认新标签页</span>
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
                      打开配置文件
                    </button>
                    <button
                      disabled={!selectedLayoutConfig}
                      type="button"
                      onClick={() => void deleteSelectedLayoutConfig()}
                    >
                      删除配置
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : category === "appearance" ? (
            <section
              className={`${panelClass} grid min-h-0 grid-rows-[28px_auto_minmax(0,1fr)]`}
            >
              <header className={titleClass}>外观</header>
              <div className="grid gap-1.5 border-b border-(--line) bg-(--surface-bg) p-2">
                <div className={configTitleClass}>主题设置</div>
                <label className="grid grid-cols-[104px_160px_58px_minmax(0,1fr)] items-center gap-1.5 [&>span]:text-[11px] [&>span]:text-(--text) [&>select]:h-6 [&>select]:min-w-0 [&>select]:border [&>select]:border-(--line-strong) [&>select]:bg-(--surface-inset-bg) [&>select]:px-1.5 [&>select]:text-(--ink) [&>button]:h-6 [&>button]:min-w-0 [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong)">
                  <span>主题</span>
                  <select
                    aria-label="主题"
                    value={themeId}
                    onChange={(event) =>
                      setThemeId(event.target.value as ThemeId)
                    }
                  >
                    {themeOptions.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </select>
                  <ActionFeedbackButton
                    feedbackKind="apply"
                    label="应用"
                    onAction={saveTheme}
                  />
                </label>
              </div>
            </section>
          ) : category === "network" ? (
            <section className={panelClass}>
              <header className={titleClass}>网络</header>
              <label className="grid min-h-7 grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 border-b border-(--line) bg-(--surface-bg) px-2 text-[11px]">
                <input
                  checked={proxyEnabled}
                  type="checkbox"
                  onChange={(event) => setProxyEnabled(event.target.checked)}
                />
                <span>启用代理</span>
              </label>
              <div className={pathListClass}>
                <label className={pathRowClass}>
                  <span>代理地址</span>
                  <input
                    aria-label="代理地址"
                    placeholder="输入代理地址，例如 127.0.0.1"
                    value={proxyHost}
                    onChange={(event) => setProxyHost(event.target.value)}
                  />
                </label>
                <label
                  className={`${pathRowClass} grid-cols-[104px_minmax(0,1fr)_70px]`}
                >
                  <span>代理端口</span>
                  <input
                    aria-label="代理端口"
                    max={65535}
                    min={1}
                    placeholder="输入代理端口"
                    type="number"
                    value={proxyPort}
                    onChange={(event) => setProxyPort(event.target.value)}
                  />
                  <ActionFeedbackButton
                    className="min-w-[70px]"
                    disabled={!networkChanged}
                    label="保存"
                    onAction={saveNetworkSettings}
                  />
                </label>
              </div>
            </section>
          ) : (
            <section
              className={`${panelClass} grid min-h-0 grid-rows-[28px_minmax(0,1fr)_32px]`}
            >
              <header className={titleClass}>快捷键</header>
              <div className="min-h-0 overflow-auto bg-(--surface-bg)">
                {shortcutActionConfigs.map((config) => {
                  const definitions = shortcutSettings[config.action] ?? [];

                  return (
                    <div
                      className="grid min-h-7 grid-cols-[130px_150px_minmax(0,1fr)] items-center gap-1.5 border-b border-(--line) px-2 py-[3px]"
                      key={config.action}
                    >
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {config.label}
                      </span>
                      <small className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
                        {config.description}
                      </small>
                      <div className="flex min-w-0 flex-wrap gap-1 [&_button]:h-[22px] [&_button]:cursor-default [&_button]:border [&_button]:border-(--line-strong) [&_button]:bg-(--surface-inset-bg) [&_button]:px-1.5 [&_button]:leading-5 [&_button]:text-(--ink) [&_button:disabled]:text-(--disabled-ink)">
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
                                ? "按键..."
                                : formatShortcutDefinition(definition)}
                            </button>
                            <button
                              aria-label="删除快捷键"
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
                            ? "按键..."
                            : "添加"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[72px_72px_minmax(0,1fr)] items-center gap-1.5 border-t border-(--line) bg-(--panel) px-2 py-1 [&>button]:h-[22px] [&>button]:cursor-default [&>button]:border [&>button]:border-(--line-strong) [&>button]:bg-(--panel-strong) [&>button]:text-(--ink)">
                <ActionFeedbackButton label="保存" onAction={saveShortcuts} />
                <button type="button" onClick={resetShortcuts}>
                  恢复默认
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
