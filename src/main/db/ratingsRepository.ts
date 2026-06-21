import type Database from "better-sqlite3";
import type { RatingEntryRecord, RatingGroupRecord } from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import {
  removeRatingGroupTagsFromFiles,
  syncRatingTagsForFiles,
} from "./systemTagsRepository.js";

export function listRatingGroups(): RatingGroupRecord[] {
  const db = getDatabaseConnection();

  return db
    .prepare(
      `SELECT
        rating_groups.id,
        rating_groups.name,
        rating_groups.is_active AS isActive,
        COUNT(rating_entries.id) AS entryCount,
        rating_groups.created_at AS createdAt,
        rating_groups.updated_at AS updatedAt
       FROM rating_groups
       LEFT JOIN rating_entries ON rating_entries.group_id = rating_groups.id
       GROUP BY rating_groups.id
       ORDER BY rating_groups.id ASC`,
    )
    .all() as RatingGroupRecord[];
}

export function createRatingGroup(name: string): RatingGroupRecord[] {
  const db = getDatabaseConnection();
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("分级名称不能为空");
  }

  db.prepare("INSERT INTO rating_groups (name) VALUES (?)").run(normalizedName);
  return listRatingGroups();
}

export function renameRatingGroup(
  groupId: number,
  name: string,
): RatingGroupRecord[] {
  const db = getDatabaseConnection();
  const normalizedName = name.trim();

  if (!Number.isInteger(groupId) || groupId <= 0 || !normalizedName) {
    throw new Error("分级无效");
  }

  db.prepare(
    `UPDATE rating_groups
     SET name = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(normalizedName, groupId);

  return listRatingGroups();
}

export function setRatingGroupActive(
  groupId: number,
  active: boolean,
): RatingGroupRecord[] {
  const db = getDatabaseConnection();

  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error("分级无效");
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE rating_groups
       SET is_active = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(active ? 1 : 0, groupId);

    if (active) {
      ensureDefaultRatingsForAllFiles(db, [groupId]);
    } else {
      removeRatingGroupTagsFromFiles(db, groupId);
    }
  })();

  return listRatingGroups();
}

export function deleteRatingGroup(groupId: number): RatingGroupRecord[] {
  const db = getDatabaseConnection();

  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error("分级无效");
  }

  db.prepare("DELETE FROM rating_groups WHERE id = ?").run(groupId);
  return listRatingGroups();
}

export function listRatingEntries(groupId: number): RatingEntryRecord[] {
  const db = getDatabaseConnection();

  if (!Number.isInteger(groupId) || groupId <= 0) {
    return [];
  }

  return db
    .prepare(
      `SELECT
        id,
        group_id AS groupId,
        label,
        color,
        sort_order AS sortOrder,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM rating_entries
       WHERE group_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(groupId) as RatingEntryRecord[];
}

export function createRatingEntry(
  groupId: number,
  label: string,
  color: string,
): RatingEntryRecord[] {
  const db = getDatabaseConnection();
  const normalizedLabel = label.trim();
  const normalizedColor = normalizeRatingColor(color);

  if (!Number.isInteger(groupId) || groupId <= 0 || !normalizedLabel) {
    throw new Error("分级条目无效");
  }

  const row = db
    .prepare(
      "SELECT coalesce(MAX(sort_order), 0) + 1 AS sortOrder FROM rating_entries WHERE group_id = ?",
    )
    .get(groupId) as { sortOrder: number } | undefined;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO rating_entries (group_id, label, color, sort_order)
       VALUES (?, ?, ?, ?)`,
    ).run(groupId, normalizedLabel, normalizedColor, row?.sortOrder ?? 1);
    ensureDefaultRatingsForAllFiles(db, [groupId]);
  })();

  return listRatingEntries(groupId);
}

export function updateRatingEntry(
  entryId: number,
  label: string,
  color: string,
): RatingEntryRecord[] {
  const db = getDatabaseConnection();
  const normalizedLabel = label.trim();
  const normalizedColor = normalizeRatingColor(color);

  if (!Number.isInteger(entryId) || entryId <= 0 || !normalizedLabel) {
    throw new Error("分级条目无效");
  }

  const row = db
    .prepare("SELECT group_id AS groupId FROM rating_entries WHERE id = ?")
    .get(entryId) as { groupId: number } | undefined;

  if (!row) {
    throw new Error("分级条目不存在");
  }

  db.prepare(
    `UPDATE rating_entries
     SET label = ?,
         color = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(normalizedLabel, normalizedColor, entryId);

  return listRatingEntries(row.groupId);
}

export function deleteRatingEntry(entryId: number): RatingEntryRecord[] {
  const db = getDatabaseConnection();

  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new Error("分级条目无效");
  }

  const row = db
    .prepare("SELECT group_id AS groupId FROM rating_entries WHERE id = ?")
    .get(entryId) as { groupId: number } | undefined;

  if (!row) {
    return [];
  }

  db.transaction(() => {
    db.prepare("DELETE FROM rating_entries WHERE id = ?").run(entryId);
    ensureDefaultRatingsForAllFiles(db, [row.groupId]);
  })();
  return listRatingEntries(row.groupId);
}

