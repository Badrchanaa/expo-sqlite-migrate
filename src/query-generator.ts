import { Constraint, Table } from "./migrations";
import type { Field, FieldType } from "./migrations";

export class QueryGenerator {
  private static getFieldConstraints(field: Field) {
    const constraints = field.constraints;
    let constraintsStr = "";
    if (!constraints) return "";
    if (constraints & Constraint.UNIQUE) constraintsStr += "UNIQUE ";
    if (constraints & Constraint.PRIMARY_KEY) constraintsStr += "PRIMARY KEY ";
    if (constraints & Constraint.NOT_NULL) constraintsStr += "NOT NULL ";
    return constraintsStr.trim();
  }

  private static generateFieldQuery(field: Field) {
    // NOTE: Validation is handled by typescript
    const ftypeStr = field.type === "int" ? "INTEGER" : field.type;
    return `${field.name} ${ftypeStr} ${this.getFieldConstraints(field)}`;
  }

  public static createTable(table: Table) {
    const fieldsQuery = table.fields
      .map((field) => {
        return this.generateFieldQuery(field);
      })
      .join(",\n");
    const query = `CREATE TABLE IF NOT EXISTS ${table.name}(
${fieldsQuery}
);`;
    return query;
  }

  public static updateTable(table: Table) {}

  public static dropTable(table: Table) {}
}
