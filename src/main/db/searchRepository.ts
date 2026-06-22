import type {
  BrowserFilePage,
  BrowserNamespaceGroupPage,
  BrowserNamespaceGroupPageRequest,
  BrowserSearchPageRequest,
  DatabaseFileRecord,
  SearchHintRecord,
  TagRecord,
} from "../../shared/ipc.js";
import { getDatabaseConnection } from "./connection.js";
import {
  createDomainPseudoTagId,
  getDomainSearchAliases,
  listDomains,
} from "./domainsRepository.js";
import {
  hydrateBrowserFileRecords,
  listBrowserFilePageByNamespaceGroup,
  listBrowserFilePage,
} from "./filesRepository.js";
import {
  DATABASE_FILE_SELECT_COLUMNS,
  createEffectiveTagFilesCte,
} from "./sqlFragments.js";
import { normalizeTagPart, normalizeTagSearchQuery } from "./tagText.js";
import {
  parseSearchExpression,
  type SearchNode,
  tokenizeSearchQuery,
} from "./searchSyntax.js";

interface CompiledSearchSql {
  sql: string;
  params: Array<string | number>;
}

interface MatchedFilesCte {
  cte: string;
  params: Array<string | number>;
}

export function searchBrowserFilePage(
  request: BrowserSearchPageRequest,
): BrowserFilePage {
  const normalizedQuery = request.query.trim();

  if (!normalizedQuery) {
    return listBrowserFilePage(request);
  }

  const tokens = tokenizeSearchQuery(normalizedQuery, normalizeTagPart);

  if (tokens.length === 0) {
    return listBrowserFilePage(request);
  }

  const ast = parseSearchExpression(tokens);

  if (!ast) {
    return {
      page: normalizeBrowserPage(request.page),
      pageSize: normalizeBrowserPageSize(request.pageSize),
      total: 0,
      files: [],
    };
  }

  const db = getDatabaseConnection();
  const compiled = compileSearchNode(ast);
  const page = normalizeBrowserPage(request.page);
  const pageSize = normalizeBrowserPageSize(request.pageSize);
  const offset = (page - 1) * pageSize;
  const sort = createBrowserFileSortSql(request);
  const ctePrefix = `${createSearchTokenFilesCte()},
  matched_files(file_id) AS (${compiled.sql})`;
  const totalRow = db
    .prepare(
      `${ctePrefix}
       SELECT COUNT(DISTINCT files.id) AS count
       FROM files
       JOIN matched_files ON matched_files.file_id = files.id
       WHERE files.deleted_at IS NULL`,
    )
    .get(...compiled.params) as { count: number } | undefined;
  const rows = db
    .prepare(
      `${ctePrefix}
       SELECT
        ${DATABASE_FILE_SELECT_COLUMNS}
       FROM files
       JOIN matched_files ON matched_files.file_id = files.id
       WHERE files.deleted_at IS NULL
       GROUP BY files.id
       ORDER BY ${sort}, files.id ${request.sortDirection === "asc" ? "ASC" : "DESC"}
       LIMIT ? OFFSET ?`,
    )
    .all(...compiled.params, pageSize, offset) as DatabaseFileRecord[];

  return {
    page,
    pageSize,
    total: totalRow?.count ?? 0,
    files: hydrateBrowserFileRecords(db, rows),
  };
}

