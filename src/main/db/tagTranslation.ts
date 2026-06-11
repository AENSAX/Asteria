import { readFileSync, statSync } from "node:fs";
import type { TagDraft, TagTranslationSettings } from "../../shared/ipc.js";
import { getTagTranslationSettings } from "./settingsRepository.js";
import { normalizeTagPart, normalizeTagTranslationKey } from "./tagText.js";

let translationCache: {
  path: string;
  modifiedMs: number;
  map: Map<string, string>;
} | null = null;

export function normalizeTagDrafts(tags: TagDraft[]): TagDraft[] {
  const seen = new Set<string>();
  const normalizedTags: TagDraft[] = [];

  for (const tag of tags) {
    const id =
      Number.isInteger(tag.id) && Number(tag.id) > 0
        ? Number(tag.id)
        : undefined;
    const namespace = normalizeTagPart(tag.namespace);
    const name = normalizeTagPart(tag.name);

    if (!name) {
      continue;
    }

    const key = id ? `id:${id}` : `${namespace}:${name}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedTags.push(
      id === undefined ? { namespace, name } : { id, namespace, name },
    );
  }

  return normalizedTags;
}

export function expandTagDraftsWithTranslation(tags: TagDraft[]): TagDraft[] {
  const settings = getTagTranslationSettings();

  if (!settings.translateOnTagCreate) {
    return tags;
  }

  const translationMap = readTranslationMap(settings);

  if (translationMap.size === 0) {
    return tags;
  }

  const expandedTags: TagDraft[] = [];

  for (const tag of tags) {
    if (tag.id) {
      expandedTags.push(tag);
      continue;
    }

    const translatedName = readTranslatedTagName(tag.name, translationMap);

    if (!translatedName) {
      expandedTags.push(tag);
      continue;
    }

    expandedTags.push({
      namespace: tag.namespace,
      name: translatedName,
    });
  }

  return normalizeTagDrafts(expandedTags);
}

export function readTranslationMap(
  settings: TagTranslationSettings,
): Map<string, string> {
  const csvPath = settings.csvPath.trim();

  if (!csvPath) {
    return new Map();
  }

  try {
    const csvStat = statSync(csvPath);

    if (!csvStat.isFile()) {
      return new Map();
    }

    if (
      translationCache &&
      translationCache.path === csvPath &&
      translationCache.modifiedMs === csvStat.mtimeMs
    ) {
      return translationCache.map;
    }

    const nextMap = parseTranslationCsv(readFileSync(csvPath, "utf8"));
    translationCache = {
      path: csvPath,
      modifiedMs: csvStat.mtimeMs,
      map: nextMap,
    };
    return nextMap;
  } catch {
    return new Map();
  }
}

export function readTranslatedTagName(
  name: string,
  translationMap: Map<string, string>,
): string | null {
  const normalizedName = normalizeTagTranslationKey(name);
  const translation = translationMap.get(normalizedName);

  if (!translation) {
    return null;
  }

  return normalizeTagPart(`${name} ${translation}`);
}

function parseTranslationCsv(text: string): Map<string, string> {
  const rows = parseCsvRows(text);
  const translationMap = new Map<string, string>();

  for (const row of rows) {
    const source = normalizeTagTranslationKey(row[0] ?? "");
    const translation = (row[2] ?? "").trim();

    if (!source || !translation) {
      continue;
    }

    translationMap.set(source, translation);
  }

  return translationMap;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cellValue) => cellValue.trim()));
}
