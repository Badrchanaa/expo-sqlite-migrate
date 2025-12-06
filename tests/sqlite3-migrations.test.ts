import { Database } from "sqlite3";
import { describe, expect, it } from "vitest";
import { MigrationStatus, Migrator } from "../src/migrator";
import { promisify } from "../src/utils/promisify";
import { Table } from "../src";
import { Constraint, DropTable } from "../src/migrations";

describe("sqlite3 adapter tests", () => {
  const db = new Database(":memory:");
  const migrator = new Migrator(db, "sqlite3");
  const dbGet = promisify<any>(db.get, db);
  const dbAll = promisify<any>(db.all, db);
  it("creates migrations table", async () => {
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='migrations'",
    );
    expect(res).toHaveProperty("type", "table");
    expect(res).toHaveProperty("name", "migrations");
  });
  it("should have the correct columns", async () => {
    const columns: { name: string }[] = await dbAll(
      "PRAGMA table_info(migrations);",
    );
    expect(columns.map((c) => c.name)).toContain("id");
    expect(columns.map((c) => c.name)).toContain("status");
  });
  it("handles migrations failure", async () => {
    await expect(
      migrator.migrate([
        {
          id: "test-table",
          up: () => new Table("test_table").create(),
          down: () => "",
        },
      ]),
    ).resolves.toEqual([]);
    const res = await dbGet(
      `SELECT * FROM migrations WHERE id='test-table' AND status=${MigrationStatus.FAILED}`,
    );
    expect(res).toHaveProperty("id", "test-table");
  });
  it("migrates a previously invalid migration", async () => {
    await expect(
      migrator.migrate([
        {
          id: "test-table",
          up: () =>
            new Table("test_table")
              .addField("test_column", "text", Constraint.NOT_NULL)
              .create(),
          down: () => "",
        },
      ]),
    ).resolves.toEqual(["test-table"]);
    const res = await dbGet(
      `SELECT * FROM migrations WHERE id='test-table' AND status=${MigrationStatus.APPLIED}`,
    );
    expect(res).toHaveProperty("id", "test-table");
  });
  it("should not create table with more than one primary key", async () => {
    const migrationID = "TEST-PRIMARY-KEY";
    await expect(
      migrator.migrate([
        {
          id: migrationID,
          up: () =>
            new Table("test_table")
              .addField("test_column", "text", Constraint.PRIMARY_KEY)
              .addField("test_column2", "text", Constraint.PRIMARY_KEY)
              .create(),
          down: () => DropTable("test_table"),
        },
      ]),
    ).resolves.toEqual([]);
    const res = await dbGet(
      `SELECT * FROM migrations WHERE id='${migrationID}' and status=${MigrationStatus.FAILED};`,
    );
    expect(res).toHaveProperty("id", migrationID);
  });
});
