import type Database from "better-sqlite3";
import { createPlaceholders, normalizeFileIds } from "./queryUtils.js";
import { getDefaultTagStyleId } from "./tagStylesRepository.js";
import { ensureTag, ensureTagNamespace } from "./tagsRepository.js";
import { normalizeTagPart } from "./tagText.js";

const FAVORITE_TAG_NAME = "收藏";

interface RatingTagEntry {
  id: number;
  label: string;
}

interface RatingTagGroup {
  id: number;
  name: string;
}

export function syncFavoriteTag(
  db: Database.Database,
  fileId: number,
  favorite: boolean,
): void {
  const fileIds = normalizeFileIds([fileId]);

  if (fileIds.length === 0) {
    return;
  }

  if (favorite) {
    addSystemTagToFiles(db, fileIds, "", FAVORITE_TAG_NAME);
  } else {
    removeSystemTagFromFiles(db, fileIds, "", FAVORITE_TAG_NAME);
  }
}

export function removeFavoriteTagsFromFiles(
  db: Database.Database,
  fileIds: number[],
): void {
  removeSystemTagFromFiles(db, normalizeFileIds(fileIds), "", FAVORITE_TAG_NAME);
}

export function syncRatingTagsForFiles(
  db: Database.Database,
  fileIds: number[],
  groupId: number,
  entryIds: number[],
): void {
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (
    normalizedFileIds.length === 0 ||
    !Number.isInteger(groupId) ||
    groupId <= 0
  ) {
    return;
  }

  const group = db
    .prepare("SELECT name FROM rating_groups WHERE id = ?")
    .get(groupId) as { name: string } | undefined;

  if (!group) {
    return;
  }

  const namespace = normalizeTagPart(group.name);

  if (!namespace) {
    return;
  }

  const entries = db
    .prepare("SELECT id, label FROM rating_entries WHERE group_id = ?")
    .all(groupId) as RatingTagEntry[];
  const selectedEntryIdSet = new Set(
    entryIds.filter((entryId) => Number.isInteger(entryId) && entryId > 0),
  );

  for (const entry of entries) {
    removeSystemTagFromFiles(db, normalizedFileIds, namespace, entry.label);

    if (selectedEntryIdSet.has(entry.id)) {
      addSystemTagToFiles(db, normalizedFileIds, namespace, entry.label);
    }
  }
}

export function syncRatingsFromTagsForFiles(
  db: Database.Database,
  fileIds: number[],
): void {
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  const groups = (db
    .prepare("SELECT id, name FROM rating_groups ORDER BY id ASC")
    .all() as RatingTagGroup[])
    .map((group) => ({
      ...group,
      namespace: normalizeTagPart(group.name),
    }))
    .filter((group) => group.namespace);

  if (groups.length === 0) {
    return;
  }

  const groupNamespaces = [...new Set(groups.map((group) => group.namespace))];
  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const namespacePlaceholders = createPlaceholders(groupNamespaces.length);
  const rows = db
    .prepare(
      `SELECT
        file_tags.file_id AS fileId,
        tags.namespace,
        tags.name
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       WHERE file_tags.file_id IN (${filePlaceholders})
         AND tags.namespace IN (${namespacePlaceholders})`,
    )
    .all(...normalizedFileIds, ...groupNamespaces) as Array<{
    fileId: number;
    namespace: string;
    name: string;
  }>;
  const labelsByFileAndNamespace = new Map<string, Set<string>>();

  for (const row of rows) {
    const label = normalizeTagPart(row.name);

    if (!label) {
      continue;
    }

    const key = createFileNamespaceKey(row.fileId, row.namespace);
    const labels = labelsByFileAndNamespace.get(key) ?? new Set<string>();
    labels.add(label);
    labelsByFileAndNamespace.set(key, labels);
  }

  const deleteGroupRatings = db.prepare(
    `DELETE FROM file_ratings
     WHERE file_id = ?
       AND entry_id IN (
         SELECT id FROM rating_entries WHERE group_id = ?
       )`,
  );
  const insertRating = db.prepare(
    "INSERT OR IGNORE INTO file_ratings (file_id, entry_id) VALUES (?, ?)",
  );

  for (const group of groups) {
    const entryIdsByLabel = readRatingEntryIdsByLabel(db, group.id);
    const allLabels = new Set<string>();

    for (const fileId of normalizedFileIds) {
      for (const label of labelsByFileAndNamespace.get(
        createFileNamespaceKey(fileId, group.namespace),
      ) ?? []) {
        allLabels.add(label);
      }
    }

    for (const label of allLabels) {
      if (!entryIdsByLabel.has(label)) {
        entryIdsByLabel.set(label, createRatingEntryForTag(db, group.id, label));
      }
    }

    for (const fileId of normalizedFileIds) {
      deleteGroupRatings.run(fileId, group.id);

      for (const label of labelsByFileAndNamespace.get(
        createFileNamespaceKey(fileId, group.namespace),
      ) ?? []) {
        const entryId = entryIdsByLabel.get(label);

        if (entryId) {
          insertRating.run(fileId, entryId);
        }
      }
    }
  }
}

