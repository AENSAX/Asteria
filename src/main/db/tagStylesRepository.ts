import type Database from "better-sqlite3";
import type { DeleteTagStyleResult, TagStyleRecord } from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import { normalizeTagPart } from "./tagText.js";

export function listTagStyles(): TagStyleRecord[] {
  const db = getDatabaseConnection();

  return db
    .prepare(
      `SELECT
        tag_styles.id,
        tag_styles.name,
        tag_styles.display_name AS displayName,
        tag_styles.is_default AS isDefault,
        tag_styles.created_at AS createdAt,
        COUNT(tags.id) AS tagCount
       FROM tag_styles
       LEFT JOIN tags ON tags.style_id = tag_styles.id
       GROUP BY tag_styles.id
       ORDER BY tag_styles.is_default DESC, lower(tag_styles.display_name) ASC`,
    )
    .all() as TagStyleRecord[];
}

export function setActiveTagStyle(styleId: number): TagStyleRecord[] {
  const db = getDatabaseConnection();

  if (!Number.isInteger(styleId) || styleId <= 0) {
    throw new Error("标签风格无效");
  }

  const style = db
    .prepare("SELECT id FROM tag_styles WHERE id = ?")
    .get(styleId) as { id: number } | undefined;

  if (!style) {
    throw new Error("标签风格不存在");
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE tag_styles SET is_default = 0, updated_at = datetime('now') WHERE is_default = 1",
    ).run();
    db.prepare(
      "UPDATE tag_styles SET is_default = 1, updated_at = datetime('now') WHERE id = ?",
    ).run(styleId);
  })();

  return listTagStyles();
}

export function createTagStyle(name: string): TagStyleRecord[] {
  const db = getDatabaseConnection();
  const displayName = name.trim();
  const normalizedName = normalizeTagPart(name).replace(/\s+/g, "-");

  if (!displayName || !normalizedName) {
    throw new Error("标签风格名称不能为空");
  }

  db.prepare(
    `INSERT INTO tag_styles (name, display_name, description, is_default)
     VALUES (?, ?, ?, 0)`,
  ).run(normalizedName, displayName, null);

  db.prepare(
    `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
     SELECT id, '', ? FROM tag_styles WHERE name = ?`,
  ).run("无命名空间", normalizedName);

  return listTagStyles();
}

export function renameTagStyle(
  styleId: number,
  name: string,
): TagStyleRecord[] {
  const db = getDatabaseConnection();
  const displayName = name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeTagPart(displayName).replace(/\s+/g, "-");

  if (
    !Number.isInteger(styleId) ||
    styleId <= 0 ||
    !displayName ||
    !normalizedName
  ) {
    throw new Error("标签风格无效");
  }

  db.prepare(
    `UPDATE tag_styles
     SET name = ?,
         display_name = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(normalizedName, displayName, styleId);

  return listTagStyles();
}

export function deleteTagStyle(styleId: number): DeleteTagStyleResult {
  const db = getDatabaseConnection();

  if (!Number.isInteger(styleId) || styleId <= 0) {
    throw new Error("标签风格无效");
  }

  const style = db
    .prepare("SELECT id FROM tag_styles WHERE id = ?")
    .get(styleId) as { id: number } | undefined;

  if (!style) {
    throw new Error("标签风格不存在");
  }

  const tagCount = db
    .prepare("SELECT COUNT(*) AS count FROM tags WHERE style_id = ?")
    .get(styleId) as { count: number } | undefined;
  const fileTagCount = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       WHERE tags.style_id = ?`,
    )
    .get(styleId) as { count: number } | undefined;

  db.transaction(() => {
    db.prepare("DELETE FROM tag_styles WHERE id = ?").run(styleId);

    const defaultStyle = db
      .prepare("SELECT id FROM tag_styles WHERE is_default = 1 LIMIT 1")
      .get() as { id: number } | undefined;

    if (!defaultStyle) {
      const fallback = db
        .prepare("SELECT id FROM tag_styles ORDER BY id ASC LIMIT 1")
        .get() as { id: number } | undefined;

      if (fallback) {
        db.prepare(
          "UPDATE tag_styles SET is_default = 1, updated_at = datetime('now') WHERE id = ?",
        ).run(fallback.id);
      } else {
        getDefaultTagStyleId(db);
      }
    }
  })();

  return {
    styles: listTagStyles(),
    deletedTagCount: tagCount?.count ?? 0,
    deletedFileTagCount: fileTagCount?.count ?? 0,
  };
}

export function getDefaultTagStyleId(db: Database.Database): number {
  const row = db
    .prepare("SELECT id FROM tag_styles WHERE is_default = 1 LIMIT 1")
    .get() as { id: number } | undefined;

  if (row) {
    return row.id;
  }

  const existingDefault = db
    .prepare("SELECT id FROM tag_styles WHERE name = ?")
    .get("default") as { id: number } | undefined;

  if (existingDefault) {
    db.prepare("UPDATE tag_styles SET is_default = 1 WHERE id = ?").run(
      existingDefault.id,
    );
    return existingDefault.id;
  }

  const result = db
    .prepare(
      `INSERT INTO tag_styles (name, display_name, description, is_default)
       VALUES (?, ?, ?, ?)`,
    )
    .run("default", "default tag style", "默认标签风格", 1);

  return Number(result.lastInsertRowid);
}

export function ensureTagStyleByName(
  db: Database.Database,
  value: string,
  createFallbackName = (): string => "default",
): number {
  const displayName = value.trim().replace(/\s+/g, " ");

  if (!displayName) {
    return getDefaultTagStyleId(db);
  }

  const normalizedName = normalizeTagPart(displayName).replace(/\s+/g, "-");
  const existing = db
    .prepare(
      "SELECT id FROM tag_styles WHERE name = ? OR lower(display_name) = lower(?) LIMIT 1",
    )
    .get(normalizedName, displayName) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO tag_styles (name, display_name, description, is_default)
       VALUES (?, ?, ?, 0)`,
    )
    .run(normalizedName || createFallbackName(), displayName, null);

  db.prepare(
    `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
     VALUES (?, '', ?)`,
  ).run(result.lastInsertRowid, "无命名空间");

  return Number(result.lastInsertRowid);
}
