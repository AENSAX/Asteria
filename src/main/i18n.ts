import type { BrowserWindow } from "electron";
import { enUSTranslations } from "../shared/locales/enUS.js";
import {
  zhCNTranslations,
  type TranslationKey,
} from "../shared/locales/zhCN.js";

export type MainLanguageId = "zh-CN" | "en-US";
export type MainTranslationValues = Record<string, string | number>;

const LANGUAGE_SETTINGS_KEY = "asteria.language-settings.v1";



export type MainTranslationKey = TranslationKey;

const translationTables: Record<
  MainLanguageId,
  Record<MainTranslationKey, string>
> = {
  "zh-CN": zhCNTranslations,
  "en-US": enUSTranslations,
};

export function mainT(
  languageId: MainLanguageId,
  key: MainTranslationKey,
  values?: MainTranslationValues,
): string {
  const template =
    translationTables[languageId][key] ?? translationTables["zh-CN"][key];

  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] === undefined ? match : String(values[name]),
  );
}

export async function readWindowLanguageId(
  window?: BrowserWindow | null,
): Promise<MainLanguageId> {
  if (!window || window.isDestroyed()) {
    return "zh-CN";
  }

  try {
    const rawSettings = (await window.webContents.executeJavaScript(
      `window.localStorage.getItem(${JSON.stringify(LANGUAGE_SETTINGS_KEY)})`,
      true,
    )) as string | null;

    if (!rawSettings) {
      return "zh-CN";
    }

    const settings = JSON.parse(rawSettings) as { languageId?: unknown };
    return normalizeMainLanguageId(settings.languageId);
  } catch {
    return "zh-CN";
  }
}

export function normalizeMainLanguageId(value: unknown): MainLanguageId {
  return value === "en-US" ? "en-US" : "zh-CN";
}
