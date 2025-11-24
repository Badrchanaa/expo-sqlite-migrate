import type { Migration } from "./migrations";

export interface SQLiteClient {
  exec: (query: string) => void;
}

export class Migrator {
  private _db: SQLiteClient;
  constructor(db: SQLiteClient) {
    this._db = db;
    this.initMigrationTable();
  }

  initMigrationTable() {
    this._db.exec(`
CREATE TABLE IF NOT EXISTS migrations(
	id TEXT NOT NULL UNIQUE,
	status INTEGER DEFAULT 0,
	PRIMARY KEY(id)) WITHOUT ROWID;
`);
  }

  migrate(migrations: Migration[]) {}
}
