import { describe, expect, it } from "vitest";
import { enUSTranslations } from "../src/shared/locales/enUS.js";
import { zhCNTranslations } from "../src/shared/locales/zhCN.js";

const zhKeys = Object.keys(zhCNTranslations).sort();
const enKeys = Object.keys(enUSTranslations).sort();

function extractPlaceholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

describe("shared locales", () => {
  it("has identical key sets in zh-CN and en-US", () => {
    expect(enKeys).toEqual(zhKeys);
  });

  it("uses the same placeholders in both languages", () => {
    const zh = zhCNTranslations as Record<string, string>;
    const en = enUSTranslations as Record<string, string>;
    const mismatches: string[] = [];

    for (const key of zhKeys) {
      const enTemplate = en[key];

      if (enTemplate === undefined) {
        continue; // covered by the key-set assertion
      }

      const zhPlaceholders = extractPlaceholders(zh[key]!);
      const enPlaceholders = extractPlaceholders(enTemplate);

      if (JSON.stringify(zhPlaceholders) !== JSON.stringify(enPlaceholders)) {
        mismatches.push(
          `${key}: zh=[${zhPlaceholders.join(",")}] en=[${enPlaceholders.join(",")}]`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("has no empty translations", () => {
    for (const value of Object.values(zhCNTranslations)) {
      expect(value).not.toBe("");
    }

    for (const value of Object.values(enUSTranslations)) {
      expect(value).not.toBe("");
    }
  });
});
