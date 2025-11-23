import { Constraint, Field, Table } from "./migrations";

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
    let fieldType: string;
    if (field.type === "int") {
      fieldType = "INTEGER";
    } else if (field.type.startsWith("varchar(")) {
      /*
       * sqlite doesn't impose a length limit for varchar or char column types.
       * Still it's a good practice to specify it for compatibility and clarity.
       */
      if (field.type[field.type.length - 1] !== ")")
        throw new Error("invalid type varchar");
      const varcharSize = field.type.slice("varchar(".length, -1).trim();
      if (varcharSize.length === 0 || isNaN(Number(varcharSize)))
        throw new Error("invalid varchar length in field " + field.name);
      fieldType = field.type;
    } else {
      fieldType = field.type;
    }
    return `${field.name} ${fieldType} ${this.getFieldConstraints(field)},\n`;
  }

  public static createTable(table: Table) {
    const query = `CREATE TABLE IF NOT EXISTS ${table.name}(
${table.fields}
)`;
    return query;
  }

  public static updateTable(table: Table) {}

  public static dropTable(table: Table) {}
}
