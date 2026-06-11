import type Database from "better-sqlite3";
import { createApiFileIdentifier } from "./apiFilesRepository.js";
import { FILE_DOMAIN_LIBRARY } from "./domainsRepository.js";
import { DATABASE_FILE_SELECT_COLUMNS } from "./sqlFragments.js";

const SCHEMA_VERSION = 11;
const FILE_STORAGE_SETTING_KEY = "file_storage_path";
const THUMBNAIL_STORAGE_SETTING_KEY = "thumbnail_storage_path";

export interface MigrationPaths {
  defaultFileStoragePath: string;
  defaultThumbnailStoragePath: string;
}

export function runMigrations(
  db: Database.Database,
  paths: MigrationPaths,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = readSchemaVersion(db);

  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE files (
          id INTEGER PRIMARY KEY,
          sha256 TEXT NOT NULL,
          original_path TEXT NOT NULL,
          storage_path TEXT,
          file_name TEXT NOT NULL,
          extension TEXT,
          mime_type TEXT,
          size_bytes INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          imported_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT
        );

        CREATE TABLE import_batches (
          id INTEGER PRIMARY KEY,
          source_kind TEXT NOT NULL,
          source_path TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          total_items INTEGER NOT NULL DEFAULT 0,
          imported_items INTEGER NOT NULL DEFAULT 0,
          failed_items INTEGER NOT NULL DEFAULT 0,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          finished_at TEXT
        );

        CREATE TABLE import_items (
          id INTEGER PRIMARY KEY,
          batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
          file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
          source_path TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE tags (
          id INTEGER PRIMARY KEY,
          namespace TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          display_name TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(namespace, name)
        );

        CREATE TABLE file_tags (
          file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (file_id, tag_id)
        );

        CREATE TABLE modules (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE pages (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'workspace',
          layout_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE windows (
          id INTEGER PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          module_id TEXT NOT NULL REFERENCES modules(id),
          title TEXT NOT NULL,
          state_json TEXT NOT NULL DEFAULT '{}',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX idx_files_sha256 ON files(sha256);
        CREATE INDEX idx_files_imported_at ON files(imported_at);
        CREATE INDEX idx_import_items_batch_id ON import_items(batch_id);
        CREATE INDEX idx_import_items_status ON import_items(status);
        CREATE INDEX idx_tags_namespace_name ON tags(namespace, name);
        CREATE INDEX idx_windows_page_id ON windows(page_id);
      `);

      db.prepare(
        "INSERT INTO modules (id, title, kind) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)",
      ).run(
        "file-import",
        "文件导入",
        "import",
        "library-grid",
        "图库视图",
        "browser",
        "file-detail",
        "文件详情",
        "inspector",
      );

      const pageResult = db
        .prepare(
          "INSERT INTO pages (title, kind, layout_json) VALUES (?, ?, ?)",
        )
        .run("默认工作台", "workspace", '{"direction":"horizontal"}');

      db.prepare(
        "INSERT INTO windows (page_id, module_id, title, sort_order) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
      ).run(
        pageResult.lastInsertRowid,
        "file-import",
        "文件导入",
        0,
        pageResult.lastInsertRowid,
        "library-grid",
        "图库视图",
        1,
        pageResult.lastInsertRowid,
        "file-detail",
        "详情",
        2,
      );

      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(1, "initial_schema");
    })();
  }

  if (currentVersion < 2) {
    migrateToTagStyles(db);
  }

  if (currentVersion < 3) {
    migrateToStorageSettings(db, paths);
  }

  if (currentVersion < 4) {
    migrateToFileDomains(db);
  }

  if (currentVersion < 5) {
    migrateToRatings(db);
  }

  if (currentVersion < 6) {
    migrateToFavorites(db);
  }

  if (currentVersion < 7) {
    migrateToDuplicateFileRecords(db);
  }

  if (currentVersion < 8) {
    migrateToApiServices(db);
  }

  if (currentVersion < 9) {
    migrateToApiFileIdentifiers(db);
  }

  if (currentVersion < 10) {
    migrateToTagParents(db);
  }

  if (currentVersion < 11) {
    migrateToTagSiblings(db);
  }

  ensureApiFileIdentifiersSchema(db);
  ensureTagParentsSchema(db);
  ensureTagSiblingsSchema(db);
}

export function readSchemaVersion(db: Database.Database): number {
  const row = db
    .prepare(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    )
    .get() as { version: number } | undefined;

  return row?.version ?? 0;
}

export function readTableCount(
  db: Database.Database,
  tableName: string,
): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as
    | { count: number }
    | undefined;

  return row?.count ?? 0;
}

function migrateToApiFileIdentifiers(db: Database.Database): void {
  db.transaction(() => {
    ensureApiFileIdentifiersSchema(db);
    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(9, "api_file_identifiers");
  })();
}

function ensureApiFileIdentifiersSchema(db: Database.Database): void {
  const columns = db.pragma("table_info(files)") as Array<{ name: string }>;
  const hasApiIdentifier = columns.some(
    (column) => column.name === "api_identifier",
  );

  if (!hasApiIdentifier) {
    db.exec("ALTER TABLE files ADD COLUMN api_identifier TEXT");
  }

  const rows = db
    .prepare(
      "SELECT id FROM files WHERE api_identifier IS NULL OR api_identifier = ?",
    )
    .all("") as Array<{ id: number }>;

  for (const row of rows) {
    db.prepare("UPDATE files SET api_identifier = ? WHERE id = ?").run(
      createApiFileIdentifier(),
      row.id,
    );
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_api_identifier
      ON files(api_identifier);
  `);
}

function migrateToTagParents(db: Database.Database): void {
  db.transaction(() => {
    ensureTagParentsSchema(db);
    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(10, "tag_parents");
  })();
}

function ensureTagParentsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_parents (
      child_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      parent_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (child_tag_id != parent_tag_id),
      PRIMARY KEY (child_tag_id, parent_tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tag_parents_parent_tag_id
      ON tag_parents(parent_tag_id);
  `);
}

function migrateToTagSiblings(db: Database.Database): void {
  db.transaction(() => {
    ensureTagSiblingsSchema(db);
    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(11, "tag_siblings");
  })();
}

function ensureTagSiblingsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_siblings (
      alias_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      canonical_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (alias_tag_id != canonical_tag_id),
      PRIMARY KEY (alias_tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tag_siblings_canonical_tag_id
      ON tag_siblings(canonical_tag_id);
  `);
}

function migrateToApiServices(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_services (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '127.0.0.1',
        port INTEGER NOT NULL DEFAULT 17321,
        token TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS api_service_permissions (
        service_id INTEGER NOT NULL REFERENCES api_services(id) ON DELETE CASCADE,
        permission_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (service_id, permission_id)
      );

      CREATE INDEX IF NOT EXISTS idx_api_service_permissions_service_id
        ON api_service_permissions(service_id);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(8, "api_services");
  })();
}

function migrateToTagStyles(db: Database.Database): void {
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");

  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tag_styles (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          description TEXT,
          is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_styles_default
          ON tag_styles(is_default)
          WHERE is_default = 1;

        CREATE TABLE IF NOT EXISTS tag_namespaces (
          id INTEGER PRIMARY KEY,
          style_id INTEGER NOT NULL REFERENCES tag_styles(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT '',
          display_name TEXT,
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(style_id, name)
        );

        CREATE TABLE IF NOT EXISTS file_urls (
          id INTEGER PRIMARY KEY,
          file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          normalized_url TEXT,
          source TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(file_id, url)
        );
      `);

      db.prepare(
        `INSERT OR IGNORE INTO tag_styles (name, display_name, description, is_default)
         VALUES (?, ?, ?, ?)`,
      ).run("default", "default tag style", "默认标签风格", 1);

      const defaultStyle = db
        .prepare("SELECT id FROM tag_styles WHERE name = ?")
        .get("default") as { id: number } | undefined;

      if (!defaultStyle) {
        throw new Error("Default tag style was not created.");
      }

      db.prepare(
        `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
         VALUES (?, ?, ?)`,
      ).run(defaultStyle.id, "", "无命名空间");

      db.prepare(
        `INSERT OR IGNORE INTO tag_namespaces (style_id, name, display_name)
         SELECT DISTINCT ?, namespace, CASE WHEN namespace = '' THEN ? ELSE namespace END
         FROM tags`,
      ).run(defaultStyle.id, "无命名空间");

      db.exec(`
        DROP INDEX IF EXISTS idx_tags_namespace_name;

        CREATE TABLE tags_next (
          id INTEGER PRIMARY KEY,
          style_id INTEGER NOT NULL REFERENCES tag_styles(id) ON DELETE CASCADE,
          namespace_id INTEGER REFERENCES tag_namespaces(id) ON DELETE SET NULL,
          namespace TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          display_name TEXT,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(style_id, namespace, name)
        );
      `);

      db.prepare(
        `INSERT INTO tags_next (
          id,
          style_id,
          namespace_id,
          namespace,
          name,
          display_name,
          created_at,
          updated_at
        )
        SELECT
          tags.id,
          ?,
          tag_namespaces.id,
          tags.namespace,
          tags.name,
          tags.display_name,
          tags.created_at,
          tags.created_at
        FROM tags
        LEFT JOIN tag_namespaces
          ON tag_namespaces.style_id = ?
         AND tag_namespaces.name = tags.namespace`,
      ).run(defaultStyle.id, defaultStyle.id);

      db.exec(`
        DROP TABLE tags;
        ALTER TABLE tags_next RENAME TO tags;

        CREATE INDEX IF NOT EXISTS idx_tags_style_namespace_name ON tags(style_id, namespace, name);
        CREATE INDEX IF NOT EXISTS idx_tags_namespace_id ON tags(namespace_id);
        CREATE INDEX IF NOT EXISTS idx_file_tags_tag_id ON file_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tag_namespaces_style_name ON tag_namespaces(style_id, name);
        CREATE INDEX IF NOT EXISTS idx_file_urls_file_id ON file_urls(file_id);
        CREATE INDEX IF NOT EXISTS idx_file_urls_url ON file_urls(url);
      `);

      db.prepare(
        "INSERT OR IGNORE INTO modules (id, title, kind) VALUES (?, ?, ?)",
      ).run("tag-manager", "标签管理", "tag");

      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(2, "tag_styles_and_file_urls");
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateToStorageSettings(
  db: Database.Database,
  paths: MigrationPaths,
): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    setSettingValue(db, FILE_STORAGE_SETTING_KEY, paths.defaultFileStoragePath);
    setSettingValue(
      db,
      THUMBNAIL_STORAGE_SETTING_KEY,
      paths.defaultThumbnailStoragePath,
    );

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(3, "file_storage_settings");
  })();
}

function migrateToFileDomains(db: Database.Database): void {
  db.transaction(() => {
    const columns = db.pragma("table_info(files)") as Array<{ name: string }>;
    const hasDomain = columns.some((column) => column.name === "domain");

    if (!hasDomain) {
      db.exec(`
        ALTER TABLE files
        ADD COLUMN domain TEXT NOT NULL DEFAULT 'pending';
      `);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_domain ON files(domain);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(4, "file_domains");
  })();
}

function migrateToRatings(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rating_groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS rating_entries (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES rating_groups(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#d9dde1',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS file_ratings (
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        entry_id INTEGER NOT NULL REFERENCES rating_entries(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (file_id, entry_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rating_entries_group_id ON rating_entries(group_id);
      CREATE INDEX IF NOT EXISTS idx_file_ratings_file_id ON file_ratings(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_ratings_entry_id ON file_ratings(entry_id);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(5, "ratings");
  })();
}

function migrateToFavorites(db: Database.Database): void {
  db.transaction(() => {
    const columns = db.pragma("table_info(files)") as Array<{ name: string }>;
    const hasFavorite = columns.some((column) => column.name === "is_favorite");

    if (!hasFavorite) {
      db.exec(`
        ALTER TABLE files
        ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1));
      `);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(is_favorite);
    `);

    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    ).run(6, "favorites");
  })();
}

