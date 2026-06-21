import type Database from "better-sqlite3";
import type {
  BatchFileTagRecord,
  FileDomain,
  FileTagRecord,
  TagDraft,
  TagTranslationSummary,
} from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import { createDomainPseudoTagId } from "./domainsRepository.js";
import {
  createPlaceholders,
  normalizeFileIds,
  normalizeTagIds,
} from "./queryUtils.js";
import { getTagTranslationSettings } from "./settingsRepository.js";
import { createSemanticTagFilesCte } from "./sqlFragments.js";
import { syncRatingsFromTagsForFiles } from "./systemTagsRepository.js";
import { getDefaultTagStyleId } from "./tagStylesRepository.js";
import {
  expandTagDraftsWithTranslation,
  normalizeTagDrafts,
  readTranslatedTagName,
  readTranslationMap,
} from "./tagTranslation.js";
import { ensureTag, ensureTagNamespace, readTagId } from "./tagsRepository.js";

export function listFileTags(fileId: number): FileTagRecord[] {
  const db = getDatabaseConnection();

  return db
    .prepare(
      `SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        file_tags.created_at AS createdAt
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE file_tags.file_id = ?
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(fileId) as FileTagRecord[];
}

export function listFileTagsByFileIds(
  fileIds: number[],
): Map<number, FileTagRecord[]> {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const tagsByFileId = new Map<number, FileTagRecord[]>();

  if (normalizedFileIds.length === 0) {
    return tagsByFileId;
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);
  const rows = db
    .prepare(
      `SELECT
        file_tags.file_id AS fileId,
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        file_tags.created_at AS createdAt
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE file_tags.file_id IN (${placeholders})
       ORDER BY file_tags.file_id ASC, tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(...normalizedFileIds) as Array<FileTagRecord & { fileId: number }>;

  for (const row of rows) {
    const tags = tagsByFileId.get(row.fileId) ?? [];
    tags.push({
      id: row.id,
      styleName: row.styleName,
      namespace: row.namespace,
      name: row.name,
      displayName: row.displayName,
      createdAt: row.createdAt,
    });
    tagsByFileId.set(row.fileId, tags);
  }

  return tagsByFileId;
}

export function listFileParentTags(fileId: number): FileTagRecord[] {
  const db = getDatabaseConnection();

  return db
    .prepare(
      `${createSemanticTagFilesCte("file_tags.file_id = ?")}
      SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        tags.created_at AS createdAt,
        CASE MIN(semantic_tag_files.semanticRank)
          WHEN 1 THEN 'parent'
          ELSE 'canonical'
        END AS semanticKind
       FROM semantic_tag_files
       JOIN tags ON tags.id = semantic_tag_files.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE semantic_tag_files.semanticRank > 0
         AND NOT EXISTS (
         SELECT 1
         FROM file_tags
         WHERE file_tags.file_id = semantic_tag_files.file_id
           AND file_tags.tag_id = tags.id
       )
       GROUP BY tags.id
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(fileId, fileId, fileId) as FileTagRecord[];
}

export function addFileTags(fileId: number, tags: TagDraft[]): FileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );

  if (normalizedTags.length === 0) {
    return listFileTags(fileId);
  }

  db.transaction(() => {
    const file = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId) as
      | { id: number }
      | undefined;

    if (!file) {
      throw new Error("文件不存在");
    }

    const styleId = getDefaultTagStyleId(db);

    for (const tag of normalizedTags) {
      const tagId = tag.id
        ? readTagId(db, tag.id)
        : ensureTag(
            db,
            styleId,
            ensureTagNamespace(db, styleId, tag.namespace),
            tag,
          );

      db.prepare(
        "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
      ).run(fileId, tagId);
    }

    syncRatingsFromTagsForFiles(db, [fileId]);
  })();

  return listFileTags(fileId);
}

export function replaceFileTags(
  fileId: number,
  tags: TagDraft[],
): FileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );

  db.transaction(() => {
    const file = db.prepare("SELECT id FROM files WHERE id = ?").get(fileId) as
      | { id: number }
      | undefined;

    if (!file) {
      throw new Error("文件不存在");
    }

    const styleId = getDefaultTagStyleId(db);
    db.prepare("DELETE FROM file_tags WHERE file_id = ?").run(fileId);

    for (const tag of normalizedTags) {
      const tagId = tag.id
        ? readTagId(db, tag.id)
        : ensureTag(
            db,
            styleId,
            ensureTagNamespace(db, styleId, tag.namespace),
            tag,
          );

      db.prepare(
        "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
      ).run(fileId, tagId);
    }

    syncRatingsFromTagsForFiles(db, [fileId]);
    db.prepare(
      "UPDATE files SET updated_at = datetime('now') WHERE id = ?",
    ).run(fileId);
  })();

  return listFileTags(fileId);
}

export function removeFileTags(
  fileId: number,
  tagIds: number[],
): FileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedTagIds = normalizeTagIds(tagIds);

  if (normalizedTagIds.length === 0) {
    return listFileTags(fileId);
  }

  db.transaction(() => {
    for (const tagId of normalizedTagIds) {
      db.prepare("DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?").run(
        fileId,
        tagId,
      );
    }

    syncRatingsFromTagsForFiles(db, [fileId]);
  })();

  return listFileTags(fileId);
}

export function listBatchFileTags(fileIds: number[]): BatchFileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);

  return db
    .prepare(
      `SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        MIN(file_tags.created_at) AS createdAt,
        COUNT(DISTINCT file_tags.file_id) AS fileCount
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       WHERE file_tags.file_id IN (${placeholders})
       GROUP BY tags.id
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(...normalizedFileIds) as BatchFileTagRecord[];
}

export function listBatchEffectiveFileTags(
  fileIds: number[],
): BatchFileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(normalizedFileIds.length);

  const semanticTags = db
    .prepare(
      `${createSemanticTagFilesCte(`file_tags.file_id IN (${placeholders})`)}
      SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        MIN(tags.created_at) AS createdAt,
        COUNT(DISTINCT semantic_tag_files.file_id) AS fileCount
       FROM semantic_tag_files
       JOIN tags ON tags.id = semantic_tag_files.tag_id
       JOIN tag_styles ON tag_styles.id = tags.style_id
       GROUP BY tags.id
       ORDER BY tag_styles.name ASC, tags.namespace ASC, tags.name ASC`,
    )
    .all(
      ...normalizedFileIds,
      ...normalizedFileIds,
      ...normalizedFileIds,
    ) as BatchFileTagRecord[];

  const domainTags = db
    .prepare(
      `SELECT
        CASE
          WHEN deleted_at IS NOT NULL THEN 'trash'
          ELSE domain
        END AS domain,
        COUNT(DISTINCT id) AS fileCount
       FROM files
       WHERE id IN (${placeholders})
       GROUP BY
        CASE
          WHEN deleted_at IS NOT NULL THEN 'trash'
          ELSE domain
        END`,
    )
    .all(...normalizedFileIds)
    .map((row) => {
      const domain = (row as { domain: FileDomain }).domain;

      return {
        id: createDomainPseudoTagId(domain),
        styleName: "domain",
        namespace: "domain",
        name: domain,
        displayName: null,
        createdAt: "",
        fileCount: (row as { fileCount: number }).fileCount,
      };
    }) as BatchFileTagRecord[];

  return [...domainTags, ...semanticTags];
}

export function addTagsToFiles(
  fileIds: number[],
  tags: TagDraft[],
): BatchFileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedTags = expandTagDraftsWithTranslation(
    normalizeTagDrafts(tags),
  );

  if (normalizedFileIds.length === 0 || normalizedTags.length === 0) {
    return listBatchFileTags(normalizedFileIds);
  }

  db.transaction(() => {
    ensureFilesExist(db, normalizedFileIds);
    const styleId = getDefaultTagStyleId(db);

    for (const tag of normalizedTags) {
      const tagId = tag.id
        ? readTagId(db, tag.id)
        : ensureTag(
            db,
            styleId,
            ensureTagNamespace(db, styleId, tag.namespace),
            tag,
          );

      for (const fileId of normalizedFileIds) {
        db.prepare(
          "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
        ).run(fileId, tagId);
      }
    }

    syncRatingsFromTagsForFiles(db, normalizedFileIds);
  })();

  return listBatchFileTags(normalizedFileIds);
}