export function listBrowserNamespaceGroupPage(
  request: BrowserNamespaceGroupPageRequest,
): BrowserNamespaceGroupPage {
  const normalizedNamespace = normalizeTagPart(request.namespace);
  const page = normalizeBrowserPage(request.page);
  const pageSize = normalizeBrowserPageSize(request.pageSize);

  if (!normalizedNamespace) {
    return { page, pageSize, total: 0, groups: [] };
  }

  const matchedFilesCte = createMatchedFilesCte(request.query);

  if (!matchedFilesCte) {
    return { page, pageSize, total: 0, groups: [] };
  }

  const db = getDatabaseConnection();
  const valueRows = db
    .prepare(
      `${matchedFilesCte.cte}
       SELECT DISTINCT tags.name AS value
       FROM matched_files
       JOIN file_tags ON file_tags.file_id = matched_files.file_id
       JOIN tags ON tags.id = file_tags.tag_id
       WHERE tags.namespace = ?
       ORDER BY lower(tags.name) ASC`,
    )
    .all(...matchedFilesCte.params, normalizedNamespace) as Array<{
    value: string;
  }>;
  const missingRow = db
    .prepare(
      `${matchedFilesCte.cte}
       SELECT 1 AS found
       FROM matched_files
       WHERE NOT EXISTS (
         SELECT 1
         FROM file_tags
         JOIN tags ON tags.id = file_tags.tag_id
         WHERE file_tags.file_id = matched_files.file_id
           AND tags.namespace = ?
       )
       LIMIT 1`,
    )
    .get(...matchedFilesCte.params, normalizedNamespace) as
    | { found: number }
    | undefined;
  const groupValues: Array<string | null> = valueRows.map((row) => row.value);

  if (missingRow) {
    groupValues.push(null);
  }

  const total = groupValues.length;
  const pageValues = groupValues.slice((page - 1) * pageSize, page * pageSize);
  const groups = pageValues.flatMap((value) => {
    const groupPage = listBrowserFilePageByNamespaceGroup(
      normalizedNamespace,
      value,
      { ...request, page: 1, pageSize: 1 },
    );
    const coverFile = groupPage.files[0];

    if (!coverFile || groupPage.total <= 0) {
      return [];
    }

    return [
      {
        id: createNamespaceGroupId(normalizedNamespace, value),
        namespace: normalizedNamespace,
        value,
        fileCount: groupPage.total,
        coverFile,
      },
    ];
  });

  return {
    page,
    pageSize,
    total,
    groups,
  };
}

export function searchHints(query: string, limit = 16): SearchHintRecord[] {
  const db = getDatabaseConnection();
  const normalizedQuery = normalizeTagSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const hints: SearchHintRecord[] = [];

  const favoriteAliases = ["喜欢", "收藏", "我的收藏", "favorite"];
  if (
    favoriteAliases.some((alias) =>
      normalizeTagSearchQuery(alias).includes(normalizedQuery),
    )
  ) {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS count FROM files WHERE deleted_at IS NULL AND is_favorite = 1",
      )
      .get() as { count: number } | undefined;

    hints.push({
      id: -10,
      kind: "favorite",
      styleName: "favorite",
      namespace: "",
      name: "喜欢",
      displayName: null,
      color: "#ff6fae",
      fileCount: row?.count ?? 0,
    });
  }

  const domainHints = listDomains()
    .filter((domain) =>
      getDomainSearchAliases(domain.id).some((alias) =>
        normalizeTagSearchQuery(alias).includes(normalizedQuery),
      ),
    )
    .map((domain) => ({
      id: createDomainPseudoTagId(domain.id),
      kind: "domain" as const,
      styleName: "domain",
      namespace: "domain",
      name: domain.id,
      displayName: null,
      color: null,
      fileCount: domain.fileCount,
    }));

  hints.push(...domainHints);

  const ratingRows = db
    .prepare(
      `SELECT
        rating_entries.id,
        rating_groups.name AS groupName,
        rating_entries.label,
        rating_entries.color,
        COUNT(CASE WHEN files.deleted_at IS NULL THEN file_ratings.file_id END) AS fileCount
       FROM rating_entries
       JOIN rating_groups ON rating_groups.id = rating_entries.group_id
       LEFT JOIN file_ratings ON file_ratings.entry_id = rating_entries.id
       LEFT JOIN files ON files.id = file_ratings.file_id
       WHERE lower(rating_entries.label) LIKE ?
          OR lower(rating_groups.name || ':' || rating_entries.label) LIKE ?
       GROUP BY rating_entries.id
       ORDER BY rating_groups.id ASC, rating_entries.sort_order ASC, rating_entries.id ASC
       LIMIT ?`,
    )
    .all(`%${normalizedQuery}%`, `%${normalizedQuery}%`, limit) as Array<{
    id: number;
    groupName: string;
    label: string;
    color: string;
    fileCount: number;
  }>;

  hints.push(
    ...ratingRows.map((row) => ({
      id: row.id,
      kind: "rating" as const,
      styleName: "rating",
      namespace: row.groupName,
      name: row.label,
      displayName: null,
      color: row.color,
      fileCount: row.fileCount,
    })),
  );

  const tagHints = searchTags(query, limit).map((tag) => ({
    id: tag.id,
    kind: "tag" as const,
    styleName: tag.styleName,
    namespace: tag.namespace,
    name: tag.name,
    displayName: tag.displayName,
    color: null,
    fileCount: tag.fileCount ?? 0,
  }));

  hints.push(...tagHints);
  return hints.slice(0, limit);
}

