import type { Migration } from "./migrations";
import { InvalidMigrationError } from "./error";
import type { DBAdapter } from "./adapters/BaseAdapter";
import { Sqlite3Adapter } from "./adapters/Sqlite3Adapter";
import { ExpoAdapter } from "./adapters/ExpoAdapter";

// TODO: add rollback status
export const enum MigrationStatus {
  REGISTERED = 0,
  APPLIED = 1,
  ROLLBACK = 2,
  FAILED = 3,
}

type MigrationRecord = {
  id: string;
  status: MigrationStatus;
  created_at: Date;
  updated_at: Date;
};

type DBMigrationRecord = Omit<MigrationRecord, "created_at" | "updated_at"> & {
  created_at: number;
  updated_at: number;
};

type DBTypeLiteral = "expo-sqlite" | "sqlite3";

export class Migrator {
  private _db: DBAdapter;
  private appliedMigrations: Map<string, Migration> = new Map();
  private constructor(db: any, type: DBTypeLiteral) {
    if (type == "sqlite3") this._db = new Sqlite3Adapter(db);
    else if (type == "expo-sqlite") this._db = new ExpoAdapter(db);
    else throw new Error("invalid database type literal");
  }

  static async create(db: any, type: DBTypeLiteral) {
    const migrator = new Migrator(db, type);
    await migrator.initMigrationTable();
    return migrator;
  }

  async initMigrationTable() {
    await this._db.transaction([
      `
  CREATE TABLE IF NOT EXISTS migrations(
    id TEXT NOT NULL UNIQUE,
    status INTEGER DEFAULT ${MigrationStatus.REGISTERED},
    created_at INTEGER DEFAULT (strftime('%f','now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%f','now') * 1000),
    PRIMARY KEY(id)
  ) WITHOUT ROWID;
  `,
      `
  CREATE TRIGGER IF NOT EXISTS migrations_updated_at
  AFTER UPDATE ON migrations
  FOR EACH ROW
  BEGIN
      UPDATE migrations
      SET updated_at = CAST(strftime('%f','now') * 1000 AS INTEGER)
      WHERE id = OLD.id;
  END;
  `,
      `
  CREATE INDEX IF NOT EXISTS applied_index ON migrations(status) WHERE status=${MigrationStatus.APPLIED};
  `,
    ]);
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
    console.log("start:");
    if (!migrationRecord)
      await this._db.run(
        `INSERT INTO migrations (id, status) values ("${migration.id}", ${MigrationStatus.REGISTERED});`,
      );
    else {
      if (migrationRecord.status === MigrationStatus.APPLIED) return true;
      if (migrationRecord.status === MigrationStatus.FAILED)
        console.log("Retrying failed migration " + migrationRecord.id);
      if (migrationRecord.status === MigrationStatus.REGISTERED)
        console.warn("migration already registered " + migrationRecord.id);
    }
    console.log("end:");
    try {
      const queries = migration.up();
      await this._db.transaction(queries);
      await this._db.run(
        `UPDATE migrations SET status = ${MigrationStatus.APPLIED} WHERE id = "${migration.id}"`,
      );
      return true;
    } catch (e) {
      if (e instanceof Error)
        console.log("migration failed with error:", e.message);
      await this._db.run(
        `UPDATE migrations SET status = ${MigrationStatus.FAILED} WHERE id = "${migration.id}"`,
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

  /**
   * Apply and track list of migrations.
   *
   * Note: if a migration fails, all subsequent migrations will not be applied.
   *
   * @param migrations - A list of migrations
   * @returns A list of successfully applied migrations
   *
   */
  async migrate(migrations: Migration[]) {
    const migrated: string[] = [];

    try {
      this.validateMigrations(migrations);
      for (const migration of migrations) {
        const migrationRecord = await this.getMigrationRecord(migration.id);
        if (!(await this.applyMigration(migration, migrationRecord))) {
          //console.error(`migration ${migration.id} failed. Abort`);
          break;
        }
        console.log("migration successful");
        this.appliedMigrations.set(migration.id, migration);
        migrated.push(migration.id);
      }
    } catch (e) {
      if (e instanceof InvalidMigrationError)
        console.error("Invalid migration:", e);
      throw e;
      // if (e instanceof Error)
      // console.error("unexpected migration error:", e.message);
    }

    return migrated;
  }

  async rollback() {
    const DBRecord = await this._db.getFirst<DBMigrationRecord>(
      `SELECT * FROM migrations WHERE status=${MigrationStatus.APPLIED} ORDER BY updated_at DESC LIMIT 1`,
    );
    if (!DBRecord) {
      console.warn("no current applied migration");
      return null;
    }
    const appliedMigration: MigrationRecord = {
      ...DBRecord,
      created_at: new Date(DBRecord.created_at),
      updated_at: new Date(DBRecord.updated_at),
    };
    const migration = this.appliedMigrations.get(appliedMigration.id);
    if (!migration) {
      throw new Error(
        `Applied migration ${appliedMigration.id} has no code definition`,
      );
    }
    const downQueries = migration.down();
    const queries = [
      ...downQueries,
      `UPDATE migrations SET status=${MigrationStatus.ROLLBACK} WHERE id='${migration.id}'`,
    ];
    await this._db.transaction(queries);
    return migration.id;
  }
}
