export function normalizeTagSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeTagTranslationKey(value: string): string {
  return normalizeTagPart(value.replace(/[\s_]+/g, " "));
}

export function normalizeTagPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
