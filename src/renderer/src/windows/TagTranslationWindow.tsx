import { useEffect, useState } from 'react';
import type { TagTranslationSettings } from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';

const fallbackSettings: TagTranslationSettings = {
  csvPath: '',
  keepOriginalTags: true,
  enableContextMenuTranslation: false,
  translateOnTagCreate: false
};

export function TagTranslationWindow(): JSX.Element {
  const [settings, setSettings] = useState<TagTranslationSettings>(fallbackSettings);
  const [message, setMessage] = useState('未加载');

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings(): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const nextSettings = await window.asteria.getTagTranslationSettings();
    setSettings(nextSettings);
    setMessage('配置已加载');
  }

  async function saveSettings(): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextSettings = await window.asteria.updateTagTranslationSettings(settings);
    setSettings(nextSettings);
    setMessage('配置已保存');
  }

  async function updateAndSaveSettings(patch: Partial<TagTranslationSettings>): Promise<void> {
    const nextSettings = {
      ...settings,
      ...patch
    };

    setSettings(nextSettings);

    if (!window.asteria) {
      return;
    }

    const savedSettings = await window.asteria.updateTagTranslationSettings(nextSettings);
    setSettings(savedSettings);
    setMessage('配置已保存');
  }

  async function selectCsvPath(): Promise<void> {
    const selectedPath = await window.asteria?.selectTagTranslationCsv();

    if (selectedPath) {
      setSettings((currentSettings) => ({
        ...currentSettings,
        csvPath: selectedPath
      }));
    }
  }

  return (
    <section className="tag-translation-window">
      <div className="tag-translation-content">
        <label className="tag-translation-path-row">
          <span>翻译文件</span>
          <input
            aria-label="标签翻译 CSV 路径"
            placeholder="输入标签翻译 CSV 路径"
            value={settings.csvPath}
            onChange={(event) => setSettings({ ...settings, csvPath: event.target.value })}
          />
          <button type="button" onClick={() => void selectCsvPath()}>
            ...
          </button>
        </label>

        <div className="tag-translation-hint">CSV 格式：1girl,0,1个女孩</div>

        <label className="tag-translation-check-row">
          <input
            checked={settings.keepOriginalTags}
            type="checkbox"
            onChange={(event) =>
              void updateAndSaveSettings({ keepOriginalTags: event.target.checked })
            }
          />
          <span>在数据库中保留原标签</span>
        </label>

        <label className="tag-translation-check-row">
          <input
            checked={settings.enableContextMenuTranslation}
            type="checkbox"
            onChange={(event) =>
              void updateAndSaveSettings({ enableContextMenuTranslation: event.target.checked })
            }
          />
          <span>启用右键菜单翻译标签</span>
        </label>

        <label className="tag-translation-check-row">
          <input
            checked={settings.translateOnTagCreate}
            type="checkbox"
            onChange={(event) =>
              void updateAndSaveSettings({ translateOnTagCreate: event.target.checked })
            }
          />
          <span>创建标签时尝试翻译</span>
        </label>
      </div>

      <footer className="tag-translation-footer">
        <span>{message}</span>
        <button type="button" onClick={() => void loadSettings()}>
          刷新
        </button>
        <ActionFeedbackButton label="保存" onAction={saveSettings} />
      </footer>
    </section>
  );
}
