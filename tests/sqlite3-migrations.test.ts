import { Database } from "sqlite3";
import { describe, expect, it } from "vitest";
import { MigrationStatus, Migrator } from "../src/migrator";
import { promisify } from "../src/utils/promisify";
import { Table } from "../src";
import { Constraint, DropTable } from "../src/migrations";

describe("sqlite3 adapter tests", async () => {
  const db = new Database(":memory:");
  const migrator = await Migrator.create(db, "sqlite3");
  const dbGet = promisify<any>(db.get, db);
  const dbAll = promisify<any>(db.all, db);
  it("creates migrations table", async () => {
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='migrations'",
    );
    console.log("result", res);
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
          id: "test-table-failure",
          up: () => [new Table("test_table-failure").create()],
          down: () => [],
        },
      ]),
    ).resolves.toEqual([]);
    const res = await dbGet(
      `SELECT * FROM migrations WHERE id='test-table-failure' AND status=${MigrationStatus.FAILED}`,
    );
    expect(res).toHaveProperty("id", "test-table-failure");
  });
  it("migrates a previously invalid migration", async () => {
    await expect(
      migrator.migrate([
        {
          id: "test-table",
          up: () => [
            new Table("test_table")
              .addField("test_column", "text", Constraint.NOT_NULL)
              .create(),
          ],
          down: () => [DropTable("test_table")],
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
          up: () => [
            new Table("test_table2")
              .addField("test_column", "text", Constraint.PRIMARY_KEY)
              .addField("test_column2", "text", Constraint.PRIMARY_KEY)
              .create(),
          ],
          down: () => [],
        },
      ]),
    ).resolves.toEqual([]);
    await expect(
      dbGet(
        "SELECT * FROM sqlite_master WHERE type='table' AND name='test_table'",
      ),
    ).resolves.toHaveProperty("name", "test_table");
    const res = await dbGet(
      `SELECT * FROM migrations WHERE id='${migrationID}' and status=${MigrationStatus.FAILED};`,
    );
    expect(res).toHaveProperty("id", migrationID);
  });

  it("rolls back last applied migration", async () => {
    await expect(migrator.rollback()).resolves.toEqual("test-table");
    await expect(
      dbGet(`SELECT * FROM migrations WHERE id='test-table';`),
    ).resolves.toHaveProperty("status", MigrationStatus.ROLLBACK);
    await expect(
      dbGet(
        "SELECT * FROM sqlite_master WHERE type='table' AND name='test_table'",
      ),
    ).resolves.toBe(undefined);
    await expect(migrator.rollback()).resolves.toEqual(null);
  });
});
