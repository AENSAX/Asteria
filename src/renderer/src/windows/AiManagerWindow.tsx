import { useEffect, useState } from "react";
import type {
  AiModelCatalog,
  AiModelInfo,
  AiSettings,
} from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { ResizableColumns } from "../components/ResizableColumns";
import { formatBytes } from "../utils/format";
import { useLanguage } from "../utils/language";

type AiConfigSection = "model" | "feature";

const fallbackSettings: AiSettings = {
  modelPath: "",
  modelName: "",
  generalThreshold: 0.35,
  characterThreshold: 0.75,
  autoTagUntaggedImagesOnImport: false,
  enableImageRetagContextMenu: false,
  enableImageAppendTagContextMenu: false,
};

const emptyModelInfo: AiModelInfo = {
  modelName: "",
  modelPath: "",
  modelFilePath: null,
  sizeBytes: 0,
  exists: false,
};

const emptyModelCatalog: AiModelCatalog = {
  modelPath: "",
  models: [],
  selectedModelName: null,
  selectedModel: null,
};

const aiShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[160px_minmax(0,1fr)] bg-(--panel)";
const aiNavClass =
  "grid auto-rows-[28px] content-start min-h-0 min-w-0 border-r border-(--line) bg-(--surface-bg)";
const aiNavButtonClass =
  "h-7 border-0 border-b border-(--line) bg-transparent px-2 text-left text-[12px] text-(--ink)";
const aiNavActiveClass = "border-l-2 border-l-(--accent) bg-(--panel-strong)";
const aiContentClass =
  "grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_34px] bg-(--panel)";
const aiPanelClass =
  "grid gap-2 content-start min-h-0 min-w-0 p-2 overflow-hidden";
const aiGridClass = "grid auto-rows-[28px] gap-1.5 content-start min-w-0";
const aiFieldClass =
  "grid grid-cols-[70px_minmax(0,1fr)] items-center min-w-0 gap-1.5 [&>span]:text-(--muted) [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>select]:h-6 [&>select]:min-w-0 [&>select]:border [&>select]:border-(--line-strong) [&>select]:bg-(--surface-inset-bg) [&>select]:px-1.5 [&>select]:text-(--ink)";
const aiInputClass =
  "ui-input";
const aiSelectClass = aiInputClass;
const aiPathRowClass =
  "grid grid-cols-[70px_minmax(0,1fr)_34px] items-center gap-0";
const aiModelActionsClass = "grid grid-cols-[80px_104px_minmax(0,1fr)] gap-1.5";
const aiButtonClass =
  "ui-button";
const aiModelPanelClass =
  "grid min-h-0 min-w-0 grid-rows-[26px_minmax(0,1fr)] border border-(--line) bg-(--panel)";
const aiModelHeaderClass =
  "h-[26px] border-b border-(--line) bg-(--surface-raised-bg) px-2 font-semibold leading-[25px]";
const aiModelListClass = "grid auto-rows-min content-start min-h-0 min-w-0 p-2";
const aiModelRowClass =
  "grid min-h-6 grid-cols-[72px_minmax(0,1fr)] border-b border-(--line) text-[12px]";
const aiFeaturePanelClass =
  "grid min-h-0 min-w-0 grid-rows-[min-content_min-content_minmax(0,1fr)] gap-2 p-2";
const aiCheckRowClass =
  "grid h-7 grid-cols-[20px_minmax(0,1fr)] items-center border border-(--line-strong) bg-(--panel-strong) px-2 text-[12px]";
const aiFooterClass =
  "grid grid-cols-[minmax(0,1fr)_58px_58px] border-t border-(--line) bg-(--surface-bg)";
const aiFooterSpanClass =
  "min-w-0 overflow-hidden px-2 leading-[33px] text-ellipsis whitespace-nowrap text-(--muted)";
const aiFooterButtonClass =
  "ui-button ui-button-fill min-w-0 border-y-0 border-r-0 border-l-(--line)";

