// better-sqlite3 is compiled against the Electron ABI, so it cannot be loaded
// from plain Node test runs. Production code only constructs it inside
// database.ts (never imported by tests); everything else takes the connection
// from db/connection.ts, where tests inject a node:sqlite adapter instead.
export default class Database {
  constructor() {
    throw new Error(
      "better-sqlite3 is not available in unit tests; use tests/helpers/testDb.ts",
    );
  }
}
