import { Database } from "sqlite3";
import { describe, expect, it } from "vitest";
import { Migrator } from "../src/migrator";
import { promisify } from "../src/utils/promisify";

describe("sqlite3 adapter", () => {
  const db = new Database(":memory:");
  new Migrator(db, "sqlite3");
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
});
