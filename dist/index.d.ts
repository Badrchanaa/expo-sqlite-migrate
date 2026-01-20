import { Database } from "sqlite3";
import { SQLiteDatabase } from "expo-sqlite";

//#region src/migrations.d.ts
type FieldType = "int" | `varchar(${number})` | "text" | "float";
declare const enum Constraint {
  NONE = 0,
  PRIMARY_KEY = 2,
  UNIQUE = 4,
  NOT_NULL = 8,
}
interface Field {
  name: string;
  type: FieldType;
  constraints?: Constraint;
}
type ReferentialAction = "CASCADE" | "SET NULL" | "RESTRICT";
type ForeignKeyOptions = {
  deferred?: boolean;
} & ({
  onDelete: ReferentialAction;
  onUpdate?: ReferentialAction;
} | {
  onDelete?: ReferentialAction;
  onUpdate: ReferentialAction;
});
/**
 * Drop a database table
 *
 * [Use with caution:] this permanently removes the database table and its data.
 * @param tableName - database table to drop
 */
declare function DropTable(tableName: string): string;
declare class ForeignKey {
  private readonly refTable;
  private readonly references;
  private readonly onUpdate?;
  private readonly onDelete?;
  private readonly deferred;
  constructor(refTable: string, references: Record<string, string>, onUpdate?: ReferentialAction | undefined, onDelete?: ReferentialAction | undefined, deferred?: boolean);
  SQL(): string;
}
declare class Table {
  private fieldsMap;
  private hasPk;
  name: string;
  private _foreignKeys;
  constructor(tableName: string);
  private get fieldNames();
  addField(name: string, type: FieldType, constraints?: Constraint): this;
  addForeignKey(refTable: string | Table, references: Readonly<Record<string, string>>, options?: Readonly<ForeignKeyOptions>): this;
  get foreignKeys(): MapIterator<ForeignKey>;
  get fields(): MapIterator<Field>;
  create(): string;
  update(): string;
  private validateTableName;
}
interface Migration {
  id: string;
  up: () => string[];
  down: () => string[];
}
//#endregion
//#region src/types.d.ts
interface DBMap {
  "expo-sqlite": SQLiteDatabase;
  sqlite3: Database;
}
type DBTypeLiteral = keyof DBMap;
//#endregion
//#region src/migrator.d.ts
declare const enum MigrationStatus {
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
declare class Migrator {
  private _db;
  private appliedMigrations;
  private constructor();
  static create(db: any, type: DBTypeLiteral): Promise<Migrator>;
  initMigrationTable(): Promise<void>;
  getMigrationRecord(migrationId: string): Promise<MigrationRecord | null>;
  /**
   * Applies a single migration to the database.
   *
   * @param migration - The migration object containing SQL statements and metadata.
   * @param migrationRecord - The record of the migration in the database, or null if none.
   * @returns `true` if the migration was applied successfully, `false` otherwise.
   */
  private applyMigration;
  validateMigrations(migrations: Migration[]): void;
  /**
   * Apply and track list of migrations.
   *
   * Note: if a migration fails, all subsequent migrations will not be applied.
   *
   * @param migrations - A list of migrations
   * @returns A list of successfully applied migrations
   *
   */
  migrate(migrations: Migration[]): Promise<string[]>;
  rollback(): Promise<string | null>;
}
//#endregion
export { Constraint, DropTable, type Migration, Migrator, Table };
//# sourceMappingURL=index.d.ts.map