export function removeRatingGroupTagsFromFiles(
  db: Database.Database,
  groupId: number,
  fileIds?: number[],
): void {
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return;
  }

  const group = db
    .prepare("SELECT name FROM rating_groups WHERE id = ?")
    .get(groupId) as { name: string } | undefined;

  if (!group) {
    return;
  }

  const namespace = normalizeTagPart(group.name);

  if (!namespace) {
    return;
  }

  const entries = db
    .prepare("SELECT label FROM rating_entries WHERE group_id = ?")
    .all(groupId) as Array<{ label: string }>;
  const normalizedFileIds = fileIds ? normalizeFileIds(fileIds) : [];

  for (const entry of entries) {
    removeSystemTagFromFiles(db, normalizedFileIds, namespace, entry.label);
  }
}

function addSystemTagToFiles(
  db: Database.Database,
  fileIds: number[],
  namespace: string,
  name: string,
): void {
  const normalizedTag = normalizeSystemTag(namespace, name);

  if (!normalizedTag) {
    return;
  }

  const styleId = getDefaultTagStyleId(db);
  const tagId = ensureTag(
    db,
    styleId,
    ensureTagNamespace(db, styleId, normalizedTag.namespace),
    normalizedTag,
  );
  const insertFileTag = db.prepare(
    "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
  );

  for (const fileId of fileIds) {
    insertFileTag.run(fileId, tagId);
  }
}

function removeSystemTagFromFiles(
  db: Database.Database,
  fileIds: number[],
  namespace: string,
  name: string,
): void {
  const normalizedTag = normalizeSystemTag(namespace, name);

  if (!normalizedTag) {
    return;
  }

  const tagId = readSystemTagId(
    db,
    normalizedTag.namespace,
    normalizedTag.name,
  );

  if (!tagId) {
    return;
  }

  if (fileIds.length === 0) {
    db.prepare("DELETE FROM file_tags WHERE tag_id = ?").run(tagId);
    return;
  }

  const placeholders = createPlaceholders(fileIds.length);
  db.prepare(
    `DELETE FROM file_tags
     WHERE tag_id = ?
       AND file_id IN (${placeholders})`,
  ).run(tagId, ...fileIds);
}

function readSystemTagId(
  db: Database.Database,
  namespace: string,
  name: string,
): number | null {
  const row = db
    .prepare("SELECT id FROM tags WHERE namespace = ? AND name = ? LIMIT 1")
    .get(namespace, name) as { id: number } | undefined;

  return row?.id ?? null;
}

function normalizeSystemTag(
  namespace: string,
  name: string,
): { namespace: string; name: string } | null {
  const normalizedName = normalizeTagPart(name);

  if (!normalizedName) {
    return null;
  }

  return {
    namespace: normalizeTagPart(namespace),
    name: normalizedName,
  };
}

function readRatingEntryIdsByLabel(
  db: Database.Database,
  groupId: number,
): Map<string, number> {
  const rows = db
    .prepare("SELECT id, label FROM rating_entries WHERE group_id = ?")
    .all(groupId) as RatingTagEntry[];
  const entryIdsByLabel = new Map<string, number>();

  for (const row of rows) {
    const label = normalizeTagPart(row.label);

    if (label && !entryIdsByLabel.has(label)) {
      entryIdsByLabel.set(label, row.id);
    }
  }

  return entryIdsByLabel;
}

function createRatingEntryForTag(
  db: Database.Database,
  groupId: number,
  label: string,
): number {
  const row = db
    .prepare(
      "SELECT coalesce(MAX(sort_order), 0) + 1 AS sortOrder FROM rating_entries WHERE group_id = ?",
    )
    .get(groupId) as { sortOrder: number } | undefined;
  const result = db
    .prepare(
      `INSERT INTO rating_entries (group_id, label, color, sort_order)
       VALUES (?, ?, ?, ?)`,
    )
    .run(groupId, label, "#d9dde1", row?.sortOrder ?? 1);

  return Number(result.lastInsertRowid);
}

function createFileNamespaceKey(fileId: number, namespace: string): string {
  return `${fileId}\u001f${namespace}`;
}
