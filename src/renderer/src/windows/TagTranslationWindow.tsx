import { useEffect, useState } from "react";
import type { TagTranslationSettings } from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";

const fallbackSettings: TagTranslationSettings = {
  csvPath: "",
  keepOriginalTags: true,
  enableContextMenuTranslation: false,
  translateOnTagCreate: false,
};
const translationRootClass =
  "grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_32px] bg-(--bg)";
const translationContentClass =
  "grid content-start gap-1.5 min-h-0 min-w-0 p-2";
const translationFieldClass =
  "grid grid-cols-[88px_minmax(0,1fr)_32px] items-center gap-1.5 [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&>span]:text-(--text) [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>textarea]:min-w-0 [&>textarea]:border [&>textarea]:border-(--line-strong) [&>textarea]:bg-(--surface-inset-bg) [&>textarea]:px-1.5 [&>textarea]:text-(--ink)";
const translationHintClass = "h-5 text-[10px] leading-5 text-(--muted)";
const translationCheckClass =
  "grid min-h-6 grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 border border-(--line) bg-(--panel) px-2 text-[11px]";
const translationFooterClass =
  "grid grid-cols-[minmax(0,1fr)_58px_70px] items-center border-t border-(--line) bg-(--surface-bg)";
const translationFooterTextClass =
  "min-w-0 overflow-hidden px-2 leading-[31px] text-ellipsis whitespace-nowrap text-(--muted)";
const translationButtonClass =
  "h-8 border-0 border-l border-(--line) bg-(--panel-strong) px-2 text-[11px] text-(--ink)";

export function TagTranslationWindow(): JSX.Element {
  const [settings, setSettings] =
    useState<TagTranslationSettings>(fallbackSettings);
  const [message, setMessage] = useState("未加载");

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      setMessage("preload unavailable");
      return;
    }

    const nextSettings = await window.asteria.getTagTranslationSettings();
    setSettings(nextSettings);
    setMessage("配置已加载");
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings =
      await window.asteria.updateTagTranslationSettings(settings);
    setSettings(nextSettings);
    setMessage("配置已保存");
  }

  async function updateAndSaveSettings(
    patch: Partial<TagTranslationSettings>,
  ): Promise<void> {
    const nextSettings = {
      ...settings,
      ...patch,
    };

    setSettings(nextSettings);

    if (!window.asteria) {
      return;
    }

    const savedSettings =
      await window.asteria.updateTagTranslationSettings(nextSettings);
    setSettings(savedSettings);
    setMessage("配置已保存");
  }

  async function selectCsvPath(): Promise<void> {
    const selectedPath = await window.asteria?.selectTagTranslationCsv();

    if (selectedPath) {
      setSettings((currentSettings) => ({
        ...currentSettings,
        csvPath: selectedPath,
      }));
    }
  }

  return (
    <section className={translationRootClass}>
      <div className={translationContentClass}>
        <label className={translationFieldClass}>
          <span>翻译文件</span>
          <input
            className="h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)"
            aria-label="标签翻译 CSV 路径"
            placeholder="输入标签翻译 CSV 路径"
            value={settings.csvPath}
            onChange={(event) =>
              setSettings({ ...settings, csvPath: event.target.value })
            }
          />
          <button
            className="h-6 cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)"
            type="button"
            onClick={() => void selectCsvPath()}
          >
            ...
          </button>
        </label>

        <div className={translationHintClass}>CSV 格式：1girl,0,1个女孩</div>

        <label className={translationCheckClass}>
          <input
            checked={settings.keepOriginalTags}
            type="checkbox"
            onChange={(event) =>
              void updateAndSaveSettings({
                keepOriginalTags: event.target.checked,
              })
            }
          />
          <span>在数据库中保留原标签</span>
        </label>

        <label className={translationCheckClass}>
          <input
            checked={settings.enableContextMenuTranslation}
            type="checkbox"
            onChange={(event) =>
              void updateAndSaveSettings({
                enableContextMenuTranslation: event.target.checked,
              })
            }
          />
          <span>启用右键菜单翻译标签</span>
        </label>

        <label className={translationCheckClass}>
          <input
            checked={settings.translateOnTagCreate}
            type="checkbox"
            onChange={(event) =>
              void updateAndSaveSettings({
                translateOnTagCreate: event.target.checked,
              })
            }
          />
          <span>创建标签时尝试翻译</span>
        </label>
      </div>

      <footer className={translationFooterClass}>
        <span className={translationFooterTextClass}>{message}</span>
        <button
          className={translationButtonClass}
          type="button"
          onClick={() => void loadSettings()}
        >
          刷新
        </button>
        <ActionFeedbackButton label="保存" onAction={saveSettings} />
      </footer>
    </section>
  );
}
