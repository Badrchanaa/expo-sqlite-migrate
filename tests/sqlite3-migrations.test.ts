import { Database } from "sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationStatus, Migrator } from "../src/migrator";
import { promisify } from "../src/utils/promisify";
import { Constraint, DropTable, Table } from "../src/migrations";
import { Sqlite3Adapter } from "../src/adapters/Sqlite3Adapter";
import { InvalidMigrationError } from "../src/error";

type TestContext = {
  db: Database;
  migrator: Migrator;
  dbGet: <T>(sql: string, ...params: any[]) => Promise<T | undefined>;
  dbAll: <T>(sql: string, ...params: any[]) => Promise<T[]>;
  close: () => Promise<void>;
};

const openContext = async (): Promise<TestContext> => {
  const db = new Database(":memory:");
  const migrator = await Migrator.create(db, "sqlite3");
  const dbGet = promisify<any>(db.get, db);
  const dbAll = promisify<any>(db.all, db);
  const close = promisify<void>(db.close, db);
  return { db, migrator, dbGet, dbAll, close };
};

describe("sqlite3 migrations", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await openContext();
  });

  afterEach(async () => {
    await ctx.close();
  });

  describe("migrations table", () => {
    it("creates the migrations table", async () => {
      const res = await ctx.dbGet(
        "SELECT * FROM sqlite_master WHERE type='table' AND name='migrations'",
      );
      expect(res).toHaveProperty("type", "table");
      expect(res).toHaveProperty("name", "migrations");
    });

    it("has the expected columns", async () => {
      const columns: { name: string }[] = await ctx.dbAll(
        "PRAGMA table_info(migrations);",
      );
      const names = columns.map((c) => c.name);
      expect(names).toContain("id");
      expect(names).toContain("status");
      expect(names).toContain("created_at");
      expect(names).toContain("updated_at");
    });
  });

  describe("migrator behavior", () => {
    it("records a failed migration", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "test-table",
            up: () => [new Table("test_table").create()],
            down: () => [],
          },
        ]),
      ).resolves.toEqual([]);
      const res = await ctx.dbGet(
        `SELECT * FROM migrations WHERE id='test-table' AND status=${MigrationStatus.FAILED}`,
      );
      expect(res).toHaveProperty("id", "test-table");
    });

    it("applies a valid migration and marks it applied", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "apply-test",
            up: () => [
              new Table("test_table")
                .addField("test_column", "text", Constraint.NOT_NULL)
                .create(),
            ],
            down: () => [DropTable("test_table")],
          },
        ]),
      ).resolves.toEqual(["apply-test"]);
      const res = await ctx.dbGet(
        `SELECT * FROM migrations WHERE id='apply-test' AND status=${MigrationStatus.APPLIED}`,
      );
      expect(res).toHaveProperty("id", "apply-test");
    });

    it("rejects duplicate migration ids", async () => {
      await expect(
        ctx.migrator.migrate([
          { id: "dup", up: () => [], down: () => [] },
          { id: "dup", up: () => [], down: () => [] },
        ]),
      ).rejects.toBeInstanceOf(InvalidMigrationError);
    });

    it("rolls back the latest applied migration", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "first",
            up: () => [
              new Table("t1").addField("id", "int", Constraint.PRIMARY_KEY).create(),
            ],
            down: () => [DropTable("t1")],
          },
          {
            id: "second",
            up: () => [
              new Table("t2").addField("id", "int", Constraint.PRIMARY_KEY).create(),
            ],
            down: () => [DropTable("t2")],
          },
        ]),
      ).resolves.toEqual(["first", "second"]);
      await expect(ctx.migrator.rollback()).resolves.toEqual("second");
      await expect(
        ctx.dbGet(`SELECT * FROM migrations WHERE id='second';`),
      ).resolves.toHaveProperty("status", MigrationStatus.ROLLBACK);
      await expect(
        ctx.dbGet("SELECT * FROM sqlite_master WHERE type='table' AND name='t2'"),
      ).resolves.toBe(undefined);
    });
  });

  describe("foreign keys", () => {
    it("creates a table with foreign keys and actions", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "fk-actions",
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
                  { onDelete: "CASCADE", onUpdate: "RESTRICT", deferred: true },
                );
              return [usersTable.create(), postsTable.create()];
            },
            down: () => [DropTable("users"), DropTable("posts")],
          },
        ]),
      ).resolves.toEqual(["fk-actions"]);
      const res = await ctx.dbGet<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'",
      );
      expect(res?.sql).toContain('FOREIGN KEY("authorid") REFERENCES users("id")');
      expect(res?.sql).toContain("ON DELETE CASCADE");
      expect(res?.sql).toContain("ON UPDATE RESTRICT");
      expect(res?.sql).toContain("DEFERRABLE INITIALLY DEFERRED");
    });

    it("fails when the referenced column does not exist", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "fk-bad-ref",
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
      await expect(
        ctx.dbGet("SELECT * FROM sqlite_master WHERE type='table' AND name='posts'"),
      ).resolves.toBe(undefined);
    });

    it("fails when the child column does not exist", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "fk-bad-child",
            up: () => {
              const usersTable = new Table("users")
                .addField("id", "int", Constraint.PRIMARY_KEY)
                .addField("name", "text");
              const postsTable = new Table("posts")
                .addField("id", "int", Constraint.PRIMARY_KEY)
                .addField("title", "text")
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
      await expect(
        ctx.dbGet("SELECT * FROM sqlite_master WHERE type='table' AND name='posts'"),
      ).resolves.toBe(undefined);
    });

    it("fails on duplicate foreign keys", async () => {
      await expect(
        ctx.migrator.migrate([
          {
            id: "fk-duplicate",
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
      await expect(
        ctx.dbGet("SELECT * FROM sqlite_master WHERE type='table' AND name='posts'"),
      ).resolves.toBe(undefined);
    });
  });

  describe("adapter prepared statements", () => {
    it("runs prepared inserts", async () => {
      const adapter = new Sqlite3Adapter(ctx.db);
      await expect(
        ctx.migrator.migrate([
          {
            id: "test-prepared",
            up: () => {
              const testTable = new Table("testprepared")
                .addField("id", "int", Constraint.PRIMARY_KEY)
                .addField("name", "text");
              return [testTable.create()];
            },
            down: () => [DropTable("testprepared")],
          },
        ]),
      ).resolves.toEqual(["test-prepared"]);
      await adapter.runPrepared("INSERT INTO testprepared values (?, ?)", [
        "1",
        "preparedname",
      ]);
      const result = await ctx.dbGet("SELECT * from testprepared");
      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("name", "preparedname");
    });
  });
});
