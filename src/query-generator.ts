import { Constraint, Table, type Field } from "./migrations";

export class QueryGenerator {
  private static getFieldConstraints(field: Field) {
    const constraints = field.constraints;
    if (!constraints) return "";
    const parts: string[] = [];
    if (constraints & Constraint.PRIMARY_KEY) parts.push("PRIMARY KEY");
    if (constraints & Constraint.NOT_NULL) parts.push("NOT NULL");
    if (constraints & Constraint.UNIQUE) parts.push("UNIQUE");
    return parts.join(" ");
  }

  private static generateFieldSQL(field: Field) {
    const fieldType = field.type === "int" ? "INTEGER" : field.type;
    const constraints = this.getFieldConstraints(field);
    if (!constraints) return `${field.name} ${fieldType}`;
    return `${field.name} ${fieldType} ${constraints}`;
  }

  public static createTable(table: Table) {
    const fields = Array.from(table.fields);
    if (fields.length === 0)
      throw new Error("can not create a table with no fields");
    const fieldsSQL = fields.map((field) => this.generateFieldSQL(field));
    if (table.foreignKeys) {
      const fkSQL = [...table.foreignKeys].map((fk) => fk.SQL());
      fieldsSQL.push(...fkSQL);
    }
    const query = `CREATE TABLE IF NOT EXISTS ${table.name}(${fieldsSQL.join(",\n")});`;
    return query;
  }

  public static updateTable(table: Table) {}

  // simple and effective >:)
  public static dropTable(name: string) {
    return `DROP TABLE ${name};`;
  }
}