export function reorderRatingEntries(
  groupId: number,
  entryIds: number[],
): RatingEntryRecord[] {
  const db = getDatabaseConnection();
  const normalizedEntryIds = normalizePositiveIds(entryIds);

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0 ||
    normalizedEntryIds.length === 0
  ) {
    return listRatingEntries(groupId);
  }

  const placeholders = createPlaceholders(normalizedEntryIds.length);
  const validRows = db
    .prepare(
      `SELECT id FROM rating_entries WHERE group_id = ? AND id IN (${placeholders})`,
    )
    .all(groupId, ...normalizedEntryIds) as Array<{ id: number }>;
  const validIds = new Set(validRows.map((row) => row.id));

  db.transaction(() => {
    let sortOrder = 1;

    for (const entryId of normalizedEntryIds) {
      if (!validIds.has(entryId)) {
        continue;
      }

      db.prepare(
        `UPDATE rating_entries
         SET sort_order = ?,
             updated_at = datetime('now')
         WHERE id = ? AND group_id = ?`,
      ).run(sortOrder, entryId, groupId);
      sortOrder += 1;
    }
  })();

  return listRatingEntries(groupId);
}

export function setFileRatingEntries(
  fileIds: number[],
  groupId: number,
  entryIds: number[],
): void {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedEntryIds = normalizePositiveIds(entryIds);

  if (
    normalizedFileIds.length === 0 ||
    !Number.isInteger(groupId) ||
    groupId <= 0
  ) {
    return;
  }

  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const entryPlaceholders =
    normalizedEntryIds.length > 0
      ? createPlaceholders(normalizedEntryIds.length)
      : "";
  const validEntryRows =
    normalizedEntryIds.length > 0
      ? (db
          .prepare(
            `SELECT id FROM rating_entries WHERE group_id = ? AND id IN (${entryPlaceholders})`,
          )
          .all(groupId, ...normalizedEntryIds) as Array<{ id: number }>)
      : [];
  const validEntryIds = validEntryRows.map((row) => row.id);

  db.transaction(() => {
    db.prepare(
      `DELETE FROM file_ratings
       WHERE file_id IN (${filePlaceholders})
         AND entry_id IN (SELECT id FROM rating_entries WHERE group_id = ?)`,
    ).run(...normalizedFileIds, groupId);

    for (const fileId of normalizedFileIds) {
      for (const entryId of validEntryIds) {
        db.prepare(
          "INSERT OR IGNORE INTO file_ratings (file_id, entry_id) VALUES (?, ?)",
        ).run(fileId, entryId);
      }
    }

    syncRatingTagsForFiles(db, normalizedFileIds, groupId, validEntryIds);
  })();
}