export function searchTags(query: string, limit = 12): TagRecord[] {
  const db = getDatabaseConnection();
  const normalizedQuery = normalizeTagSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const likeQuery = `%${normalizedQuery}%`;
  const prefixQuery = `${normalizedQuery}%`;

  return db
    .prepare(
      `${createEffectiveTagFilesCte()}
       SELECT
        tags.id,
        tag_styles.name AS styleName,
        tags.namespace,
        tags.name,
        tags.display_name AS displayName,
        COUNT(DISTINCT effective_tag_files.file_id) AS fileCount
       FROM tags
       JOIN tag_styles ON tag_styles.id = tags.style_id
       LEFT JOIN effective_tag_files ON effective_tag_files.tag_id = tags.id
       LEFT JOIN tag_siblings AS alias_siblings
         ON alias_siblings.canonical_tag_id = tags.id
       LEFT JOIN tags AS alias_tags
         ON alias_tags.id = alias_siblings.alias_tag_id
       LEFT JOIN tag_siblings AS canonical_siblings
         ON canonical_siblings.alias_tag_id = tags.id
       LEFT JOIN tags AS canonical_tags
         ON canonical_tags.id = canonical_siblings.canonical_tag_id
       LEFT JOIN tag_parents AS parent_relations
         ON parent_relations.child_tag_id = tags.id
       LEFT JOIN tags AS parent_tags
         ON parent_tags.id = parent_relations.parent_tag_id
       LEFT JOIN tag_parents AS child_relations
         ON child_relations.parent_tag_id = tags.id
       LEFT JOIN tags AS child_tags
         ON child_tags.id = child_relations.child_tag_id
       WHERE lower(tags.name) LIKE ?
          OR lower(tags.namespace || ':' || tags.name) LIKE ?
          OR lower(coalesce(tags.display_name, '')) LIKE ?
          OR lower(alias_tags.name) LIKE ?
          OR lower(alias_tags.namespace || ':' || alias_tags.name) LIKE ?
          OR lower(coalesce(alias_tags.display_name, '')) LIKE ?
          OR lower(canonical_tags.name) LIKE ?
          OR lower(canonical_tags.namespace || ':' || canonical_tags.name) LIKE ?
          OR lower(coalesce(canonical_tags.display_name, '')) LIKE ?
          OR lower(parent_tags.name) LIKE ?
          OR lower(parent_tags.namespace || ':' || parent_tags.name) LIKE ?
          OR lower(coalesce(parent_tags.display_name, '')) LIKE ?
          OR lower(child_tags.name) LIKE ?
          OR lower(child_tags.namespace || ':' || child_tags.name) LIKE ?
          OR lower(coalesce(child_tags.display_name, '')) LIKE ?
       GROUP BY tags.id
       ORDER BY
        CASE
          WHEN lower(tags.namespace || ':' || tags.name) LIKE ? THEN 0
          WHEN lower(tags.name) LIKE ? THEN 1
          WHEN lower(alias_tags.namespace || ':' || alias_tags.name) LIKE ? THEN 2
          WHEN lower(alias_tags.name) LIKE ? THEN 3
          WHEN lower(canonical_tags.namespace || ':' || canonical_tags.name) LIKE ? THEN 4
          WHEN lower(canonical_tags.name) LIKE ? THEN 5
          WHEN lower(parent_tags.namespace || ':' || parent_tags.name) LIKE ? THEN 6
          WHEN lower(parent_tags.name) LIKE ? THEN 7
          WHEN lower(child_tags.namespace || ':' || child_tags.name) LIKE ? THEN 8
          WHEN lower(child_tags.name) LIKE ? THEN 9
          ELSE 10
        END,
        tag_styles.is_default DESC,
        fileCount DESC,
        tags.namespace ASC,
        tags.name ASC
       LIMIT ?`,
    )
    .all(
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      prefixQuery,
      limit,
    ) as TagRecord[];
}

