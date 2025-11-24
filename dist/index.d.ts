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
declare class Table {
  private fieldNames;
  private _fields;
  name: string;
  constructor(tableName: string);
  addField(name: string, type: FieldType, constraints?: Constraint): this;
  get fields(): Field[];
  create(): string;
  update(): string;
  drop(): string;
}
interface Migration {
  id: string;
  up: () => string;
  down: () => string;
}
//#endregion
export { type Migration, Table };
//# sourceMappingURL=index.d.ts.map