import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run under plain Node, while better-sqlite3 is rebuilt for the
// Electron ABI and electron itself cannot load outside an Electron process.
// Both are replaced with stubs; database tests run on node:sqlite through a
// small adapter instead (see tests/helpers/testDb.ts).
export default defineConfig({
  resolve: {
    alias: {
      electron: fileURLToPath(new URL("./tests/stubs/electron.ts", import.meta.url)),
      "better-sqlite3": fileURLToPath(
        new URL("./tests/stubs/betterSqlite3.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
