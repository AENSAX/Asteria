import { useEffect, useState } from 'react';
import type { AiModelCatalog, AiModelInfo, AiSettings } from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';
import { ResizableColumns } from '../components/ResizableColumns';
import { formatBytes } from '../utils/format';

type AiConfigSection = 'model' | 'feature';

const fallbackSettings: AiSettings = {
  modelPath: '',
  modelName: '',
  generalThreshold: 0.35,
  characterThreshold: 0.75,
  autoTagUntaggedImagesOnImport: false,
  enableImageRetagContextMenu: false,
  enableImageAppendTagContextMenu: false
};

const emptyModelInfo: AiModelInfo = {
  modelName: '',
  modelPath: '',
  modelFilePath: null,
  sizeBytes: 0,
  exists: false
};

const emptyModelCatalog: AiModelCatalog = {
  modelPath: '',
  models: [],
  selectedModelName: null,
  selectedModel: null
};

export function AiManagerWindow(): JSX.Element {
  const [section, setSection] = useState<AiConfigSection>('model');
  const [settings, setSettings] = useState<AiSettings>(fallbackSettings);
  const [modelInfo, setModelInfo] = useState<AiModelInfo>(emptyModelInfo);
  const [modelCatalog, setModelCatalog] = useState<AiModelCatalog>(emptyModelCatalog);
  const [message, setMessage] = useState('未加载');

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const nextSettings = await window.asteria.getAiSettings();
    setSettings(nextSettings);
    setModelInfo(createModelInfoFromSettings(nextSettings));
    setModelCatalog(emptyModelCatalog);

    if (nextSettings.modelPath) {
      const nextCatalog = await window.asteria.detectAiModels(
        nextSettings.modelPath,
        nextSettings.modelName
      );
      applyModelCatalog(nextCatalog, nextSettings);
    }

    setMessage('配置已加载');
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateAiSettings(settings);
    setSettings(nextSettings);
    setMessage('配置已保存');
  }

  async function updateAndSaveSettings(patch: Partial<AiSettings>): Promise<void> {
    const nextSettings = {
      ...settings,
      ...patch
    };

    setSettings(nextSettings);

    if (!window.asteria) {
      return;
    }

    const savedSettings = await window.asteria.updateAiSettings(nextSettings);
    setSettings(savedSettings);
    setMessage('配置已保存');
  }

  async function selectModelDirectory(): Promise<void> {
    const selectedPath = await window.asteria?.selectAiModelDirectory();

    if (selectedPath) {
      updateSettings({ modelPath: selectedPath, modelName: '' });
      setModelInfo((currentInfo) => ({
        ...currentInfo,
        modelName: '',
        modelPath: selectedPath,
        modelFilePath: null,
        sizeBytes: 0,
        exists: false
      }));
      setModelCatalog(emptyModelCatalog);
    }
  }

  async function detectModel(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setMessage('正在检测模型');
    const nextCatalog = await window.asteria.detectAiModels(
      settings.modelPath,
      settings.modelName
    );
    applyModelCatalog(nextCatalog, settings);
    setMessage(
      nextCatalog.models.length > 0
        ? `已检测到 ${nextCatalog.models.length} 个模型`
        : '未检测到模型'
    );
  }

  async function downloadDefaultModel(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setMessage('正在下载默认模型');
    const nextInfo = await window.asteria.downloadDefaultAiModel(settings.modelPath);
    const nextCatalog = await window.asteria.detectAiModels(
      nextInfo.modelPath || settings.modelPath,
      nextInfo.modelName
    );
    applyModelCatalog(nextCatalog, settings);
    setMessage(nextInfo.exists ? '默认模型已就绪' : '未检测到模型');
  }

  function applyModelCatalog(nextCatalog: AiModelCatalog, baseSettings: AiSettings): void {
    const selectedModel = nextCatalog.selectedModel ?? emptyModelInfo;
    setModelCatalog(nextCatalog);
    setModelInfo(selectedModel);
    updateSettings({
      ...baseSettings,
      modelPath: nextCatalog.modelPath || baseSettings.modelPath,
      modelName: selectedModel.modelName
    });
  }

  function selectModel(modelName: string): void {
    const selectedModel = modelCatalog.models.find((model) => model.modelName === modelName);

    updateSettings({ modelName });
    setModelInfo(selectedModel ?? createModelInfoFromSettings({ ...settings, modelName }));
    setModelCatalog((currentCatalog) => ({
      ...currentCatalog,
      selectedModelName: selectedModel?.modelName ?? modelName,
      selectedModel: selectedModel ?? null
    }));
  }

  function updateSettings(patch: Partial<AiSettings>): void {
    setSettings((currentSettings) => ({
      ...currentSettings,
      ...patch
    }));
  }

  return (
    <ResizableColumns
      className="ai-manager-window"
      defaultLeftWidth={160}
      minLeftWidth={120}
      minRightWidth={420}
      storageKey="asteria:ai-manager-sidebar-width"
      left={(
        <aside className="ai-manager-nav">
          <button
            className={section === 'model' ? 'active' : ''}
            type="button"
            onClick={() => setSection('model')}
          >
            模型配置
          </button>
          <button
            className={section === 'feature' ? 'active' : ''}
            type="button"
            onClick={() => setSection('feature')}
          >
            功能配置
          </button>
        </aside>
      )}
      right={(
        <main className="ai-manager-content">
          {section === 'model' ? (
            <section className="ai-settings-panel">
              <div className="ai-settings-grid">
                <label className="ai-path-row">
                  <span>路径</span>
                  <input
                    aria-label="模型路径"
                    placeholder="输入模型文件夹路径"
                    value={settings.modelPath}
                    onChange={(event) => {
                      updateSettings({ modelPath: event.target.value });
                      setModelInfo((currentInfo) => ({
                        ...currentInfo,
                        modelName: '',
                        modelPath: event.target.value
                      }));
                      setModelCatalog(emptyModelCatalog);
                    }}
                  />
                  <button type="button" onClick={() => void selectModelDirectory()}>
                    ...
                  </button>
                </label>

                <div className="ai-model-actions">
                  <button type="button" onClick={() => void detectModel()}>
                    检测模型
                  </button>
                  <button type="button" onClick={() => void downloadDefaultModel()}>
                    下载默认模型
                  </button>
                </div>

                <label>
                  <span>模型</span>
                  <select
                    aria-label="选择模型"
                    value={settings.modelName}
                    onChange={(event) => selectModel(event.target.value)}
                  >
                    <option value="">未选择</option>
                    {modelCatalog.models.map((model) => (
                      <option key={model.modelFilePath ?? model.modelName} value={model.modelName}>
                        {model.modelName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>普通阈值</span>
                  <input
                    aria-label="普通阈值"
                    max={1}
                    min={0}
                    placeholder="输入 0-1"
                    step={0.01}
                    type="number"
                    value={settings.generalThreshold}
                    onChange={(event) =>
                      updateSettings({
                        generalThreshold: normalizeThresholdInput(
                          event.target.value,
                          fallbackSettings.generalThreshold
                        )
                      })
                    }
                  />
                </label>

                <label>
                  <span>角色阈值</span>
                  <input
                    aria-label="角色阈值"
                    max={1}
                    min={0}
                    placeholder="输入 0-1"
                    step={0.01}
                    type="number"
                    value={settings.characterThreshold}
                    onChange={(event) =>
                      updateSettings({
                        characterThreshold: normalizeThresholdInput(
                          event.target.value,
                          fallbackSettings.characterThreshold
                        )
                      })
                    }
                  />
                </label>
              </div>

              <section className="ai-model-panel">
                <header>模型信息</header>
                <dl>
                  <div>
                    <dt>模型名称</dt>
                    <dd>{modelInfo.modelName || settings.modelName || '-'}</dd>
                  </div>
                  <div>
                    <dt>模型数量</dt>
                    <dd>{modelCatalog.models.length}</dd>
                  </div>
                  <div>
                    <dt>模型大小</dt>
                    <dd>{modelInfo.exists ? formatBytes(modelInfo.sizeBytes) : '-'}</dd>
                  </div>
                  <div>
                    <dt>路径</dt>
                    <dd>{(modelInfo.modelFilePath ?? settings.modelPath) || '-'}</dd>
                  </div>
                </dl>
              </section>
            </section>
          ) : (
            <section className="ai-feature-panel">
              <label className="ai-check-row">
                <input
                  checked={settings.autoTagUntaggedImagesOnImport}
                  type="checkbox"
                  onChange={(event) =>
                    void updateAndSaveSettings({ autoTagUntaggedImagesOnImport: event.target.checked })
                  }
                />
                <span>当导入图片没有任何标签时启用模型打标</span>
              </label>
              <label className="ai-check-row">
                <input
                  checked={settings.enableImageRetagContextMenu}
                  type="checkbox"
                  onChange={(event) =>
                    void updateAndSaveSettings({ enableImageRetagContextMenu: event.target.checked })
                  }
                />
                <span>启用右键菜单为选中图片重新打标（覆盖）</span>
              </label>
              <label className="ai-check-row">
                <input
                  checked={settings.enableImageAppendTagContextMenu}
                  type="checkbox"
                  onChange={(event) =>
                    void updateAndSaveSettings({ enableImageAppendTagContextMenu: event.target.checked })
                  }
                />
                <span>启用右键菜单为选中图片追加标签（追加）</span>
              </label>
            </section>
          )}

          <footer className="ai-manager-footer">
            <span>{message}</span>
            <button type="button" onClick={() => void loadSettings()}>
              刷新
            </button>
            <ActionFeedbackButton label="保存" onAction={saveSettings} />
          </footer>
        </main>
      )}
    />
  );
}

function createModelInfoFromSettings(settings: AiSettings): AiModelInfo {
  return {
    modelName: settings.modelName,
    modelPath: settings.modelPath,
    modelFilePath: null,
    sizeBytes: 0,
    exists: Boolean(settings.modelName)
  };
}

function normalizeThresholdInput(value: string, fallback: number): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsedValue));
}
