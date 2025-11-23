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
  get fields() {
    return this._fields;
  }
  create() {}
  update() {}
  drop() {}
}

class Migration {
  public id: string;
  private onUpCb?: CallableFunction;
  private onDownCb?: CallableFunction;
  constructor(id: string) {
    this.id = id;
  }
  up(cb: () => void) {
    this.onUpCb = cb;
    return this;
  }
  down(cb: () => void) {
    this.onDownCb = cb;
    return this;
  }
  get onUp() {
    return this.onUpCb;
  }
}

class MigrationManager {
  private migrations: Set<Migration>;
  constructor() {
    this.migrations = new Set();
  }
}

const migration = new Migration("product-table")
  .up(() => {
    return new Table("products")
      .addField("id", "int", Constraint.PRIMARY_KEY | Constraint.UNIQUE | 23)
      .addField("name", "text")
      .create();
  })
  .down(() => {
    new Table("products").drop();
  });
