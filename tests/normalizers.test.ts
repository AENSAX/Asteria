import { describe, expect, it } from "vitest";
import {
  defaultAiSettings,
  normalizeAiSettings,
  normalizeAiThreshold,
  normalizeProxyHost,
} from "../src/main/settings/normalizers.js";

describe("normalizeAiSettings", () => {
  it("returns defaults for invalid input", () => {
    expect(normalizeAiSettings(null)).toEqual(defaultAiSettings);
    expect(normalizeAiSettings("nonsense")).toEqual(defaultAiSettings);
  });

  it("trims string fields and keeps valid values", () => {
    const settings = normalizeAiSettings({
      modelPath: "  C:/models  ",
      modelName: " wd-v3 ",
      generalThreshold: 0.5,
      autoTagUntaggedImagesOnImport: true,
    });

    expect(settings.modelPath).toBe("C:/models");
    expect(settings.modelName).toBe("wd-v3");
    expect(settings.generalThreshold).toBe(0.5);
    expect(settings.autoTagUntaggedImagesOnImport).toBe(true);
    expect(settings.characterThreshold).toBe(
      defaultAiSettings.characterThreshold,
    );
  });
});

describe("normalizeAiThreshold", () => {
  it("falls back for out-of-range or non-numeric values", () => {
    expect(normalizeAiThreshold(undefined, 0.35)).toBe(0.35);
    expect(normalizeAiThreshold("0.5", 0.35)).toBe(0.35);
    expect(normalizeAiThreshold(Number.NaN, 0.35)).toBe(0.35);
  });
});

describe("normalizeProxyHost", () => {
  it("strips protocol prefixes and trailing slashes", () => {
    expect(normalizeProxyHost(" http://127.0.0.1/ ")).toBe("127.0.0.1");
    expect(normalizeProxyHost("https://proxy.local//")).toBe("proxy.local");
    expect(normalizeProxyHost("proxy.local")).toBe("proxy.local");
  });
});
