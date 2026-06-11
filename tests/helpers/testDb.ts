import { createRequire } from "node:module";
import type Database from "better-sqlite3";
import {
  closeDatabaseConnection,
  setDatabaseConnection,
} from "../../src/main/db/connection.js";
import { runMigrations } from "../../src/main/db/schema.js";

// vite 5's builtin-module list predates node:sqlite, so it must be loaded at
// runtime instead of through the import graph.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: never[]): unknown[];
      get(...params: never[]): unknown;
      run(...params: never[]): unknown;
    };
    close(): void;
  };
};

// Adapts node:sqlite to the subset of the better-sqlite3 API the repositories
// use (exec / prepare().all|get|run / transaction / pragma / close), so tests
// can run real SQL against the real schema without the Electron-ABI native
// module.
export function createTestDatabase(): Database.Database {
  const db = new DatabaseSync(":memory:");
  const wrapper = {
    exec(sql: string): void {
      db.exec(sql);
    },
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        all: (...params: unknown[]) =>
          statement.all(...(params as never[])) as unknown[],
        get: (...params: unknown[]) =>
          statement.get(...(params as never[])) as unknown,
        run: (...params: unknown[]) => statement.run(...(params as never[])),
      };
    },
    transaction(fn: (...args: unknown[]) => unknown) {
      return (...args: unknown[]): unknown => {
        wrapper.exec("BEGIN");
        try {
          const result = fn(...args);
          wrapper.exec("COMMIT");
          return result;
        } catch (error) {
          wrapper.exec("ROLLBACK");
          throw error;
        }
      };
    },
    pragma(text: string, options?: { simple?: boolean }): unknown {
      if (text.includes("=")) {
        db.exec(`PRAGMA ${text}`);
        return undefined;
      }

      const rows = db.prepare(`PRAGMA ${text}`).all() as Array<
        Record<string, unknown>
      >;

      if (options?.simple) {
        const first = rows[0];
        return first ? Object.values(first)[0] : undefined;
      }

      return rows;
    },
    close(): void {
      db.close();
    },
  };

  return wrapper as unknown as Database.Database;
}

export function setupTestDatabase(): Database.Database {
  const db = createTestDatabase();

  runMigrations(db, {
    defaultFileStoragePath: "C:/asteria-test/files",
    defaultThumbnailStoragePath: "C:/asteria-test/thumbnails",
  });
  setDatabaseConnection(db, ":memory:");

  return db;
}

export function teardownTestDatabase(): void {
  closeDatabaseConnection();
}
