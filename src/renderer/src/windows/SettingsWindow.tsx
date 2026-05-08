import { useEffect, useState } from 'react';
import type {
  NetworkSettings,
  PageLayoutConfigRecord,
  PageLayoutSettings,
  StorageSettings
} from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';
import { ResizableColumns } from '../components/ResizableColumns';
import {
  loadInterfaceSettings,
  normalizeBrowserPageSize,
  saveInterfaceSettings
} from '../utils/interfaceSettings';
import {
  loadThemeSettings,
  saveThemeSettings,
  themeOptions,
  type ThemeId
} from '../utils/themes';
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
  type ShortcutSettings
} from '../utils/shortcuts';

type SettingsCategory = 'file' | 'interface' | 'appearance' | 'network' | 'shortcut';

export function SettingsWindow(): JSX.Element {
  const [category, setCategory] = useState<SettingsCategory>('file');
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [fileStoragePath, setFileStoragePath] = useState('');
  const [thumbnailStoragePath, setThumbnailStoragePath] = useState('');
  const [convertImportedImagesToPng, setConvertImportedImagesToPng] = useState(false);
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>({
    proxyEnabled: false,
    proxyHost: '',
    proxyPort: 7890
  });
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('7890');
  const [layoutConfigs, setLayoutConfigs] = useState<PageLayoutConfigRecord[]>([]);
  const [layoutSettings, setLayoutSettings] = useState<PageLayoutSettings>({
    defaultConfigId: null,
    newPageConfigId: null
  });
  const [selectedLayoutConfigId, setSelectedLayoutConfigId] = useState<string | null>(null);
  const [layoutConfigName, setLayoutConfigName] = useState('');
  const [layoutMessage, setLayoutMessage] = useState('未加载');
  const [savingStoragePath, setSavingStoragePath] = useState(false);
  const [savingThumbnailPath, setSavingThumbnailPath] = useState(false);
  const [browserPageSize, setBrowserPageSize] = useState(() =>
    String(loadInterfaceSettings().browserPageSize)
  );
  const [themeId, setThemeId] = useState<ThemeId>(() => loadThemeSettings().themeId);
  const [shortcutSettings, setShortcutSettings] = useState<ShortcutSettings>(() => loadShortcutSettings());
  const [recordingShortcut, setRecordingShortcut] = useState<{
    action: ShortcutAction;
    index: number;
  } | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    setLayoutConfigName(layoutConfigs.find((config) => config.id === selectedLayoutConfigId)?.name ?? '');
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

      const definition = createShortcutDefinitionFromKeyboardEvent(recordingShortcut.action, event);

      if (!definition) {
        return;
      }

      setShortcutSettings((currentSettings) =>
        updateShortcutDefinition(currentSettings, recordingShortcut.action, recordingShortcut.index, definition)
      );
      setRecordingShortcut(null);
    }

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      setShortcutRecordingActive(false);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [recordingShortcut]);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const [nextSettings, nextNetworkSettings, nextLayoutSettings, nextLayoutConfigs] = await Promise.all([
      window.asteria.getStorageSettings(),
      window.asteria.getNetworkSettings(),
      window.asteria.getPageLayoutSettings(),
      window.asteria.listPageLayoutConfigs()
    ]);
    setSettings(nextSettings);
    setFileStoragePath(nextSettings.fileStoragePath);
    setThumbnailStoragePath(nextSettings.thumbnailStoragePath);
    setConvertImportedImagesToPng(nextSettings.convertImportedImagesToPng);
    applyNetworkSettings(nextNetworkSettings);
    setLayoutSettings(nextLayoutSettings);
    setLayoutConfigs(nextLayoutConfigs);
    setSelectedLayoutConfigId((currentId) => currentId ?? nextLayoutConfigs[0]?.id ?? null);
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
      const nextSettings = await window.asteria.updateFileStoragePath(fileStoragePath);
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
      const nextSettings = await window.asteria.updateThumbnailStoragePath(thumbnailStoragePath);
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

    const nextSettings = await window.asteria.updateConvertImportedImagesToPng(convertImportedImagesToPng);
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
    if (!window.asteria || !selectedLayoutConfigId || !layoutConfigName.trim()) {
      return;
    }

    const configs = await window.asteria.renamePageLayoutConfig(selectedLayoutConfigId, layoutConfigName);
    setLayoutConfigs(configs);
    setSelectedLayoutConfigId(configs.find((config) => config.name === layoutConfigName.trim())?.id ?? configs[0]?.id ?? null);
    setLayoutMessage(`${configs.length} 个配置`);
  }

  async function deleteSelectedLayoutConfig(): Promise<void> {
    if (!window.asteria || !selectedLayoutConfigId) {
      return;
    }

    const configs = await window.asteria.deletePageLayoutConfig(selectedLayoutConfigId);
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

  async function setSelectedAsDefaultLayoutConfig(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.setDefaultPageLayoutConfig(selectedLayoutConfigId);
    setLayoutSettings(nextSettings);
    setLayoutConfigs(await window.asteria.listPageLayoutConfigs());
  }

  async function setSelectedAsNewPageLayoutConfig(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.setNewPageLayoutConfig(selectedLayoutConfigId);
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
      browserPageSize: normalizeBrowserPageSize(browserPageSize)
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
      proxyPort: Number(proxyPort)
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
      [action]: (currentSettings[action] ?? []).filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  const filePathChanged = settings ? settings.fileStoragePath !== fileStoragePath : false;
  const thumbnailPathChanged = settings ? settings.thumbnailStoragePath !== thumbnailStoragePath : false;
  const convertImportedImagesChanged = settings
    ? settings.convertImportedImagesToPng !== convertImportedImagesToPng
    : false;
  const networkChanged =
    networkSettings.proxyEnabled !== proxyEnabled ||
    networkSettings.proxyHost !== proxyHost ||
    String(networkSettings.proxyPort) !== proxyPort;
  const selectedLayoutConfig = layoutConfigs.find((config) => config.id === selectedLayoutConfigId) ?? null;

  return (
    <ResizableColumns
      className="settings-window"
      defaultLeftWidth={148}
      minLeftWidth={110}
      minRightWidth={360}
      storageKey="asteria:settings-sidebar-width"
      left={(
        <aside className="settings-nav">
        <button
          className={category === 'file' ? 'settings-nav-item active' : 'settings-nav-item'}
          type="button"
          onClick={() => setCategory('file')}
        >
          文件
        </button>
        <button
          className={category === 'interface' ? 'settings-nav-item active' : 'settings-nav-item'}
          type="button"
          onClick={() => setCategory('interface')}
        >
          界面
        </button>
        <button
          className={category === 'appearance' ? 'settings-nav-item active' : 'settings-nav-item'}
          type="button"
          onClick={() => setCategory('appearance')}
        >
          外观
        </button>
        <button
          className={category === 'network' ? 'settings-nav-item active' : 'settings-nav-item'}
          type="button"
          onClick={() => setCategory('network')}
        >
          网络
        </button>
        <button
          className={category === 'shortcut' ? 'settings-nav-item active' : 'settings-nav-item'}
          type="button"
          onClick={() => setCategory('shortcut')}
        >
          快捷键
        </button>
        </aside>
      )}
      right={(
        <main className="settings-content">
        {category === 'file' ? (
          <section className="settings-panel">
            <header className="settings-title">文件</header>
            <div className="settings-path-list">
              <label className="settings-path-row">
                <span>文件存储位置</span>
                <input
                  aria-label="文件存储位置"
                  placeholder="输入文件存储位置"
                  value={fileStoragePath}
                  onChange={(event) => setFileStoragePath(event.target.value)}
                />
                <button type="button" onClick={() => void browseStoragePath()}>
                  ...
                </button>
                <ActionFeedbackButton
                  disabled={!filePathChanged || savingStoragePath}
                  label="保存"
                  onAction={saveStoragePath}
                />
              </label>
              <label className="settings-path-row">
                <span>缩略图缓存位置</span>
                <input
                  aria-label="缩略图缓存位置"
                  placeholder="输入缩略图缓存位置"
                  value={thumbnailStoragePath}
                  onChange={(event) => setThumbnailStoragePath(event.target.value)}
                />
                <button type="button" onClick={() => void browseThumbnailPath()}>
                  ...
                </button>
                <ActionFeedbackButton
                  disabled={!thumbnailPathChanged || savingThumbnailPath}
                  label="保存"
                  onAction={saveThumbnailPath}
                />
              </label>
              <label className="settings-check-row">
                <input
                  checked={convertImportedImagesToPng}
                  type="checkbox"
                  onChange={(event) => setConvertImportedImagesToPng(event.target.checked)}
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
        ) : category === 'interface' ? (
          <section className="settings-panel interface-settings-panel">
            <header className="settings-title">界面</header>
            <div className="interface-config-block">
              <div className="interface-config-title">浏览</div>
              <label className="interface-config-row">
                <span>单页文件数</span>
                <input
                  aria-label="文件浏览器单页文件数"
                  min={20}
                  placeholder="输入单页文件数"
                  type="number"
                  value={browserPageSize}
                  onChange={(event) => setBrowserPageSize(event.target.value)}
                />
                <ActionFeedbackButton label="保存" onAction={saveBrowserPageSize} />
              </label>
            </div>
            <div className="interface-config-title">页面配置</div>
            <div className="layout-config-area">
              <div className="layout-config-list">
                {layoutConfigs.length > 0 ? (
                  layoutConfigs.map((config) => (
                    <button
                      className={config.id === selectedLayoutConfigId ? 'layout-config-item active' : 'layout-config-item'}
                      key={config.id}
                      title={config.path}
                      type="button"
                      onClick={() => setSelectedLayoutConfigId(config.id)}
                    >
                      <span>{config.name}</span>
                      <span>{config.isDefault ? '默认' : ''}</span>
                      <span>{config.isNewPage ? '新页' : ''}</span>
                    </button>
                  ))
                ) : (
                  <div className="layout-config-empty">没有配置</div>
                )}
              </div>

              <div className="layout-config-detail">
                <div className="layout-config-row">
                  <input
                    aria-label="配置名称"
                    placeholder="输入配置名称"
                    value={layoutConfigName}
                    onChange={(event) => setLayoutConfigName(event.target.value)}
                    onFocus={() => setLayoutConfigName(selectedLayoutConfig?.name ?? '')}
                  />
                  <button disabled={!selectedLayoutConfig} type="button" onClick={() => void renameSelectedLayoutConfig()}>
                    重命名
                  </button>
                </div>

                <div className="layout-config-actions">
                  <button type="button" onClick={() => void createLayoutConfig()}>
                    新建配置
                  </button>
                  <button disabled={!selectedLayoutConfig} type="button" onClick={() => void openSelectedLayoutConfig()}>
                    打开配置文件
                  </button>
                  <button disabled={!selectedLayoutConfig} type="button" onClick={() => void deleteSelectedLayoutConfig()}>
                    删除配置
                  </button>
                </div>

                <div className="layout-config-actions">
                  <button disabled={!selectedLayoutConfig} type="button" onClick={() => void setSelectedAsDefaultLayoutConfig()}>
                    设为默认配置
                  </button>
                  <button disabled={!selectedLayoutConfig} type="button" onClick={() => void setSelectedAsNewPageLayoutConfig()}>
                    设为新页面配置
                  </button>
                </div>

                <dl className="layout-config-info">
                  <div>
                    <dt>默认配置</dt>
                    <dd>{layoutSettings.defaultConfigId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>新页面配置</dt>
                    <dd>{layoutSettings.newPageConfigId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{layoutMessage}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        ) : category === 'appearance' ? (
          <section className="settings-panel appearance-settings-panel">
            <header className="settings-title">外观</header>
            <div className="appearance-config-block">
              <div className="interface-config-title">主题设置</div>
              <label className="appearance-theme-row">
                <span>主题</span>
                <select
                  aria-label="主题"
                  value={themeId}
                  onChange={(event) => setThemeId(event.target.value as ThemeId)}
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
        ) : category === 'network' ? (
          <section className="settings-panel network-settings-panel">
            <header className="settings-title">网络</header>
            <label className="network-config-check">
              <input
                checked={proxyEnabled}
                type="checkbox"
                onChange={(event) => setProxyEnabled(event.target.checked)}
              />
              <span>启用代理</span>
            </label>
            <div className="settings-path-list">
              <label className="settings-path-row">
                <span>代理地址</span>
                <input
                  aria-label="代理地址"
                  placeholder="输入代理地址，例如 127.0.0.1"
                  value={proxyHost}
                  onChange={(event) => setProxyHost(event.target.value)}
                />
              </label>
              <label className="settings-path-row network-path-row">
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
                  className="settings-action-button"
                  disabled={!networkChanged}
                  label="保存"
                  onAction={saveNetworkSettings}
                />
              </label>
            </div>
          </section>
        ) : (
          <section className="settings-panel shortcut-settings-panel">
            <header className="settings-title">快捷键</header>
            <div className="shortcut-settings-list">
              {shortcutActionConfigs.map((config) => {
                const definitions = shortcutSettings[config.action] ?? [];

                return (
                <div className="shortcut-settings-row" key={config.action}>
                  <span>{config.label}</span>
                  <small>{config.description}</small>
                  <div className="shortcut-settings-bindings">
                    {definitions.map((definition, index) => (
                      <span className="shortcut-binding" key={`${config.action}-${index}`}>
                        <button
                          className={
                            recordingShortcut?.action === config.action && recordingShortcut.index === index
                              ? 'recording'
                              : ''
                          }
                          type="button"
                          onClick={() => setRecordingShortcut({ action: config.action, index })}
                        >
                          {recordingShortcut?.action === config.action && recordingShortcut.index === index
                            ? '按键...'
                            : formatShortcutDefinition(definition)}
                        </button>
                        <button
                          aria-label="删除快捷键"
                          disabled={definitions.length <= 1}
                          type="button"
                          onClick={() => removeShortcut(config.action, index)}
                        >
                          x
                        </button>
                      </span>
                    ))}
                    <button
                      className={
                        recordingShortcut?.action === config.action && recordingShortcut.index === definitions.length
                          ? 'recording'
                          : ''
                      }
                      type="button"
                      onClick={() => setRecordingShortcut({ action: config.action, index: definitions.length })}
                    >
                      {recordingShortcut?.action === config.action && recordingShortcut.index === definitions.length
                        ? '按键...'
                        : '添加'}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="shortcut-settings-actions">
              <ActionFeedbackButton label="保存" onAction={saveShortcuts} />
              <button type="button" onClick={resetShortcuts}>
                恢复默认
              </button>
            </div>
          </section>
        )}
        </main>
      )}
    />
  );
}

function updateShortcutDefinition(
  settings: ShortcutSettings,
  action: ShortcutAction,
  index: number,
  definition: ShortcutDefinition
): ShortcutSettings {
  const definitions = [...(settings[action] ?? [])];
  definitions[index] = definition;

  return {
    ...settings,
    [action]: dedupeShortcutDefinitions(definitions)
  };
}

function dedupeShortcutDefinitions(definitions: ShortcutDefinition[]): ShortcutDefinition[] {
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
