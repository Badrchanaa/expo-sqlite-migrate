import type { Migration } from "./migrations";
import { InvalidMigrationError } from "./error";
import type { DBAdapter } from "./adapters/BaseAdapter";
import { Sqlite3Adapter } from "./adapters/Sqlite3Adapter";
import { ExpoAdapter } from "./adapters/ExpoAdapter";

const enum MigrationStatus {
  REGISTERED = 0,
  APPLIED = 1,
  FAILED = 2,
}

type MigrationRecord = {
  id: string;
  status: MigrationStatus;
};

type DBTypeLiteral = "expo-sqlite" | "sqlite3";

export class Migrator {
  private _db: DBAdapter;
  constructor(db: any, type: DBTypeLiteral) {
    if (type == "sqlite3") this._db = new Sqlite3Adapter(db);
    else if (type == "expo-sqlite") this._db = new ExpoAdapter(db);
    else throw new Error("invalid database type literal");

    this.initMigrationTable();
  }

  // creates the migrations table if it does not exist
  async initMigrationTable() {
    await this._db.run(`
CREATE TABLE IF NOT EXISTS migrations(
	id TEXT NOT NULL UNIQUE,
	status INTEGER DEFAULT 0,
	PRIMARY KEY(id)
) WITHOUT ROWID;
`);
  }

  async getMigrationRecord(migrationId: string) {
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
      await this._db.run(
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
      this._db.run(query);
      this._db.run(
        `UPDATE migrations (status) values (${MigrationStatus.APPLIED}) WHERE id = ${migration.id}`,
      );
      return true;
    } catch (e) {
      if (e instanceof Error)
        console.log("migration failed with error:", e.message);
      this._db.run(
        `UPDATE migrations (status) values (${MigrationStatus.FAILED}) WHERE id = ${migration.id}`,
      );
      return false;
    }
  }

  validateMigrations(migrations: Migration[]) {
    const processedMigrations = new Set();
    for (const migration of migrations) {
      if (processedMigrations.has(migration.id))
        throw new InvalidMigrationError("migrations cannot have same ID");
      processedMigrations.add(migration.id);
    }
  }

  async migrate(migrations: Migration[]) {
    const migrated: string[] = [];

    try {
      this.validateMigrations(migrations);
      for (const migration of migrations) {
        const migrationRecord = await this.getMigrationRecord(migration.id);
        if (!(await this.applyMigration(migration, migrationRecord))) {
          console.error(`migration ${migration.id} failed. Abort`);
          break;
        }
        console.log("migration successfull");
        migrated.push(migration.id);
      }
    } catch (e) {
      if (e instanceof InvalidMigrationError)
        console.error("Invalid migration:", e.message);
      if (e instanceof Error)
        console.error("unexpected migration error:", e.message);
    }

    return migrated;
  }
}
