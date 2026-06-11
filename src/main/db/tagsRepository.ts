import type Database from "better-sqlite3";
import type {
  DeleteManagedTagsResult,
  ManagedTagRecord,
  ManagedTagRenamePreview,
  ManagedTagSortKey,
  SortDirection,
  TagDraft,
} from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import {
  createPlaceholders,
  normalizeTagIds,
  readSqlCount,
} from "./queryUtils.js";
import { createEffectiveTagFilesCte } from "./sqlFragments.js";
import { normalizeTagPart } from "./tagText.js";
import {
  expandTagDraftsWithTranslation,
  normalizeTagDrafts,
} from "./tagTranslation.js";

export function listManagedTags(
  styleId: number,
  sortKey: ManagedTagSortKey,
  direction: SortDirection,
): ManagedTagRecord[] {
  const db = getDatabaseConnection();
  const orderColumn = resolveManagedTagSortColumn(sortKey);
  const orderDirection = direction === "desc" ? "DESC" : "ASC";

  return db
    .prepare(
      `${createEffectiveTagFilesCte()}
       SELECT
        tags.id,
        tags.style_id AS styleId,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        tags.created_at AS createdAt,
        COUNT(DISTINCT effective_tag_files.file_id) AS fileCount
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       LEFT JOIN effective_tag_files ON effective_tag_files.tag_id = tags.id
       WHERE tags.style_id = ?
       GROUP BY tags.id
       ORDER BY ${orderColumn} ${orderDirection}, lower(tags.namespace) ASC, lower(tags.name) ASC`,
    )
    .all(styleId) as ManagedTagRecord[];
}

export function createManagedTag(
  styleId: number,
  tag: TagDraft,
): ManagedTagRecord {
  const db = getDatabaseConnection();
  const normalizedTag = normalizeTagDrafts([tag])[0];

  if (!Number.isInteger(styleId) || styleId <= 0) {
    throw new Error("标签风格无效");
  }

  if (!normalizedTag) {
    throw new Error("标签不能为空");
  }

  const translatedTags = expandTagDraftsWithTranslation([normalizedTag]);
  const primaryTag = translatedTags[0] ?? normalizedTag;
  const existing = db
    .prepare(
      "SELECT id FROM tags WHERE style_id = ? AND namespace = ? AND name = ?",
    )
    .get(styleId, primaryTag.namespace, primaryTag.name) as
    | { id: number }
    | undefined;

  if (existing) {
    throw new Error("同个风格不能包含完全相同的标签");
  }

  let tagId = 0;

  for (const tagDraft of translatedTags) {
    const namespaceId = ensureTagNamespace(db, styleId, tagDraft.namespace);
    const ensuredTagId = ensureTag(db, styleId, namespaceId, tagDraft);

    if (tagDraft === primaryTag) {
      tagId = ensuredTagId;
    }
  }

  if (!tagId) {
    throw new Error("标签创建失败");
  }

  const created = readManagedTag(db, tagId);

  if (!created) {
    throw new Error("标签创建失败");
  }

  return created;
}