export function ensureDefaultRatingsForFiles(fileIds: number[]): void {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  db.transaction(() => {
    ensureDefaultRatingsForFilesInDb(db, normalizedFileIds);
  })();
}

export function ensureDefaultRatingsForFilesInDb(
  db: Database.Database,
  fileIds: number[],
): void {
  ensureDefaultRatingsForFileIds(db, fileIds);
}

function ensureDefaultRatingsForAllFiles(
  db: Database.Database,
  groupIds?: number[],
): void {
  const rows = db
    .prepare("SELECT id FROM files WHERE deleted_at IS NULL")
    .all() as Array<{ id: number }>;

  ensureDefaultRatingsForFileIds(
    db,
    rows.map((row) => row.id),
    groupIds,
  );
}

function ensureDefaultRatingsForFileIds(
  db: Database.Database,
  fileIds: number[],
  groupIds?: number[],
): void {
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  const activeGroups = readActiveRatingGroupsWithFirstEntry(db, groupIds);
  const insertRating = db.prepare(
    "INSERT OR IGNORE INTO file_ratings (file_id, entry_id) VALUES (?, ?)",
  );

  for (const group of activeGroups) {
    const missingFileIds = filterFilesMissingRatingGroup(
      db,
      normalizedFileIds,
      group.groupId,
    );

    if (missingFileIds.length === 0) {
      continue;
    }

    for (const fileId of missingFileIds) {
      insertRating.run(fileId, group.entryId);
    }

    syncRatingTagsForFiles(db, missingFileIds, group.groupId, [group.entryId]);
  }
}

function readActiveRatingGroupsWithFirstEntry(
  db: Database.Database,
  groupIds?: number[],
): Array<{ groupId: number; entryId: number }> {
  const normalizedGroupIds = groupIds ? normalizePositiveIds(groupIds) : [];
  const groupFilter =
    normalizedGroupIds.length > 0
      ? `AND rating_groups.id IN (${createPlaceholders(normalizedGroupIds.length)})`
      : "";

  return db
    .prepare(
      `SELECT
        rating_groups.id AS groupId,
        rating_entries.id AS entryId
       FROM rating_groups
       JOIN rating_entries ON rating_entries.group_id = rating_groups.id
       WHERE rating_groups.is_active = 1
         ${groupFilter}
         AND rating_entries.id = (
           SELECT first_entries.id
           FROM rating_entries AS first_entries
           WHERE first_entries.group_id = rating_groups.id
           ORDER BY first_entries.sort_order ASC, first_entries.id ASC
           LIMIT 1
         )
       ORDER BY rating_groups.id ASC`,
    )
    .all(...normalizedGroupIds) as Array<{ groupId: number; entryId: number }>;
}

function filterFilesMissingRatingGroup(
  db: Database.Database,
  fileIds: number[],
  groupId: number,
): number[] {
  if (fileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(fileIds.length);
  const rows = db
    .prepare(
      `SELECT file_id AS fileId
       FROM file_ratings
       JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
       WHERE file_ratings.file_id IN (${placeholders})
         AND rating_entries.group_id = ?`,
    )
    .all(...fileIds, groupId) as Array<{ fileId: number }>;
  const existingFileIds = new Set(rows.map((row) => row.fileId));

  return fileIds.filter((fileId) => !existingFileIds.has(fileId));
}

function normalizeFileIds(fileIds: number[]): number[] {
  const seen = new Set<number>();
  const normalizedFileIds: number[] = [];

  for (const fileId of fileIds) {
    if (!Number.isInteger(fileId) || fileId <= 0 || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    normalizedFileIds.push(fileId);
  }

  return normalizedFileIds;
}

function normalizePositiveIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const normalizedIds: number[] = [];

  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalizedIds.push(id);
  }

  return normalizedIds;
}

function normalizeRatingColor(color: string): string {
  const normalizedColor = color.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalizedColor)) {
    return normalizedColor;
  }

  return "#d9dde1";
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
