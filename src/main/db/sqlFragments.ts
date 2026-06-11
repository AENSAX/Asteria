const FILE_DOMAIN_NAME_SQL = `CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END`;

const FILE_EFFECTIVE_DOMAIN_SQL = `CASE
          WHEN deleted_at IS NOT NULL THEN 'trash'
          ELSE domain
        END`;

const BASE_FILE_SELECT_COLUMNS = `id,
        sha256,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        size_bytes AS sizeBytes,
        original_path AS originalPath,
        imported_at AS importedAt,
        updated_at AS updatedAt,
        width,
        height`;

export const DATABASE_FILE_SELECT_COLUMNS = `${BASE_FILE_SELECT_COLUMNS},
        domain,
        is_favorite AS isFavorite,
        ${FILE_DOMAIN_NAME_SQL} AS domainName`;

export const DATABASE_FILE_SELECT_COLUMNS_WITH_DELETED_DOMAIN = `${BASE_FILE_SELECT_COLUMNS},
        is_favorite AS isFavorite,
        ${FILE_EFFECTIVE_DOMAIN_SQL} AS domain,
        ${FILE_DOMAIN_NAME_SQL} AS domainName`;

export function createEffectiveTagFilesCte(): string {
  return `
    WITH RECURSIVE effective_tag_files(tag_id, file_id) AS (
      SELECT tag_id, file_id
      FROM file_tags
      UNION
      SELECT tag_parents.parent_tag_id, effective_tag_files.file_id
      FROM effective_tag_files
      JOIN tag_parents ON tag_parents.child_tag_id = effective_tag_files.tag_id
    )`;
}

export function createSemanticTagFilesCte(filePredicate: string): string {
  return `WITH RECURSIVE parent_tags(file_id, tag_id) AS (
    SELECT file_tags.file_id, tag_parents.parent_tag_id
    FROM file_tags
    JOIN tag_parents ON tag_parents.child_tag_id = file_tags.tag_id
    WHERE ${filePredicate}
    UNION
    SELECT parent_tags.file_id, tag_parents.parent_tag_id
    FROM parent_tags
    JOIN tag_parents ON tag_parents.child_tag_id = parent_tags.tag_id
  ),
  semantic_tag_files(file_id, tag_id, semanticRank) AS (
    SELECT file_tags.file_id, file_tags.tag_id, 0
    FROM file_tags
    WHERE ${filePredicate}
    UNION
    SELECT parent_tags.file_id, parent_tags.tag_id, 1
    FROM parent_tags
    UNION
    SELECT file_tags.file_id, tag_siblings.canonical_tag_id, 2
    FROM file_tags
    JOIN tag_siblings ON tag_siblings.alias_tag_id = file_tags.tag_id
    WHERE ${filePredicate}
    UNION
    SELECT parent_tags.file_id, tag_siblings.canonical_tag_id, 2
    FROM parent_tags
    JOIN tag_siblings ON tag_siblings.alias_tag_id = parent_tags.tag_id
  )`;
}

export function createTagParentRecordQuery(includeOrder = true): string {
  const query = `
    SELECT
      child_tags.id AS childTagId,
      child_styles.name AS childStyleName,
      child_tags.namespace AS childNamespace,
      child_tags.name AS childName,
      child_tags.display_name AS childDisplayName,
      parent_tags.id AS parentTagId,
      parent_styles.name AS parentStyleName,
      parent_tags.namespace AS parentNamespace,
      parent_tags.name AS parentName,
      parent_tags.display_name AS parentDisplayName,
      tag_parents.created_at AS createdAt
    FROM tag_parents
    JOIN tags AS child_tags ON child_tags.id = tag_parents.child_tag_id
    JOIN tag_styles AS child_styles ON child_styles.id = child_tags.style_id
    JOIN tags AS parent_tags ON parent_tags.id = tag_parents.parent_tag_id
    JOIN tag_styles AS parent_styles ON parent_styles.id = parent_tags.style_id`;

  if (!includeOrder) {
    return query;
  }

  return `${query}
    ORDER BY
      child_styles.name ASC,
      child_tags.namespace ASC,
      child_tags.name ASC,
      parent_styles.name ASC,
      parent_tags.namespace ASC,
      parent_tags.name ASC`;
}

export function createTagSiblingRecordQuery(includeOrder = true): string {
  const query = `
    SELECT
      alias_tags.id AS aliasTagId,
      alias_styles.name AS aliasStyleName,
      alias_tags.namespace AS aliasNamespace,
      alias_tags.name AS aliasName,
      alias_tags.display_name AS aliasDisplayName,
      canonical_tags.id AS canonicalTagId,
      canonical_styles.name AS canonicalStyleName,
      canonical_tags.namespace AS canonicalNamespace,
      canonical_tags.name AS canonicalName,
      canonical_tags.display_name AS canonicalDisplayName,
      tag_siblings.created_at AS createdAt
    FROM tag_siblings
    JOIN tags AS alias_tags ON alias_tags.id = tag_siblings.alias_tag_id
    JOIN tag_styles AS alias_styles ON alias_styles.id = alias_tags.style_id
    JOIN tags AS canonical_tags ON canonical_tags.id = tag_siblings.canonical_tag_id
    JOIN tag_styles AS canonical_styles ON canonical_styles.id = canonical_tags.style_id`;

  if (!includeOrder) {
    return query;
  }

  return `${query}
    ORDER BY
      canonical_styles.name ASC,
      canonical_tags.namespace ASC,
      canonical_tags.name ASC,
      alias_styles.name ASC,
      alias_tags.namespace ASC,
      alias_tags.name ASC`;
}