export function renameManagedTag(
  tagId: number,
  tag: TagDraft,
): ManagedTagRecord {
  const db = getDatabaseConnection();
  const normalizedTag = normalizeTagDrafts([tag])[0];

  if (!Number.isInteger(tagId) || tagId <= 0) {
    throw new Error("标签无效");
  }

  if (!normalizedTag) {
    throw new Error("标签不能为空");
  }

  return db.transaction(() => {
    const existingTag = db
      .prepare("SELECT id, style_id AS styleId FROM tags WHERE id = ?")
      .get(tagId) as { id: number; styleId: number } | undefined;

    if (!existingTag) {
      throw new Error("标签不存在");
    }

    const duplicate = db
      .prepare(
        `SELECT id
         FROM tags
         WHERE style_id = ?
           AND namespace = ?
           AND name = ?
           AND id <> ?`,
      )
      .get(
        existingTag.styleId,
        normalizedTag.namespace,
        normalizedTag.name,
        existingTag.id,
      ) as { id: number } | undefined;

    if (duplicate) {
      throw new Error("同个风格不能包含完全相同的标签");
    }

    const namespaceId = ensureTagNamespace(
      db,
      existingTag.styleId,
      normalizedTag.namespace,
    );

    db.prepare(
      `UPDATE tags
       SET namespace_id = ?,
           namespace = ?,
           name = ?,
           display_name = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      namespaceId,
      normalizedTag.namespace,
      normalizedTag.name,
      existingTag.id,
    );

    const renamed = readManagedTag(db, existingTag.id);

    if (!renamed) {
      throw new Error("标签重命名失败");
    }

    return renamed;
  })();
}

export function previewManagedTagRename(
  tagId: number,
  tag: TagDraft,
): ManagedTagRenamePreview {
  const db = getDatabaseConnection();
  const normalizedTag = normalizeTagDrafts([tag])[0];

  if (!Number.isInteger(tagId) || tagId <= 0) {
    throw new Error("标签无效");
  }

  if (!normalizedTag) {
    throw new Error("标签不能为空");
  }

  const existingTag = db
    .prepare("SELECT id, style_id AS styleId FROM tags WHERE id = ?")
    .get(tagId) as { id: number; styleId: number } | undefined;

  if (!existingTag) {
    throw new Error("标签不存在");
  }

  const duplicate = db
    .prepare(
      `SELECT id
       FROM tags
       WHERE style_id = ?
         AND namespace = ?
         AND name = ?
         AND id <> ?`,
    )
    .get(
      existingTag.styleId,
      normalizedTag.namespace,
      normalizedTag.name,
      existingTag.id,
    ) as { id: number } | undefined;
  const directFileCount = readSqlCount(
    db,
    "SELECT COUNT(DISTINCT file_id) AS count FROM file_tags WHERE tag_id = ?",
    existingTag.id,
  );
  const effectiveFileCount = readSqlCount(
    db,
    `${createEffectiveTagFilesCte()}
     SELECT COUNT(DISTINCT file_id) AS count
     FROM effective_tag_files
     WHERE tag_id = ?`,
    existingTag.id,
  );
  const directParentCount = readSqlCount(
    db,
    "SELECT COUNT(*) AS count FROM tag_parents WHERE child_tag_id = ?",
    existingTag.id,
  );
  const directChildCount = readSqlCount(
    db,
    "SELECT COUNT(*) AS count FROM tag_parents WHERE parent_tag_id = ?",
    existingTag.id,
  );
  const aliasCount = readSqlCount(
    db,
    "SELECT COUNT(*) AS count FROM tag_siblings WHERE canonical_tag_id = ?",
    existingTag.id,
  );
  const canonicalTargetCount = readSqlCount(
    db,
    "SELECT COUNT(*) AS count FROM tag_siblings WHERE alias_tag_id = ?",
    existingTag.id,
  );

  return {
    tagId: existingTag.id,
    directFileCount,
    effectiveFileCount,
    impliedFileCount: Math.max(0, effectiveFileCount - directFileCount),
    directParentCount,
    directChildCount,
    aliasCount,
    canonicalTargetCount,
    duplicateTagId: duplicate?.id ?? null,
  };
}

export function deleteManagedTag(tagId: number): DeleteManagedTagsResult {
  return deleteManagedTags([tagId]);
}

export function deleteManagedTags(tagIds: number[]): DeleteManagedTagsResult {
  const db = getDatabaseConnection();
  const normalizedTagIds = normalizeTagIds(tagIds);

  if (normalizedTagIds.length === 0) {
    throw new Error("标签无效");
  }

  const placeholders = createPlaceholders(normalizedTagIds.length);
  const fileCount = db
    .prepare(
      `SELECT COUNT(DISTINCT file_id) AS count FROM file_tags WHERE tag_id IN (${placeholders})`,
    )
    .get(...normalizedTagIds) as { count: number } | undefined;
  const tagCount = db
    .prepare(`SELECT COUNT(*) AS count FROM tags WHERE id IN (${placeholders})`)
    .get(...normalizedTagIds) as { count: number } | undefined;

  db.transaction(() => {
    db.prepare(`DELETE FROM file_tags WHERE tag_id IN (${placeholders})`).run(
      ...normalizedTagIds,
    );
    db.prepare(`DELETE FROM tags WHERE id IN (${placeholders})`).run(
      ...normalizedTagIds,
    );
  })();

  return {
    deletedTagCount: tagCount?.count ?? 0,
    deletedFileCount: fileCount?.count ?? 0,
  };
}

export function ensureTagNamespace(
  db: Database.Database,
  styleId: number,
  namespace: string,
): number {
  const existing = db
    .prepare("SELECT id FROM tag_namespaces WHERE style_id = ? AND name = ?")
    .get(styleId, namespace) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const displayName = namespace || "无命名空间";
  const result = db
    .prepare(
      "INSERT INTO tag_namespaces (style_id, name, display_name) VALUES (?, ?, ?)",
    )
    .run(styleId, namespace, displayName);

  return Number(result.lastInsertRowid);
}

export function ensureTag(
  db: Database.Database,
  styleId: number,
  namespaceId: number,
  tag: TagDraft,
): number {
  const existing = db
    .prepare(
      "SELECT id FROM tags WHERE style_id = ? AND namespace = ? AND name = ?",
    )
    .get(styleId, tag.namespace, tag.name) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO tags (style_id, namespace_id, namespace, name, display_name)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(styleId, namespaceId, tag.namespace, tag.name, null);

  return Number(result.lastInsertRowid);
}

export function readTagId(db: Database.Database, tagId: number): number {
  const existing = db.prepare("SELECT id FROM tags WHERE id = ?").get(tagId) as
    | { id: number }
    | undefined;

  if (!existing) {
    throw new Error("标签不存在");
  }

  return existing.id;
}

function readManagedTag(
  db: Database.Database,
  tagId: number,
): ManagedTagRecord | null {
  const row = db
    .prepare(
      `${createEffectiveTagFilesCte()}
       SELECT
        tags.id,
        tags.style_id AS styleId,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        tags.created_at AS createdAt,
        COUNT(DISTINCT effective_tag_files.file_id) AS fileCount
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       LEFT JOIN effective_tag_files ON effective_tag_files.tag_id = tags.id
       WHERE tags.id = ?
       GROUP BY tags.id`,
    )
    .get(tagId) as ManagedTagRecord | undefined;

  return row ?? null;
}

function resolveManagedTagSortColumn(sortKey: ManagedTagSortKey): string {
  if (sortKey === "createdAt") {
    return "tags.created_at";
  }

  if (sortKey === "fileCount") {
    return "fileCount";
  }

  return "lower(tags.namespace || char(31) || tags.name)";
}
