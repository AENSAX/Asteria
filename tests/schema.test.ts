import { afterEach, describe, expect, it } from "vitest";
import { readSchemaVersion, runMigrations } from "../src/main/db/schema.js";
import {
  createTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from "./helpers/testDb.js";

const MIGRATION_PATHS = {
  defaultFileStoragePath: "C:/asteria-test/files",
  defaultThumbnailStoragePath: "C:/asteria-test/thumbnails",
};

afterEach(() => {
  teardownTestDatabase();
});

describe("runMigrations", () => {
  it("migrates an empty database to the latest schema", () => {
    const db = setupTestDatabase();
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    for (const expected of [
      "files",
      "file_tags",
      "tags",
      "tag_styles",
      "tag_parents",
      "tag_siblings",
      "rating_groups",
      "rating_entries",
      "file_ratings",
      "app_settings",
      "schema_migrations",
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it("is idempotent when run twice", () => {
    const db = createTestDatabase();

    runMigrations(db, MIGRATION_PATHS);
    const version = readSchemaVersion(db);
    expect(version).toBeGreaterThanOrEqual(11);

    runMigrations(db, MIGRATION_PATHS);
    expect(readSchemaVersion(db)).toBe(version);
  });

  it("records each migration version exactly once", () => {
    const db = setupTestDatabase();
    const versions = (
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all() as Array<{ version: number }>
    ).map((row) => row.version);

    // regression: the favorites migration used to record SCHEMA_VERSION
    // instead of 6, which made fresh databases crash on the version-11 insert
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("seeds a default tag style", () => {
    const db = setupTestDatabase();
    const row = db
      .prepare("SELECT name FROM tag_styles WHERE is_default = 1")
      .get() as { name: string } | undefined;

    expect(row?.name).toBe("default");
  });
});