export function removeTagsFromFiles(
  fileIds: number[],
  tagIds: number[],
): BatchFileTagRecord[] {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const normalizedTagIds = normalizeTagIds(tagIds);

  if (normalizedFileIds.length === 0 || normalizedTagIds.length === 0) {
    return listBatchFileTags(normalizedFileIds);
  }

  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const tagPlaceholders = createPlaceholders(normalizedTagIds.length);

  db.transaction(() => {
    db.prepare(
      `DELETE FROM file_tags
       WHERE file_id IN (${filePlaceholders})
         AND tag_id IN (${tagPlaceholders})`,
    ).run(...normalizedFileIds, ...normalizedTagIds);

    syncRatingsFromTagsForFiles(db, normalizedFileIds);
  })();

  return listBatchFileTags(normalizedFileIds);
}

export function translateFileTags(
  fileIds: number[],
  onProgress?: (completed: number, total: number) => void,
): TagTranslationSummary {
  const db = getDatabaseConnection();
  const normalizedFileIds = normalizeFileIds(fileIds);
  const settings = getTagTranslationSettings();
  const translationMap = readTranslationMap(settings);
  const summary: TagTranslationSummary = {
    fileCount: normalizedFileIds.length,
    translatedTagCount: 0,
    removedOriginalTagCount: 0,
    missingTranslationCount: 0,
  };

  if (normalizedFileIds.length === 0 || translationMap.size === 0) {
    return summary;
  }

  const filePlaceholders = createPlaceholders(normalizedFileIds.length);
  const rows = db
    .prepare(
      `SELECT
        file_tags.file_id AS fileId,
        tags.id AS tagId,
        tags.style_id AS styleId,
        tags.namespace,
        tags.name
       FROM file_tags
       JOIN tags ON tags.id = file_tags.tag_id
       WHERE file_tags.file_id IN (${filePlaceholders})`,
    )
    .all(...normalizedFileIds) as Array<{
    fileId: number;
    tagId: number;
    styleId: number;
    namespace: string;
    name: string;
  }>;

  const rowsByFileId = new Map<number, typeof rows>();

  for (const row of rows) {
    const fileRows = rowsByFileId.get(row.fileId) ?? [];
    fileRows.push(row);
    rowsByFileId.set(row.fileId, fileRows);
  }

  db.transaction(() => {
    const originalTagIds = new Set<number>();
    let completedFiles = 0;

    for (const fileId of normalizedFileIds) {
      for (const row of rowsByFileId.get(fileId) ?? []) {
        const translatedName = readTranslatedTagName(row.name, translationMap);

        if (!translatedName) {
          summary.missingTranslationCount += 1;
          continue;
        }

        const translatedTag: TagDraft = {
          namespace: row.namespace,
          name: translatedName,
        };
        const translatedTagId = ensureTag(
          db,
          row.styleId,
          ensureTagNamespace(db, row.styleId, translatedTag.namespace),
          translatedTag,
        );
        db.prepare(
          "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
        ).run(row.fileId, translatedTagId);
        summary.translatedTagCount += 1;

        if (translatedTagId !== row.tagId) {
          db.prepare(
            "DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?",
          ).run(row.fileId, row.tagId);
          originalTagIds.add(row.tagId);
          summary.removedOriginalTagCount += 1;
        }
      }

      completedFiles += 1;
      onProgress?.(completedFiles, normalizedFileIds.length);
    }

    if (!settings.keepOriginalTags && originalTagIds.size > 0) {
      const originalTagIdList = [...originalTagIds];
      const originalTagPlaceholders = createPlaceholders(
        originalTagIdList.length,
      );

      db.prepare(
        `DELETE FROM tags
         WHERE id IN (${originalTagPlaceholders})
           AND NOT EXISTS (
             SELECT 1 FROM file_tags WHERE file_tags.tag_id = tags.id
           )`,
      ).run(...originalTagIdList);
    }

    if (summary.translatedTagCount > 0 || summary.removedOriginalTagCount > 0) {
      syncRatingsFromTagsForFiles(db, normalizedFileIds);
      db.prepare(
        `UPDATE files SET updated_at = datetime('now') WHERE id IN (${filePlaceholders})`,
      ).run(...normalizedFileIds);
    }
  })();

  return summary;
}

function ensureFilesExist(db: Database.Database, fileIds: number[]): void {
  if (fileIds.length === 0) {
    return;
  }

  const placeholders = createPlaceholders(fileIds.length);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM files WHERE id IN (${placeholders})`,
    )
    .get(...fileIds) as { count: number } | undefined;

  if ((row?.count ?? 0) !== fileIds.length) {
    throw new Error("文件不存在");
  }
}
