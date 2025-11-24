import { QueryGenerator } from "./query-generator";

type FieldType = "int" | `varchar(${number})` | "text" | "float";

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

export class Table {
  private fieldNames: Set<string>;
  private _fields: Field[];
  public name: string;

  constructor(tableName: string) {
    this.name = tableName;
    this.fieldNames = new Set();
    this._fields = new Array();
  }
  addField(name: string, type: FieldType, constraints: Constraint = 0) {
    if (this.fieldNames.has(name))
      throw new Error(`table already has field ${name}`);
    this._fields.push({ name, type, constraints });
    this.fieldNames.add(name);
    return this;
  }
  get fields(): Field[] {
    return this._fields;
  }
  create(): string {
    return QueryGenerator.createTable(this);
  }
  update(): string {
    return "";
  }
  drop(): string {
    return "";
  }
}

export interface Migration {
  id: string;
  up: () => string;
  down: () => string;
}

class MigrationManager {
  private migrations: Map<string, Migration>;
  constructor(migrations: Migration[]) {
    this.migrations = new Map();
    migrations.forEach((migration) => {
      if (this.migrations.has(migration.id))
        throw new Error("migrations cannot have same ID");
      this.migrations.set(migration.id, migration);
    });
  }
}
