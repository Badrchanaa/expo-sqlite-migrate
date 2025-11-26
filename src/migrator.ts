import type { Migration } from "./migrations";
import { Adapter } from "./adapter";

const enum MigrationStatus {
  REGISTERED = 0,
  APPLIED = 1,
  FAILED = 2,
}

type MigrationRecord = {
  id: string;
  status: MigrationStatus;
};

import { SQLiteDatabase } from "expo-sqlite";

export class Migrator {
  private _db: Adapter;
  constructor(db: SQLiteDatabase) {
    this._db = new Adapter(db);
    this.initMigrationTable();
  }

  // creates the migrations table if it does not exist
  async initMigrationTable() {
    await this._db.exec(`
CREATE TABLE IF NOT EXISTS migrations(
	id TEXT NOT NULL UNIQUE,
	status INTEGER DEFAULT 0,
	PRIMARY KEY(id)
) WITHOUT ROWID;
`);
  }

  async checkMigration(migrationId: string) {
    const migration = await this._db.getFirst<MigrationRecord>(
      `SELECT id, status FROM migrations WHERE id = ?`,
      migrationId,
    );
    return migration;
  }

  /**
   * Applies a single migration to the database.
   *
   * @param migration - The migration object containing SQL statements and metadata.
   * @param migrationRecord - The record of the migration in the database, or null if none.
   * @returns `true` if the migration was applied successfully, `false` otherwise.
   */
  private async applyMigration(
    migration: Migration,
    migrationRecord: MigrationRecord | null,
  ): Promise<boolean> {
    if (!migrationRecord)
      await this._db.exec(
        `INSERT INTO migrations (id, status) values (${migration.id}, ${MigrationStatus.REGISTERED});`,
      );
    else {
      if (migrationRecord.status === MigrationStatus.APPLIED) return true;
      if (migrationRecord.status === MigrationStatus.FAILED)
        console.log("Retrying failed migration " + migrationRecord.id);
      if (migrationRecord.status === MigrationStatus.REGISTERED)
        console.warn("migration already registered " + migrationRecord.id);
    }
    try {
      const query = migration.up();
      this._db.exec(query);
      this._db.exec(
        `UPDATE migrations (status) values (${MigrationStatus.APPLIED}) WHERE id = ${migration.id}`,
      );
      return true;
    } catch (e) {
      if (e instanceof Error)
        console.log("migration failed with error:", e.message);
      this._db.exec(
        `UPDATE migrations (status) values (${MigrationStatus.FAILED}) WHERE id = ${migration.id}`,
      );
      return false;
    }
  }

  async migrate(migrations: Migration[]) {
    // check for migrations with the same id
    migrations.forEach((migration) => {
      const processedMigrations = new Set();
      if (processedMigrations.has(migration.id))
        throw new Error("migrations cannot have same ID");
      processedMigrations.add(migration.id);
    });
    const migrated: string[] = [];

    for (const migration of migrations) {
      try {
        const migrationRecord = await this.checkMigration(migration.id);
        if (!this.applyMigration(migration, migrationRecord)) {
          console.error(`migration ${migration.id} failed. Abort`);
          break;
        }
        console.log("migration successfull");
        migrated.push(migration.id);
      } catch (e) {
        if (e instanceof Error)
          console.error("unexpected migration error:", e.message);
        break;
      }
    }
    return migrated;
  }
}
