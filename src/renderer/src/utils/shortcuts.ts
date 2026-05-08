export type ShortcutAction =
  | 'close-window'
  | 'select-all'
  | 'detail-previous-file'
  | 'detail-next-file'
  | 'browser-previous-page'
  | 'browser-next-page';

export interface ShortcutDefinition {
  action: ShortcutAction;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface ShortcutActionConfig {
  action: ShortcutAction;
  label: string;
  description: string;
  defaults: ShortcutDefinition[];
}

export type ShortcutSettings = Record<ShortcutAction, ShortcutDefinition[]>;

const SHORTCUT_STORAGE_KEY = 'asteria.shortcut-settings.v1';
const shortcutRecordingState = window as Window & {
  __asteriaRecordingShortcut?: boolean;
};

export const shortcutActionConfigs: ShortcutActionConfig[] = [
  {
    action: 'close-window',
    label: '关闭当前窗口',
    description: '主窗口除外',
    defaults: [{ action: 'close-window', key: 'Escape' }]
  },
  {
    action: 'select-all',
    label: '全选当前条目',
    description: '只作用于当前可多选区域',
    defaults: [{ action: 'select-all', key: 'a', ctrl: true }]
  },
  {
    action: 'detail-previous-file',
    label: '详情上一文件',
    description: '文件详情窗口',
    defaults: [{ action: 'detail-previous-file', key: 'ArrowLeft' }]
  },
  {
    action: 'detail-next-file',
    label: '详情下一文件',
    description: '文件详情窗口',
    defaults: [{ action: 'detail-next-file', key: 'ArrowRight' }]
  },
  {
    action: 'browser-previous-page',
    label: '浏览上一页',
    description: '浏览 view',
    defaults: [
      { action: 'browser-previous-page', key: 'ArrowLeft' },
      { action: 'browser-previous-page', key: 'PageUp' }
    ]
  },
  {
    action: 'browser-next-page',
    label: '浏览下一页',
    description: '浏览 view',
    defaults: [
      { action: 'browser-next-page', key: 'ArrowRight' },
      { action: 'browser-next-page', key: 'PageDown' }
    ]
  }
];

export function loadShortcutSettings(): ShortcutSettings {
  const settings = createDefaultShortcutSettings();
  const rawSettings = window.localStorage.getItem(SHORTCUT_STORAGE_KEY);

  if (!rawSettings) {
    return settings;
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<Record<ShortcutAction, unknown>>;

    for (const config of shortcutActionConfigs) {
      const definitions = normalizeShortcutDefinitions(config.action, parsed[config.action]);

      if (definitions.length > 0) {
        settings[config.action] = definitions;
      }
    }
  } catch {
    return settings;
  }

  return settings;
}

export function saveShortcutSettings(settings: ShortcutSettings): void {
  window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('asteria:shortcut-settings-changed'));
}

export function resetShortcutSettings(): ShortcutSettings {
  window.localStorage.removeItem(SHORTCUT_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('asteria:shortcut-settings-changed'));
  return createDefaultShortcutSettings();
}

export function createDefaultShortcutSettings(): ShortcutSettings {
  return Object.fromEntries(
    shortcutActionConfigs.map((config) => [
      config.action,
      config.defaults.map((definition) => ({ ...definition }))
    ])
  ) as ShortcutSettings;
}

export function getShortcutDefinitions(action: ShortcutAction): ShortcutDefinition[] {
  return loadShortcutSettings()[action] ?? [];
}

export function setShortcutRecordingActive(active: boolean): void {
  shortcutRecordingState.__asteriaRecordingShortcut = active;
}

export function isShortcutRecordingActive(): boolean {
  return shortcutRecordingState.__asteriaRecordingShortcut === true;
}

export function formatShortcutDefinition(definition: ShortcutDefinition): string {
  return [
    definition.ctrl ? 'Ctrl' : '',
    definition.shift ? 'Shift' : '',
    definition.alt ? 'Alt' : '',
    definition.meta ? 'Meta' : '',
    formatShortcutKey(definition.key)
  ]
    .filter(Boolean)
    .join('+');
}

export function createShortcutDefinitionFromKeyboardEvent(
  action: ShortcutAction,
  event: KeyboardEvent
): ShortcutDefinition | null {
  if (isModifierKey(event.key)) {
    return null;
  }

  return {
    action,
    key: normalizeShortcutKey(event.key),
    ctrl: event.key === 'Control' ? false : event.ctrlKey,
    shift: event.key === 'Shift' ? false : event.shiftKey,
    alt: event.key === 'Alt' ? false : event.altKey,
    meta: event.key === 'Meta' ? false : event.metaKey
  };
}

export function matchesShortcutDefinition(shortcut: ShortcutDefinition, event: KeyboardEvent): boolean {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shortcutKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

  return (
    eventKey === shortcutKey &&
    (shortcutKey === 'Control' || event.ctrlKey === Boolean(shortcut.ctrl)) &&
    (shortcutKey === 'Shift' || event.shiftKey === Boolean(shortcut.shift)) &&
    (shortcutKey === 'Alt' || event.altKey === Boolean(shortcut.alt)) &&
    (shortcutKey === 'Meta' || event.metaKey === Boolean(shortcut.meta))
  );
}

export function matchesShortcutKeyRelease(shortcut: ShortcutDefinition, event: KeyboardEvent): boolean {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shortcutKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

  return eventKey === shortcutKey;
}

function formatShortcutKey(key: string): string {
  return key === ' ' ? 'Space' : key;
}

function isModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta';
}

function normalizeShortcutKey(key: string): string {
  const aliases: Record<string, string> = {
    esc: 'Escape',
    escape: 'Escape',
    left: 'ArrowLeft',
    arrowleft: 'ArrowLeft',
    right: 'ArrowRight',
    arrowright: 'ArrowRight',
    up: 'ArrowUp',
    arrowup: 'ArrowUp',
    down: 'ArrowDown',
    arrowdown: 'ArrowDown',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    alt: 'Alt',
    control: 'Control',
    ctrl: 'Control',
    shift: 'Shift',
    meta: 'Meta',
    command: 'Meta',
    space: ' ',
    enter: 'Enter',
    tab: 'Tab',
    delete: 'Delete',
    backspace: 'Backspace'
  };
  const trimmed = key.trim();

  if (!trimmed) {
    return '';
  }

  return aliases[trimmed.toLowerCase()] ?? (trimmed.length === 1 ? trimmed.toLowerCase() : trimmed);
}

function normalizeShortcutDefinitions(action: ShortcutAction, value: unknown): ShortcutDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((definition) => normalizeShortcutDefinition(action, definition))
    .filter((definition): definition is ShortcutDefinition => definition !== null);
}

function normalizeShortcutDefinition(action: ShortcutAction, value: unknown): ShortcutDefinition | null {
  const definition = value as Partial<ShortcutDefinition> | null;

  if (!definition || typeof definition.key !== 'string' || definition.key.length === 0) {
    return null;
  }

  return {
    action,
    key: definition.key,
    ctrl: definition.ctrl === true,
    shift: definition.shift === true,
    alt: definition.alt === true,
    meta: definition.meta === true
  };
}
