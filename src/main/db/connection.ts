import Database from "better-sqlite3";

let database: Database.Database | undefined;
let databasePath = "";

export function setDatabaseConnection(
  nextDatabase: Database.Database,
  nextDatabasePath: string,
): void {
  database = nextDatabase;
  databasePath = nextDatabasePath;
}

export function closeDatabaseConnection(): void {
  database?.close();
  database = undefined;
  databasePath = "";
}

export function getDatabaseConnection(): Database.Database {
  if (!database) {
    throw new Error("Database has not been initialized.");
  }

  return database;
}

export function getDatabasePath(): string {
  return databasePath;
}