function createSearchTokenFilesCte(): string {
  return `${createEffectiveTagFilesCte()},
  search_token_files(file_id, search_key) AS (
    SELECT effective_tag_files.file_id, lower(tags.name)
    FROM effective_tag_files
    JOIN tags ON tags.id = effective_tag_files.tag_id
    UNION
    SELECT effective_tag_files.file_id, lower(tags.namespace || ':' || tags.name)
    FROM effective_tag_files
    JOIN tags ON tags.id = effective_tag_files.tag_id
    WHERE tags.namespace <> ''
    UNION
    SELECT effective_tag_files.file_id, lower(canonical_tags.name)
    FROM effective_tag_files
    JOIN tag_siblings ON tag_siblings.alias_tag_id = effective_tag_files.tag_id
    JOIN tags AS canonical_tags ON canonical_tags.id = tag_siblings.canonical_tag_id
    UNION
    SELECT effective_tag_files.file_id, lower(canonical_tags.namespace || ':' || canonical_tags.name)
    FROM effective_tag_files
    JOIN tag_siblings ON tag_siblings.alias_tag_id = effective_tag_files.tag_id
    JOIN tags AS canonical_tags ON canonical_tags.id = tag_siblings.canonical_tag_id
    WHERE canonical_tags.namespace <> ''
    UNION
    SELECT effective_tag_files.file_id, lower(alias_tags.name)
    FROM effective_tag_files
    JOIN tag_siblings ON tag_siblings.canonical_tag_id = effective_tag_files.tag_id
    JOIN tags AS alias_tags ON alias_tags.id = tag_siblings.alias_tag_id
    UNION
    SELECT effective_tag_files.file_id, lower(alias_tags.namespace || ':' || alias_tags.name)
    FROM effective_tag_files
    JOIN tag_siblings ON tag_siblings.canonical_tag_id = effective_tag_files.tag_id
    JOIN tags AS alias_tags ON alias_tags.id = tag_siblings.alias_tag_id
    WHERE alias_tags.namespace <> ''
    UNION
    SELECT files.id, '喜欢'
    FROM files
    WHERE files.deleted_at IS NULL AND files.is_favorite = 1
    UNION
    SELECT files.id, '收藏'
    FROM files
    WHERE files.deleted_at IS NULL AND files.is_favorite = 1
    UNION
    SELECT files.id, '我的收藏'
    FROM files
    WHERE files.deleted_at IS NULL AND files.is_favorite = 1
    UNION
    SELECT files.id, 'favorite'
    FROM files
    WHERE files.deleted_at IS NULL AND files.is_favorite = 1
    UNION
    SELECT files.id, 'domain:' || files.domain
    FROM files
    WHERE files.deleted_at IS NULL
    UNION
    SELECT files.id, CASE files.domain
      WHEN 'library' THEN '已在库中'
      WHEN 'pending' THEN '待入库'
      ELSE files.domain
    END
    FROM files
    WHERE files.deleted_at IS NULL
    UNION
    SELECT files.id, CASE files.domain
      WHEN 'library' THEN 'in library'
      WHEN 'pending' THEN 'pending'
      ELSE files.domain
    END
    FROM files
    WHERE files.deleted_at IS NULL
    UNION
    SELECT files.id, 'library'
    FROM files
    WHERE files.deleted_at IS NULL AND files.domain = 'library'
    UNION
    SELECT file_ratings.file_id, '@rating:' || rating_entries.id
    FROM file_ratings
    JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
    JOIN files ON files.id = file_ratings.file_id
    WHERE files.deleted_at IS NULL
    UNION
    SELECT file_ratings.file_id, lower(rating_entries.label)
    FROM file_ratings
    JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
    JOIN files ON files.id = file_ratings.file_id
    WHERE files.deleted_at IS NULL
    UNION
    SELECT file_ratings.file_id, lower(rating_groups.name || ':' || rating_entries.label)
    FROM file_ratings
    JOIN rating_entries ON rating_entries.id = file_ratings.entry_id
    JOIN rating_groups ON rating_groups.id = rating_entries.group_id
    JOIN files ON files.id = file_ratings.file_id
    WHERE files.deleted_at IS NULL
  )`;
}

