import { useMemo, useSyncExternalStore } from "react";
import { enUSTranslations } from "../../../shared/locales/enUS";
import {
  zhCNTranslations,
  type TranslationKey,
} from "../../../shared/locales/zhCN";
import type { FileDomain } from "../../../shared/ipc";

export type LanguageId = "zh-CN" | "en-US";

interface LanguageDefinition {
  id: LanguageId;
  name: string;
  htmlLang: string;
  direction: "ltr" | "rtl";
}

export interface LanguageSettings {
  languageId: LanguageId;
}

export type TranslationValues = Record<string, string | number>;
export type TranslationFunction = (
  key: TranslationKey,
  values?: TranslationValues,
) => string;

const LANGUAGE_SETTINGS_KEY = "asteria.language-settings.v1";
const LANGUAGE_SETTINGS_EVENT = "asteria:language-settings-changed";
const LANGUAGE_SETTINGS_CHANNEL = "asteria-language-settings";


export type { TranslationKey };


const translationTables: Record<LanguageId, Record<TranslationKey, string>> = {
  "zh-CN": zhCNTranslations,
  "en-US": enUSTranslations,
};

let currentLanguageId: LanguageId = "zh-CN";

export const languageDefinitions: LanguageDefinition[] = [
  {
    id: "zh-CN",
    name: "简体中文",
    htmlLang: "zh-CN",
    direction: "ltr",
  },
  {
    id: "en-US",
    name: "English",
    htmlLang: "en-US",
    direction: "ltr",
  },
];

export const languageOptions = languageDefinitions.map((language) => ({
  id: language.id,
  name: language.name,
}));

export function loadLanguageSettings(): LanguageSettings {
  const rawSettings = window.localStorage.getItem(LANGUAGE_SETTINGS_KEY);

  if (!rawSettings) {
    const settings = createDefaultLanguageSettings();
    currentLanguageId = settings.languageId;
    return settings;
  }

  try {
    const settings = normalizeLanguageSettings(JSON.parse(rawSettings));
    currentLanguageId = settings.languageId;
    return settings;
  } catch {
    const settings = createDefaultLanguageSettings();
    currentLanguageId = settings.languageId;
    return settings;
  }
}

export function saveLanguageSettings(
  settings: LanguageSettings,
): LanguageSettings {
  const normalizedSettings = normalizeLanguageSettings(settings);
  window.localStorage.setItem(
    LANGUAGE_SETTINGS_KEY,
    JSON.stringify(normalizedSettings),
  );
  applyLanguage(normalizedSettings.languageId);
  window.dispatchEvent(new CustomEvent(LANGUAGE_SETTINGS_EVENT));

  try {
    const channel = new BroadcastChannel(LANGUAGE_SETTINGS_CHANNEL);
    channel.postMessage(normalizedSettings);
    channel.close();
  } catch {
    // BroadcastChannel is best-effort; storage still persists the setting.
  }

  return normalizedSettings;
}

export function listenLanguageSettingsChanged(
  listener: (settings: LanguageSettings) => void,
): () => void {
  const handleChange = (): void => {
    listener(loadLanguageSettings());
  };

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === LANGUAGE_SETTINGS_KEY) {
      handleChange();
    }
  };

  window.addEventListener(LANGUAGE_SETTINGS_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(LANGUAGE_SETTINGS_CHANNEL);
    channel.addEventListener("message", handleChange);
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener(LANGUAGE_SETTINGS_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
    channel?.removeEventListener("message", handleChange);
    channel?.close();
  };
}

export function applySavedLanguage(): void {
  applyLanguage(loadLanguageSettings().languageId);
}

export function applyLanguage(languageId: LanguageId): void {
  const language = getLanguageDefinition(languageId);
  const root = document.documentElement;

  currentLanguageId = language.id;
  root.lang = language.htmlLang;
  root.dir = language.direction;
  root.dataset.language = language.id;
}

export function translate(
  key: TranslationKey,
  values?: TranslationValues,
): string {
  return translateWithLanguage(currentLanguageId, key, values);
}

export function createTranslator(languageId: LanguageId): TranslationFunction {
  return (key, values) => translateWithLanguage(languageId, key, values);
}

export function getFileDomainDisplayName(
  domain: FileDomain,
  t: TranslationFunction,
): string {
  if (domain === "library") {
    return t("app.domain.library");
  }

  if (domain === "trash") {
    return t("app.domain.trash");
  }

  return t("app.domain.pending");
}

export function useLanguage(): {
  languageId: LanguageId;
  t: TranslationFunction;
} {
  const languageId = useSyncExternalStore(
    subscribeLanguageSettings,
    getLanguageSnapshot,
    getLanguageSnapshot,
  );
  const t = useMemo(() => createTranslator(languageId), [languageId]);

  return { languageId, t };
}

function createDefaultLanguageSettings(): LanguageSettings {
  return {
    languageId: "zh-CN",
  };
}

function normalizeLanguageSettings(value: unknown): LanguageSettings {
  const settings = value as Partial<LanguageSettings> | null;
  const languageId = isLanguageId(settings?.languageId)
    ? settings.languageId
    : "zh-CN";

  return { languageId };
}

function isLanguageId(value: unknown): value is LanguageId {
  return languageDefinitions.some((language) => language.id === value);
}

function getLanguageDefinition(languageId: LanguageId): LanguageDefinition {
  return (
    languageDefinitions.find((language) => language.id === languageId) ??
    languageDefinitions[0]!
  );
}

function subscribeLanguageSettings(onStoreChange: () => void): () => void {
  return listenLanguageSettingsChanged(() => onStoreChange());
}

function getLanguageSnapshot(): LanguageId {
  return loadLanguageSettings().languageId;
}

function translateWithLanguage(
  languageId: LanguageId,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  const template =
    translationTables[languageId]?.[key] ?? translationTables["zh-CN"][key];

  return formatTranslation(template, values);
}

function formatTranslation(
  template: string,
  values?: TranslationValues,
): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] === undefined ? match : String(values[name]),
  );
}
