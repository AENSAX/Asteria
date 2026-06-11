import type Database from "better-sqlite3";
import type {
  TagParentRecord,
  TagRecord,
  TagRelationTree,
  TagSiblingRecord,
} from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import { createPlaceholders, normalizeTagIds } from "./queryUtils.js";
import {
  createTagParentRecordQuery,
  createTagSiblingRecordQuery,
} from "./sqlFragments.js";
import { readTagId } from "./tagsRepository.js";

export function listTagParents(): TagParentRecord[] {
  const db = getDatabaseConnection();
  return readTagParentRecords(db);
}

export function listTagSiblings(): TagSiblingRecord[] {
  const db = getDatabaseConnection();
  return readTagSiblingRecords(db);
}

export function getTagRelationTree(
  tagIds: number[],
  kind: "parent" | "sibling" = "parent",
): TagRelationTree {
  const db = getDatabaseConnection();
  const normalizedTagIds = normalizeExistingTagIds(db, tagIds);

  if (normalizedTagIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  return readTagRelationTree(
    db,
    normalizedTagIds,
    kind === "sibling"
      ? {
          tableName: "tag_siblings",
          childColumn: "alias_tag_id",
          parentColumn: "canonical_tag_id",
        }
      : {
          tableName: "tag_parents",
          childColumn: "child_tag_id",
          parentColumn: "parent_tag_id",
        },
  );
}

export function addTagParent(
  childTagId: number,
  parentTagId: number,
): TagParentRecord {
  const db = getDatabaseConnection();

  return db.transaction(() => {
    const childId = readTagId(db, childTagId);
    const parentId = readTagId(db, parentTagId);

    if (childId === parentId) {
      throw new Error("标签不能成为自己的父级");
    }

    const existing = db
      .prepare(
        "SELECT 1 FROM tag_parents WHERE child_tag_id = ? AND parent_tag_id = ?",
      )
      .get(childId, parentId) as { 1: number } | undefined;

    if (existing) {
      throw new Error("标签父子级关系已存在");
    }

    if (wouldCreateTagParentCycle(db, childId, parentId)) {
      throw new Error("标签父子级关系不能形成循环");
    }

    db.prepare(
      "INSERT INTO tag_parents (child_tag_id, parent_tag_id) VALUES (?, ?)",
    ).run(childId, parentId);

    const record = readTagParentRecord(db, childId, parentId);

    if (!record) {
      throw new Error("标签父子级关系创建失败");
    }

    return record;
  })();
}

export function removeTagParent(childTagId: number, parentTagId: number): void {
  const db = getDatabaseConnection();
  const childId = readTagId(db, childTagId);
  const parentId = readTagId(db, parentTagId);

  db.prepare(
    "DELETE FROM tag_parents WHERE child_tag_id = ? AND parent_tag_id = ?",
  ).run(childId, parentId);
}

export function addTagSibling(
  aliasTagId: number,
  canonicalTagId: number,
): TagSiblingRecord {
  const db = getDatabaseConnection();

  return db.transaction(() => {
    const aliasId = readTagId(db, aliasTagId);
    const canonicalId = readTagId(db, canonicalTagId);

    if (aliasId === canonicalId) {
      throw new Error("别名标签不能指向自己");
    }

    const aliasIsCanonical = db
      .prepare("SELECT 1 FROM tag_siblings WHERE canonical_tag_id = ?")
      .get(aliasId) as { 1: number } | undefined;

    if (aliasIsCanonical) {
      throw new Error("别名标签不能同时作为标准标签");
    }

    const canonicalIsAlias = db
      .prepare("SELECT 1 FROM tag_siblings WHERE alias_tag_id = ?")
      .get(canonicalId) as { 1: number } | undefined;

    if (canonicalIsAlias) {
      throw new Error("标准标签不能同时作为别名标签");
    }

    db.prepare(
      `INSERT INTO tag_siblings (alias_tag_id, canonical_tag_id)
       VALUES (?, ?)
       ON CONFLICT(alias_tag_id) DO UPDATE SET
         canonical_tag_id = excluded.canonical_tag_id,
         created_at = datetime('now')`,
    ).run(aliasId, canonicalId);

    const record = readTagSiblingRecord(db, aliasId);

    if (!record) {
      throw new Error("标签别名关系创建失败");
    }

    return record;
  })();
}

export function removeTagSibling(aliasTagId: number): void {
  const db = getDatabaseConnection();
  const aliasId = readTagId(db, aliasTagId);

  db.prepare("DELETE FROM tag_siblings WHERE alias_tag_id = ?").run(aliasId);
}

export function getDirectParentTagIds(tagId: number): number[] {
  const db = getDatabaseConnection();
  const normalizedTagId = readTagId(db, tagId);

  return readDirectParentTagIds(db, normalizedTagId);
}

export function resolveParentTagIds(tagIds: number[]): number[] {
  const db = getDatabaseConnection();
  const normalizedTagIds = normalizeExistingTagIds(db, tagIds);

  return resolveParentTagIdsFromDb(db, normalizedTagIds);
}

export function resolveEffectiveTagIds(tagIds: number[]): number[] {
  const db = getDatabaseConnection();
  const normalizedTagIds = normalizeExistingTagIds(db, tagIds);
  const effectiveTagIds = new Set(normalizedTagIds);

  for (const tagId of resolveParentTagIdsFromDb(db, normalizedTagIds)) {
    effectiveTagIds.add(tagId);
  }

  return [...effectiveTagIds];
}

interface TagRelationTreeColumns {
  tableName: "tag_parents" | "tag_siblings";
  childColumn: "child_tag_id" | "alias_tag_id";
  parentColumn: "parent_tag_id" | "canonical_tag_id";
}

function readTagRelationTree(
  db: Database.Database,
  normalizedTagIds: number[],
  columns: TagRelationTreeColumns,
): TagRelationTree {
  const placeholders = createPlaceholders(normalizedTagIds.length);
  const relatedTagsCte = `WITH RECURSIVE related_tags(tag_id) AS (
    SELECT id
    FROM tags
    WHERE id IN (${placeholders})
    UNION
    SELECT ${columns.tableName}.${columns.parentColumn}
    FROM related_tags
    JOIN ${columns.tableName}
      ON ${columns.tableName}.${columns.childColumn} = related_tags.tag_id
    UNION
    SELECT ${columns.tableName}.${columns.childColumn}
    FROM related_tags
    JOIN ${columns.tableName}
      ON ${columns.tableName}.${columns.parentColumn} = related_tags.tag_id
  )`;
  const nodeRows = db
    .prepare(
      `${relatedTagsCte}
      SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE tags.id IN (SELECT tag_id FROM related_tags)
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(...normalizedTagIds) as TagRecord[];
  const edgeRows = db
    .prepare(
      `${relatedTagsCte}
      SELECT
        ${columns.childColumn} AS childTagId,
        ${columns.parentColumn} AS parentTagId
       FROM ${columns.tableName}
       WHERE ${columns.childColumn} IN (SELECT tag_id FROM related_tags)
         AND ${columns.parentColumn} IN (SELECT tag_id FROM related_tags)
       ORDER BY ${columns.parentColumn} ASC, ${columns.childColumn} ASC`,
    )
    .all(...normalizedTagIds) as Array<{
    childTagId: number;
    parentTagId: number;
  }>;
  const selectedTagIds = new Set(normalizedTagIds);

  return {
    nodes: nodeRows.map((row) => ({
      ...row,
      selected: selectedTagIds.has(row.id),
    })),
    edges: edgeRows,
  };
}

interface TagParentJoinedRow {
  childTagId: number;
  childStyleName: string;
  childNamespace: string;
  childName: string;
  childDisplayName: string | null;
  parentTagId: number;
  parentStyleName: string;
  parentNamespace: string;
  parentName: string;
  parentDisplayName: string | null;
  createdAt: string;
}

function readTagParentRecords(db: Database.Database): TagParentRecord[] {
  return (
    db.prepare(createTagParentRecordQuery()).all() as TagParentJoinedRow[]
  ).map(toTagParentRecord);
}

function readTagParentRecord(
  db: Database.Database,
  childTagId: number,
  parentTagId: number,
): TagParentRecord | null {
  const row = db
    .prepare(
      `${createTagParentRecordQuery(false)}
       WHERE tag_parents.child_tag_id = ?
         AND tag_parents.parent_tag_id = ?`,
    )
    .get(childTagId, parentTagId) as TagParentJoinedRow | undefined;

  return row ? toTagParentRecord(row) : null;
}

function toTagParentRecord(row: TagParentJoinedRow): TagParentRecord {
  return {
    child: {
      id: row.childTagId,
      styleName: row.childStyleName,
      namespace: row.childNamespace,
      name: row.childName,
      displayName: row.childDisplayName,
    },
    parent: {
      id: row.parentTagId,
      styleName: row.parentStyleName,
      namespace: row.parentNamespace,
      name: row.parentName,
      displayName: row.parentDisplayName,
    },
    createdAt: row.createdAt,
  };
}

interface TagSiblingJoinedRow {
  aliasTagId: number;
  aliasStyleName: string;
  aliasNamespace: string;
  aliasName: string;
  aliasDisplayName: string | null;
  canonicalTagId: number;
  canonicalStyleName: string;
  canonicalNamespace: string;
  canonicalName: string;
  canonicalDisplayName: string | null;
  createdAt: string;
}

function readTagSiblingRecords(db: Database.Database): TagSiblingRecord[] {
  return (
    db.prepare(createTagSiblingRecordQuery()).all() as TagSiblingJoinedRow[]
  ).map(toTagSiblingRecord);
}

function readTagSiblingRecord(
  db: Database.Database,
  aliasTagId: number,
): TagSiblingRecord | null {
  const row = db
    .prepare(
      `${createTagSiblingRecordQuery(false)}
       WHERE tag_siblings.alias_tag_id = ?`,
    )
    .get(aliasTagId) as TagSiblingJoinedRow | undefined;

  return row ? toTagSiblingRecord(row) : null;
}

function toTagSiblingRecord(row: TagSiblingJoinedRow): TagSiblingRecord {
  return {
    alias: {
      id: row.aliasTagId,
      styleName: row.aliasStyleName,
      namespace: row.aliasNamespace,
      name: row.aliasName,
      displayName: row.aliasDisplayName,
    },
    canonical: {
      id: row.canonicalTagId,
      styleName: row.canonicalStyleName,
      namespace: row.canonicalNamespace,
      name: row.canonicalName,
      displayName: row.canonicalDisplayName,
    },
    createdAt: row.createdAt,
  };
}

function readDirectParentTagIds(
  db: Database.Database,
  tagId: number,
): number[] {
  const rows = db
    .prepare(
      `SELECT parent_tag_id AS tagId
       FROM tag_parents
       WHERE child_tag_id = ?
       ORDER BY parent_tag_id ASC`,
    )
    .all(tagId) as Array<{ tagId: number }>;

  return rows.map((row) => row.tagId);
}

function resolveParentTagIdsFromDb(
  db: Database.Database,
  tagIds: number[],
): number[] {
  const visitedTagIds = new Set(tagIds);
  const parentTagIds: number[] = [];
  const queue = [...tagIds];

  while (queue.length > 0) {
    const currentTagId = queue.shift();

    if (!currentTagId) {
      continue;
    }

    for (const parentTagId of readDirectParentTagIds(db, currentTagId)) {
      if (visitedTagIds.has(parentTagId)) {
        continue;
      }

      visitedTagIds.add(parentTagId);
      parentTagIds.push(parentTagId);
      queue.push(parentTagId);
    }
  }

  return parentTagIds;
}

function wouldCreateTagParentCycle(
  db: Database.Database,
  childTagId: number,
  parentTagId: number,
): boolean {
  return resolveParentTagIdsFromDb(db, [parentTagId]).includes(childTagId);
}

function normalizeExistingTagIds(
  db: Database.Database,
  tagIds: number[],
): number[] {
  return normalizeTagIds(tagIds).map((tagId) => readTagId(db, tagId));
}