function createMatchedFilesCte(query: string): MatchedFilesCte | null {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      cte: `WITH matched_files(file_id) AS (
        SELECT id FROM files WHERE deleted_at IS NULL
      )`,
      params: [],
    };
  }

  const tokens = tokenizeSearchQuery(normalizedQuery, normalizeTagPart);

  if (tokens.length === 0) {
    return {
      cte: `WITH matched_files(file_id) AS (
        SELECT id FROM files WHERE deleted_at IS NULL
      )`,
      params: [],
    };
  }

  const ast = parseSearchExpression(tokens);

  if (!ast) {
    return null;
  }

  const compiled = compileSearchNode(ast);

  return {
    cte: `${createSearchTokenFilesCte()},
      matched_files(file_id) AS (${compiled.sql})`,
    params: compiled.params,
  };
}

function createNamespaceGroupId(
  namespace: string,
  value: string | null,
): string {
  return value === null ? `${namespace}\u001f__missing__` : `${namespace}\u001f${value}`;
}

function compileSearchNode(node: SearchNode): CompiledSearchSql {
  if (node.kind === "tag") {
    return {
      sql: "SELECT file_id FROM search_token_files WHERE search_key = ?",
      params: [normalizeTagPart(node.value)],
    };
  }

  // SQLite gives INTERSECT higher precedence than UNION/EXCEPT and evaluates
  // compound operators left to right, so every compound operand must be
  // isolated behind its own subquery before being combined.
  if (node.kind === "not") {
    const compiled = compileSearchNode(node.node);
    return {
      sql: `SELECT id AS file_id FROM files WHERE deleted_at IS NULL EXCEPT SELECT file_id FROM (${compiled.sql})`,
      params: compiled.params,
    };
  }

  const left = compileSearchNode(node.left);
  const right = compileSearchNode(node.right);
  const operator = node.kind === "and" ? "INTERSECT" : "UNION";

  return {
    sql: `SELECT file_id FROM (${left.sql}) ${operator} SELECT file_id FROM (${right.sql})`,
    params: [...left.params, ...right.params],
  };
}

function normalizeBrowserPage(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeBrowserPageSize(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 100;
}

function createBrowserFileSortSql(request: BrowserSearchPageRequest): string {
  const column =
    request.sortKey === "updatedAt" ? "files.updated_at" : "files.imported_at";
  const direction = request.sortDirection === "asc" ? "ASC" : "DESC";

  return `${column} ${direction}`;
}