function migrateToDuplicateFileRecords(db: Database.Database): void {
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");

  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE files_next (
          id INTEGER PRIMARY KEY,
          sha256 TEXT NOT NULL,
          original_path TEXT NOT NULL,
          storage_path TEXT,
          file_name TEXT NOT NULL,
          extension TEXT,
          mime_type TEXT,
          size_bytes INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          imported_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT,
          domain TEXT NOT NULL DEFAULT 'pending',
          is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1))
        );

        INSERT INTO files_next (
          id,
          sha256,
          original_path,
          storage_path,
          file_name,
          extension,
          mime_type,
          size_bytes,
          width,
          height,
          duration_ms,
          imported_at,
          updated_at,
          deleted_at,
          domain,
          is_favorite
        )
        SELECT
          id,
          sha256,
          original_path,
          storage_path,
          file_name,
          extension,
          mime_type,
          size_bytes,
          width,
          height,
          duration_ms,
          imported_at,
          updated_at,
          deleted_at,
          domain,
          is_favorite
        FROM files;

        DROP TABLE files;
        ALTER TABLE files_next RENAME TO files;

        CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
        CREATE INDEX IF NOT EXISTS idx_files_imported_at ON files(imported_at);
        CREATE INDEX IF NOT EXISTS idx_files_domain ON files(domain);
        CREATE INDEX IF NOT EXISTS idx_files_favorite ON files(is_favorite);
      `);

      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(7, "duplicate_file_records");
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function setSettingValue(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = datetime('now')`,
  ).run(key, value);
}
