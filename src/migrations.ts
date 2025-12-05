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

export class Table {
  private fieldNames: Set<string>;
  private _fields: Field[];
  public name: string;

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
      return; // valid fully quoted name
    }

    // unquoted names: must start with letter or underscore, followed by letters/digits/underscores
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(
        "Invalid table name: unquoted table name can only contain alphanumeric and underscore characters",
      );
    }
  }

  constructor(tableName: string) {
    this.validateTableName(tableName);
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
