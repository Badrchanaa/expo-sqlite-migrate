import { Database } from "sqlite3";
import { describe, expect, it } from "vitest";
import { Migrator } from "../src/migrator";
import { promisify } from "../src/utils/promisify";
import { Table } from "../src";
import { Constraint } from "../src/migrations";

describe("sqlite3 adapter", () => {
  const db = new Database(":memory:");
  const migrator = new Migrator(db, "sqlite3");
  const dbGet = promisify<any>(db.get, db);
  const dbAll = promisify<any>(db.all, db);
  it("creates migrations table using sqlite3", async () => {
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='migrations'",
    );
    expect(res).not.toBeNull();
    console.log(res);
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
    ).resolves.toEqual([]); // test fails if migrate throws
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
    ).resolves.toEqual(["test-table"]); // test fails if migrate throws
  });
});
