import { QueryGenerator } from "./query-generator";

export type FieldType = "int" | `varchar(${number})` | "text" | "float";

export const enum Constraint {
  NONE = 0,
  // Rowid alias
  PRIMARY_KEY = 2,
  UNIQUE = 4,
  NOT_NULL = 8,
}

export interface Field {
  name: string;
  type: FieldType;
  constraints?: Constraint;
}

export type ReferentialAction = "CASCADE" | "SET NULL" | "RESTRICT";

export type ForeignKeyOptions = { deferred?: boolean } & (
  | {
      onDelete: ReferentialAction;
      onUpdate?: ReferentialAction;
    }
  | {
      onDelete?: ReferentialAction;
      onUpdate: ReferentialAction;
    }
);

/**
 * Drop a database table
 *
 * [Use with caution:] this permanently removes the database table and its data.
 * @param tableName - database table to drop
 */
export function DropTable(tableName: string) {
  return QueryGenerator.dropTable(tableName);
}

export class ForeignKey {
  constructor(
    private readonly refTable: string,
    private readonly references: Record<string, string>,
    private readonly onUpdate?: ReferentialAction,
    private readonly onDelete?: ReferentialAction,
    private readonly deferred: boolean = false,
  ) {}

  SQL(): string {
    const entries = Object.entries(this.references);
    const childKey = entries.map(([col]) => `"${col}"`).join(", ");
    const parentKey = entries.map(([, refCol]) => `"${refCol}"`).join(", ");
    const parts = [
      `FOREIGN KEY(${childKey}) REFERENCES ${this.refTable}(${parentKey})`,
    ];
    if (this.onUpdate) parts.push(`ON UPDATE ${this.onUpdate}`);
    if (this.onDelete) parts.push(`ON DELETE ${this.onDelete}`);
    if (this.deferred) parts.push("DEFERRABLE INITIALLY DEFERRED");
    return parts.join(" ");
  }
}

export class Table {
  private fieldsMap: Map<string, Field> = new Map();
  private hasPk: boolean = false;
  public name: string;
  private _foreignKeys: Map<string, ForeignKey> = new Map();

  constructor(tableName: string) {
    this.validateTableName(tableName);
    this.name = tableName.toLowerCase();
  }

  private get fieldNames() {
    return this.fieldsMap.keys();
  }

  addField(name: string, type: FieldType, constraints: Constraint = 0) {
    name = name.toLowerCase();
    if (this.fieldsMap.has(name))
      throw new Error(`table fields can not have the same name ${name}`);
    const isPk = constraints & Constraint.PRIMARY_KEY;
    if (isPk && this.hasPk)
      throw new Error(`table cannot have more than one primary key`);
    if (isPk) this.hasPk = true;
    this.fieldsMap.set(name, { name, type, constraints });
    return this;
  }

  addForeignKey(
    refTable: string | Table,
    references: Readonly<Record<string, string>>,
    options?: Readonly<ForeignKeyOptions>,
  ) {
    const tableName = (
      refTable instanceof Table ? refTable.name : refTable
    ).toLowerCase();
    const sortedEntries = Object.entries(references).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    // child keys
    const columns = new Set(sortedEntries.map(([col]) => col.toLowerCase()));
    // parent keys
    const refColumns = new Set(
      sortedEntries.map(([, refCol]) => refCol.toLowerCase()),
    );

    if (sortedEntries.length === 0)
      throw new Error("Foreign key must reference at least one column");
    if (
      refTable instanceof Table &&
      refColumns.difference(new Set(refTable.fieldNames)).size !== 0
    ) {
      throw new Error(
        "Foreign key referenced column(s) does not exist on referenced table",
      );
    }
    if (columns.difference(new Set(this.fieldNames)).size !== 0) {
      throw new Error("Foreign key column(s) does not exist on table");
    }
    const fk = new ForeignKey(
      tableName,
      references,
      options?.onUpdate,
      options?.onDelete,
      options?.deferred ?? false,
    );
    let key = tableName + "\0";
    for (const [col, refCol] of sortedEntries) {
      key += `\0${col.toLowerCase()}:\0${refCol.toLowerCase()}`;
    }
    if (this._foreignKeys.has(key)) {
      throw new Error("Foreign key already exists");
    }
    this._foreignKeys.set(key, fk);
  }

  get foreignKeys() {
    return this._foreignKeys.values();
  }

  get fields() {
    return this.fieldsMap.values();
  }

  create(): string {
    return QueryGenerator.createTable(this);
  }

  update(): string {
    return "";
  }

  private validateTableName(name: string) {
    if (name.length === 0) throw new Error("Invalid empty table name");
    // Regex to detect fully quoted names: "name", `name`, [name]
    const quotedMatch = name.match(/^["`\[](.+)["`\]]$/);

    if (quotedMatch) {
      // check that inner content does not contain the quote type
      const inner = quotedMatch[1]!;
      if (inner.includes(name[0] === "[" ? "]" : name[0]!)) {
        throw new Error(
          "Invalid table name: inner content contains quote character",
        );
      }
      return; // valid quoted name
    }

    // unquoted names: must start with letter or underscore, followed by letters/digits/underscores
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(
        "Invalid table name: unquoted table name can only contain alphanumeric and underscore characters",
      );
    }
  }
}

export interface Migration {
  id: string;
  up: () => string[];
  down: () => string[];
}
