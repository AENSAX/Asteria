import type Database from "better-sqlite3";

export function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function readSqlCount(
  db: Database.Database,
  query: string,
  ...params: unknown[]
): number {
  const row = db.prepare(query).get(...params) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function normalizeFileIds(fileIds: number[]): number[] {
  return normalizePositiveIntegerIds(fileIds);
}

export function normalizeTagIds(tagIds: number[]): number[] {
  return normalizePositiveIntegerIds(tagIds);
}

function normalizePositiveIntegerIds(values: number[]): number[] {
  const seen = new Set<number>();
  const normalizedIds: number[] = [];

  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalizedIds.push(value);
  }

  return normalizedIds;
}
