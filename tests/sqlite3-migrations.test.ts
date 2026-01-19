import { Database } from "sqlite3";
import { describe, expect, it } from "vitest";
import { MigrationStatus, Migrator } from "../src/migrator";
import { promisify } from "../src/utils/promisify";
import { Table } from "../src";
import { Constraint, DropTable } from "../src/migrations";
import { Sqlite3Adapter } from "../src/adapters/Sqlite3Adapter";

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
          id: "test-table",
          up: () => [new Table("test_table").create()],
          down: () => [],
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

  it("creates table with foreign key", async () => {
    await expect(
      migrator.migrate([
        {
          id: "fk-test1",
          up: () => {
            const usersTable = new Table("users")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("name", "text");
            const postsTable = new Table("posts")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("title", "text")
              .addField("authorid", "int", Constraint.NOT_NULL)
              .addForeignKey(
                "users",
                { authorid: "id" },
                { onDelete: "CASCADE" },
              );
            return [usersTable.create(), postsTable.create()];
          },
          down: () => [DropTable("users"), DropTable("posts")],
        },
      ]),
    ).resolves.toEqual(["fk-test1"]);
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='posts'",
    );
    console.log("result", res);
    expect(res).toHaveProperty("type", "table");
    expect(res).toHaveProperty("name", "posts");
    await expect(migrator.rollback()).resolves.toEqual("fk-test1");
  });
  it("fails to create table with invalid foreign key: invalid referenced column", async () => {
    await expect(
      migrator.migrate([
        {
          id: "fk-test1",
          up: () => {
            const usersTable = new Table("users")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("name", "text");
            const postsTable = new Table("posts")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("title", "text")
              .addField("authorid", "int", Constraint.NOT_NULL)
              .addForeignKey(
                usersTable,
                { authorid: "notexist" },
                { onDelete: "CASCADE" },
              );
            return [usersTable.create(), postsTable.create()];
          },
          down: () => [DropTable("users"), DropTable("posts")],
        },
      ]),
    ).resolves.toEqual([]);
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='posts'",
    );
    expect(res).toBeUndefined;
    await expect(migrator.rollback()).resolves.toEqual(null);
  });
  it("fails to create table with invalid foreign key: invalid column key", async () => {
    await expect(
      migrator.migrate([
        {
          id: "fk-test1",
          up: () => {
            const usersTable = new Table("users")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("name", "text");
            const postsTable = new Table("posts")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("title", "text")
              .addField("authorid", "int", Constraint.NOT_NULL)
              .addForeignKey(
                usersTable,
                { notexist: "id" },
                { onDelete: "CASCADE" },
              );
            return [usersTable.create(), postsTable.create()];
          },
          down: () => [DropTable("users"), DropTable("posts")],
        },
      ]),
    ).resolves.toEqual([]);
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='posts'",
    );
    expect(res).toBeUndefined;
    await expect(migrator.rollback()).resolves.toEqual(null);
  });
  it("fails to create table with invalid foreign key: duplicate", async () => {
    await expect(
      migrator.migrate([
        {
          id: "fk-test1",
          up: () => {
            const usersTable = new Table("users")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("name", "text");
            const postsTable = new Table("posts")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("title", "text")
              .addField("authorid", "int", Constraint.NOT_NULL)
              .addForeignKey(
                usersTable,
                { authorid: "id" },
                { onDelete: "CASCADE" },
              )
              .addForeignKey(
                usersTable,
                { authorid: "id" },
                { onDelete: "CASCADE" },
              );
            return [usersTable.create(), postsTable.create()];
          },
          down: () => [DropTable("users"), DropTable("posts")],
        },
      ]),
    ).resolves.toEqual([]);
    const res = await dbGet(
      "SELECT * FROM sqlite_master WHERE type='table' AND name='posts'",
    );
    expect(res).toBeUndefined;
    await expect(migrator.rollback()).resolves.toEqual(null);
  });

  it("runs prepared statements", async () => {
    const adapter = new Sqlite3Adapter(db);
    await expect(
      migrator.migrate([
        {
          id: "test-prepared1",
          up: () => {
            const testTable = new Table("testprepared")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .addField("name", "text");
            return [testTable.create()];
          },
          down: () => [DropTable("users"), DropTable("posts")],
        },
      ]),
    ).resolves.toEqual(["test-prepared1"]);
    await adapter.runPrepared("INSERT INTO testprepared values (?, ?)", [
      "1",
      "preparedname",
    ]);
    const result = await dbGet("SELECT * from testprepared");
    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("name", "preparedname");
  });
});