export function AiManagerWindow(): JSX.Element {
  const { t } = useLanguage();
  const [section, setSection] = useState<AiConfigSection>("model");
  const [settings, setSettings] = useState<AiSettings>(fallbackSettings);
  const [modelInfo, setModelInfo] = useState<AiModelInfo>(emptyModelInfo);
  const [modelCatalog, setModelCatalog] =
    useState<AiModelCatalog>(emptyModelCatalog);
  const [message, setMessage] = useState(() => t("window.ai.loading"));

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    const nextSettings = await window.asteria.getAiSettings();
    setSettings(nextSettings);
    setModelInfo(createModelInfoFromSettings(nextSettings));
    setModelCatalog(emptyModelCatalog);

    if (nextSettings.modelPath) {
      const nextCatalog = await window.asteria.detectAiModels(
        nextSettings.modelPath,
        nextSettings.modelName,
      );
      applyModelCatalog(nextCatalog, nextSettings);
    }

    setMessage(t("window.ai.loaded"));
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateAiSettings(settings);
    setSettings(nextSettings);
    setMessage(t("window.ai.saved"));
  }

  async function updateAndSaveSettings(
    patch: Partial<AiSettings>,
  ): Promise<void> {
    const nextSettings = {
      ...settings,
      ...patch,
    };

    setSettings(nextSettings);

    if (!window.asteria) {
      return;
    }

    const savedSettings = await window.asteria.updateAiSettings(nextSettings);
    setSettings(savedSettings);
    setMessage(t("window.ai.saved"));
  }

  async function selectModelDirectory(): Promise<void> {
    const selectedPath = await window.asteria?.selectAiModelDirectory();

    if (selectedPath) {
      updateSettings({ modelPath: selectedPath, modelName: "" });
      setModelInfo((currentInfo) => ({
        ...currentInfo,
        modelName: "",
        modelPath: selectedPath,
        modelFilePath: null,
        sizeBytes: 0,
        exists: false,
      }));
      setModelCatalog(emptyModelCatalog);
    }
  }

  async function detectModel(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setMessage(t("window.ai.detecting"));
    const nextCatalog = await window.asteria.detectAiModels(
      settings.modelPath,
      settings.modelName,
    );
    applyModelCatalog(nextCatalog, settings);
    setMessage(
      nextCatalog.models.length > 0
        ? t("window.ai.detected", { count: nextCatalog.models.length })
        : t("window.ai.noModel"),
    );
  }

  async function downloadDefaultModel(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    setMessage(t("window.ai.downloading"));
    const nextInfo = await window.asteria.downloadDefaultAiModel(
      settings.modelPath,
    );
    const nextCatalog = await window.asteria.detectAiModels(
      nextInfo.modelPath || settings.modelPath,
      nextInfo.modelName,
    );
    applyModelCatalog(nextCatalog, settings);
    setMessage(nextInfo.exists ? t("window.ai.ready") : t("window.ai.noModelDetected"));
  }

  function applyModelCatalog(
    nextCatalog: AiModelCatalog,
    baseSettings: AiSettings,
  ): void {
    const selectedModel = nextCatalog.selectedModel ?? emptyModelInfo;
    setModelCatalog(nextCatalog);
    setModelInfo(selectedModel);
    updateSettings({
      ...baseSettings,
      modelPath: nextCatalog.modelPath || baseSettings.modelPath,
      modelName: selectedModel.modelName,
    });
  }

  function selectModel(modelName: string): void {
    const selectedModel = modelCatalog.models.find(
      (model) => model.modelName === modelName,
    );

    updateSettings({ modelName });
    setModelInfo(
      selectedModel ?? createModelInfoFromSettings({ ...settings, modelName }),
    );
    setModelCatalog((currentCatalog) => ({
      ...currentCatalog,
      selectedModelName: selectedModel?.modelName ?? modelName,
      selectedModel: selectedModel ?? null,
    }));
  }

  function updateSettings(patch: Partial<AiSettings>): void {
    setSettings((currentSettings) => ({
      ...currentSettings,
      ...patch,
    }));
  }

  return (
    <ResizableColumns
      className={aiShellClass}
      defaultLeftWidth={160}
      minLeftWidth={120}
      minRightWidth={420}
      storageKey="asteria:ai-manager-sidebar-width"
      left={
        <aside className={aiNavClass}>
          <button
            className={`${aiNavButtonClass} ${section === "model" ? aiNavActiveClass : ""}`}
            type="button"
            onClick={() => setSection("model")}
          >
            {t("window.ai.modelConfig")}
          </button>
          <button
            className={`${aiNavButtonClass} ${section === "feature" ? aiNavActiveClass : ""}`}
            type="button"
            onClick={() => setSection("feature")}
          >
            {t("window.ai.featureConfig")}
          </button>
        </aside>
      }
      right={
        <main className={aiContentClass}>
          {section === "model" ? (
            <section className={aiPanelClass}>
              <div className={aiGridClass}>
                <label className={aiPathRowClass}>
                  <span>{t("window.ai.path")}</span>
                  <input
                    className={aiInputClass}
                    aria-label={t("window.ai.path")}
                    placeholder={t("window.ai.pathPlaceholder")}
                    value={settings.modelPath}
                    onChange={(event) => {
                      updateSettings({ modelPath: event.target.value });
                      setModelInfo((currentInfo) => ({
                        ...currentInfo,
                        modelName: "",
                        modelPath: event.target.value,
                      }));
                      setModelCatalog(emptyModelCatalog);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void selectModelDirectory()}
                  >
                    ...
                  </button>
                </label>

                <div className={aiModelActionsClass}>
                  <button
                    className={aiButtonClass}
                    type="button"
                    onClick={() => void detectModel()}
                  >
                    {t("window.ai.detectModel")}
                  </button>
                  <button
                    className={aiButtonClass}
                    type="button"
                    onClick={() => void downloadDefaultModel()}
                  >
                    {t("window.ai.downloadDefault")}
                  </button>
                </div>

                <label className={aiFieldClass}>
                  <span>{t("window.ai.model")}</span>
                  <select
                    className={aiSelectClass}
                    aria-label={t("window.ai.selectModel")}
                    value={settings.modelName}
                    onChange={(event) => selectModel(event.target.value)}
                  >
                    <option value="">{t("window.ai.noneSelected")}</option>
                    {modelCatalog.models.map((model) => (
                      <option
                        key={model.modelFilePath ?? model.modelName}
                        value={model.modelName}
                      >
                        {model.modelName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={aiFieldClass}>
                  <span>{t("window.ai.generalThreshold")}</span>
                  <input
                    className={aiInputClass}
                    aria-label={t("window.ai.generalThreshold")}
                    max={1}
                    min={0}
                    placeholder={t("window.ai.thresholdPlaceholder")}
                    step={0.01}
                    type="number"
                    value={settings.generalThreshold}
                    onChange={(event) =>
                      updateSettings({
                        generalThreshold: normalizeThresholdInput(
                          event.target.value,
                          fallbackSettings.generalThreshold,
                        ),
                      })
                    }
                  />
                </label>

                <label className={aiFieldClass}>
                  <span>{t("window.ai.characterThreshold")}</span>
                  <input
                    className={aiInputClass}
                    aria-label={t("window.ai.characterThreshold")}
                    max={1}
                    min={0}
                    placeholder={t("window.ai.thresholdPlaceholder")}
                    step={0.01}
                    type="number"
                    value={settings.characterThreshold}
                    onChange={(event) =>
                      updateSettings({
                        characterThreshold: normalizeThresholdInput(
                          event.target.value,
                          fallbackSettings.characterThreshold,
                        ),
                      })
                    }
                  />
                </label>
              </div>

              <section className={aiModelPanelClass}>
                <header className={aiModelHeaderClass}>{t("window.ai.info")}</header>
                <dl className={aiModelListClass}>
                  <div>
                    <dt className="px-2 leading-6 text-(--muted)">{t("window.ai.modelName")}</dt>
                    <dd className="px-2 leading-6">
                      {modelInfo.modelName || settings.modelName || "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="px-2 leading-6 text-(--muted)">{t("window.ai.modelCount")}</dt>
                    <dd className="px-2 leading-6">
                      {modelCatalog.models.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="px-2 leading-6 text-(--muted)">{t("window.ai.modelSize")}</dt>
                    <dd className="px-2 leading-6">
                      {modelInfo.exists
                        ? formatBytes(modelInfo.sizeBytes)
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="px-2 leading-6 text-(--muted)">{t("window.ai.path")}</dt>
                    <dd className="px-2 leading-6">
                      {(modelInfo.modelFilePath ?? settings.modelPath) || "-"}
                    </dd>
                  </div>
                </dl>
              </section>
            </section>
          ) : (
            <section className={aiFeaturePanelClass}>
              <label className={aiCheckRowClass}>
                <input
                  checked={settings.autoTagUntaggedImagesOnImport}
                  type="checkbox"
                  onChange={(event) =>
                    void updateAndSaveSettings({
                      autoTagUntaggedImagesOnImport: event.target.checked,
                    })
                  }
                />
                <span>{t("window.ai.enableAutoTag")}</span>
              </label>
              <label className={aiCheckRowClass}>
                <input
                  checked={settings.enableImageRetagContextMenu}
                  type="checkbox"
                  onChange={(event) =>
                    void updateAndSaveSettings({
                      enableImageRetagContextMenu: event.target.checked,
                    })
                  }
                />
                <span>{t("window.ai.enableRetag")}</span>
              </label>
              <label className={aiCheckRowClass}>
                <input
                  checked={settings.enableImageAppendTagContextMenu}
                  type="checkbox"
                  onChange={(event) =>
                    void updateAndSaveSettings({
                      enableImageAppendTagContextMenu: event.target.checked,
                    })
                  }
                />
                <span>{t("window.ai.enableAppend")}</span>
              </label>
            </section>
          )}

          <footer className={aiFooterClass}>
            <span className={aiFooterSpanClass}>{message}</span>
            <button
              className={aiFooterButtonClass}
              type="button"
              onClick={() => void loadSettings()}
            >
              {t("common.refresh")}
            </button>
            <ActionFeedbackButton label={t("common.save")} onAction={saveSettings} />
          </footer>
        </main>
      }
    />
  );
}

function createModelInfoFromSettings(settings: AiSettings): AiModelInfo {
  return {
    modelName: settings.modelName,
    modelPath: settings.modelPath,
    modelFilePath: null,
    sizeBytes: 0,
    exists: Boolean(settings.modelName),
  };
}

function normalizeThresholdInput(value: string, fallback: number): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsedValue));
}
