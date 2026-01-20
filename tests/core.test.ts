import { Database } from "sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Constraint, DropTable, Table } from "../src/migrations";
import { QueryGenerator } from "../src/query-generator";
import { MigrationStatus, Migrator } from "../src/migrator";
import { ExpoAdapter } from "../src/adapters/ExpoAdapter";
import { Sqlite3Adapter } from "../src/adapters/Sqlite3Adapter";
import { promisify } from "../src/utils/promisify";

type MigratorContext = {
  db: Database;
  migrator: Migrator;
  dbRun: (sql: string, ...params: any[]) => Promise<void>;
  dbGet: <T>(sql: string, ...params: any[]) => Promise<T | undefined>;
  close: () => Promise<void>;
};

const openMigratorContext = async (): Promise<MigratorContext> => {
  const db = new Database(":memory:");
  const migrator = await Migrator.create(db, "sqlite3");
  const dbRun = promisify<void>(db.run, db);
  const dbGet = promisify<any>(db.get, db);
  const close = promisify<void>(db.close, db);
  return { db, migrator, dbRun, dbGet, close };
};

describe("table validation and query generation", () => {
  it("rejects invalid table names", () => {
    expect(() => new Table("")).toThrow("Invalid empty table name");
    expect(() => new Table("bad-name")).toThrow(
      "Invalid table name: unquoted table name can only contain alphanumeric and underscore characters",
    );
    expect(() => new Table('"bad"name"')).toThrow(
      "Invalid table name: inner content contains quote character",
    );
    expect(() => new Table("[bad]name]")).toThrow(
      "Invalid table name: inner content contains quote character",
    );
  });

  it("accepts quoted table names", () => {
    expect(() => new Table('"My Table"')).not.toThrow();
    expect(new Table('"My Table"').name).toBe('"my table"');
  });

  it("rejects duplicate fields and multiple primary keys", () => {
    const table = new Table("users").addField(
      "id",
      "int",
      Constraint.PRIMARY_KEY,
    );
    expect(() => table.addField("id", "int")).toThrow(
      "table fields can not have the same name id",
    );
    expect(() => table.addField("other", "int", Constraint.PRIMARY_KEY)).toThrow(
      "table cannot have more than one primary key",
    );
  });

  it("requires foreign keys to reference at least one column", () => {
    const table = new Table("posts").addField(
      "id",
      "int",
      Constraint.PRIMARY_KEY,
    );
    expect(() => table.addForeignKey("users", {} as Record<string, string>)).toThrow(
      "Foreign key must reference at least one column",
    );
  });

  it("generates create and drop queries with constraints", () => {
    const table = new Table("users")
      .addField("id", "int", Constraint.PRIMARY_KEY | Constraint.NOT_NULL)
      .addField("email", "text", Constraint.UNIQUE);
    const sql = QueryGenerator.createTable(table);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS users(");
    expect(sql).toContain("id INTEGER PRIMARY KEY NOT NULL");
    expect(sql).toContain("email text UNIQUE");
    expect(QueryGenerator.dropTable("users")).toBe("DROP TABLE users;");
  });

  it("includes foreign keys when generating create table SQL", () => {
    const parent = new Table("parents")
      .addField("id_a", "int", Constraint.PRIMARY_KEY)
      .addField("id_b", "int");
    const child = new Table("children")
      .addField("id", "int", Constraint.PRIMARY_KEY)
      .addField("a", "int")
      .addField("b", "int")
      .addForeignKey(parent, { a: "id_a", b: "id_b" }, { onDelete: "CASCADE" });

    const sql = QueryGenerator.createTable(child);
    expect(sql).toContain('FOREIGN KEY("a", "b") REFERENCES parents("id_a", "id_b")');
    expect(sql).toContain("ON DELETE CASCADE");
  });

  it("omits ON DELETE when it is not provided", () => {
    const parent = new Table("parents")
      .addField("id_a", "int", Constraint.PRIMARY_KEY)
      .addField("id_b", "int");
    const child = new Table("children")
      .addField("id", "int", Constraint.PRIMARY_KEY)
      .addField("a", "int")
      .addField("b", "int")
      .addForeignKey(parent, { a: "id_a", b: "id_b" }, { onUpdate: "CASCADE" });

    const sql = QueryGenerator.createTable(child);
    expect(sql).toContain("ON UPDATE CASCADE");
    expect(sql).not.toContain("ON DELETE");
  });

  it("normalizes foreign key entries for duplicate detection", () => {
    const parent = new Table("parents")
      .addField("id_a", "int", Constraint.PRIMARY_KEY)
      .addField("id_b", "int");
    const child = new Table("children")
      .addField("id", "int", Constraint.PRIMARY_KEY)
      .addField("a", "int")
      .addField("b", "int")
      .addForeignKey(parent, { b: "id_b", a: "id_a" });

    expect(() =>
      child.addForeignKey(parent, { a: "id_a", b: "id_b" }),
    ).toThrow("Foreign key already exists");
  });

  it("returns empty update statements", () => {
    const table = new Table("update_test").addField(
      "id",
      "int",
      Constraint.PRIMARY_KEY,
    );
    expect(table.update()).toBe("");
  });

  it("throws when creating a table with no fields", () => {
    const table = new Table("empty");
    expect(() => QueryGenerator.createTable(table)).toThrow(
      "can not create a table with no fields",
    );
  });
});

describe("promisify utility", () => {
  it("resolves values from callback-style functions", async () => {
    const fn = (value: number, cb: (err: any, result?: number) => void) => {
      cb(null, value + 1);
    };
    const wrapped = promisify<number>(fn, null);
    await expect(wrapped(2)).resolves.toBe(3);
  });

  it("rejects when callback yields an error", async () => {
    const fn = (_: number, cb: (err: any) => void) => {
      cb(new Error("nope"));
    };
    const wrapped = promisify<number>(fn, null);
    await expect(wrapped(1)).rejects.toThrow("nope");
  });

  it("rejects when the wrapped function throws", async () => {
    const fn = () => {
      throw new Error("boom");
    };
    const wrapped = promisify<void>(fn, null);
    await expect(wrapped()).rejects.toThrow("boom");
  });
});

describe("migrator edge cases", () => {
  let ctx: MigratorContext;

  afterEach(async () => {
    if (ctx) {
      await ctx.close();
    }
  });

  it("skips already-applied migrations without re-running", async () => {
    ctx = await openMigratorContext();
    await ctx.dbRun(
      "INSERT INTO migrations (id, status) values (?, ?)",
      "applied",
      String(MigrationStatus.APPLIED),
    );
    await expect(
      ctx.migrator.migrate([
        {
          id: "applied",
          up: () => {
            throw new Error("should not run");
          },
          down: () => [],
        },
      ]),
    ).resolves.toEqual(["applied"]);
  });

  it("retries failed migrations and updates the status", async () => {
    ctx = await openMigratorContext();
    await ctx.dbRun(
      "INSERT INTO migrations (id, status) values (?, ?)",
      "retry",
      String(MigrationStatus.FAILED),
    );
    await expect(
      ctx.migrator.migrate([
        {
          id: "retry",
          up: () => [
            new Table("retry_table")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .create(),
          ],
          down: () => [DropTable("retry_table")],
        },
      ]),
    ).resolves.toEqual(["retry"]);
    const record = await ctx.dbGet<{ status: number }>(
      "SELECT status FROM migrations WHERE id = ?",
      "retry",
    );
    expect(record?.status).toBe(MigrationStatus.APPLIED);
  });

  it("returns null when no applied migrations exist", async () => {
    ctx = await openMigratorContext();
    await expect(ctx.migrator.rollback()).resolves.toBe(null);
  });

  it("warns when a migration is already registered", async () => {
    ctx = await openMigratorContext();
    await ctx.dbRun(
      "INSERT INTO migrations (id, status) values (?, ?)",
      "registered",
      String(MigrationStatus.REGISTERED),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      ctx.migrator.migrate([
        {
          id: "registered",
          up: () => [
            new Table("registered_table")
              .addField("id", "int", Constraint.PRIMARY_KEY)
              .create(),
          ],
          down: () => [DropTable("registered_table")],
        },
      ]),
    ).resolves.toEqual(["registered"]);

    const record = await ctx.dbGet<{ status: number }>(
      "SELECT status FROM migrations WHERE id = ?",
      "registered",
    );
    expect(record?.status).toBe(MigrationStatus.APPLIED);
    expect(warn).toHaveBeenCalledWith(
      "migration already registered registered",
    );
    warn.mockRestore();
  });

  it("records failures when migration throws non-Error values", async () => {
    ctx = await openMigratorContext();
    await expect(
      ctx.migrator.migrate([
        {
          id: "non-error",
          up: () => {
            throw "boom";
          },
          down: () => [],
        },
      ]),
    ).resolves.toEqual([]);

    const record = await ctx.dbGet<{ status: number }>(
      "SELECT status FROM migrations WHERE id = ?",
      "non-error",
    );
    expect(record?.status).toBe(MigrationStatus.FAILED);
  });

  it("propagates non-validation errors from migrate", async () => {
    ctx = await openMigratorContext();
    (ctx.migrator as any).getMigrationRecord = async () => {
      throw new Error("boom");
    };

    await expect(
      ctx.migrator.migrate([{ id: "x", up: () => [], down: () => [] }]),
    ).rejects.toThrow("boom");
  });

  it("throws when rollback has no migration definition", async () => {
    ctx = await openMigratorContext();
    await ctx.dbRun(
      "INSERT INTO migrations (id, status) values (?, ?)",
      "missing",
      String(MigrationStatus.APPLIED),
    );
    await expect(ctx.migrator.rollback()).rejects.toThrow(
      "Applied migration missing has no code definition",
    );
  });
});

describe("Expo adapter behavior", () => {
  it("runs queries and transactions against the expo database API", async () => {
    const execAsync = vi.fn(async () => undefined);
    const getAllAsync = vi.fn(async () => [{ id: 1 }]);
    const getFirstAsync = vi.fn(async () => ({ id: 1 }));
    const prepareAsync = vi.fn(async (sql: string) => {
      const executeAsync = vi.fn(async () => undefined);
      const finalizeAsync = vi.fn(async () => undefined);
      return { executeAsync, finalizeAsync, sql };
    });
    const withExclusiveTransactionAsync = vi.fn(
      async (callback: (tx: any) => Promise<void>) => {
        const tx = { execAsync, prepareAsync };
        await callback(tx);
      },
    );

    const adapter = new ExpoAdapter({
      execAsync,
      getAllAsync,
      getFirstAsync,
      prepareAsync,
      withExclusiveTransactionAsync,
    } as any);

    await adapter.run("CREATE TABLE test(id int)");
    await adapter.runPrepared("INSERT INTO test values (?)", ["1"]);
    await expect(adapter.getAll<{ id: number }>("SELECT id FROM test")).resolves.toEqual([
      { id: 1 },
    ]);
    await expect(adapter.getFirst<{ id: number }>("SELECT id FROM test")).resolves.toEqual(
      { id: 1 },
    );

    await adapter.transaction([
      "CREATE TABLE test2(id int)",
      { sql: "INSERT INTO test2 values (?)", params: ["1"] },
    ]);

    expect(execAsync).toHaveBeenCalled();
    expect(prepareAsync).toHaveBeenCalled();
    expect(withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });
});

describe("sqlite3 adapter transactions", () => {
  it("rolls back when a transaction query fails", async () => {
    const db = new Database(":memory:");
    const adapter = new Sqlite3Adapter(db);
    const dbGet = promisify<any>(db.get, db);
    const close = promisify<void>(db.close, db);

    await expect(
      adapter.transaction([
        "CREATE TABLE rolltest(id int);",
        "INSERT INTO missing_table VALUES (1);",
      ]),
    ).rejects.toBeInstanceOf(Error);

    const table = await dbGet(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='rolltest'",
    );
    expect(table).toBeUndefined();
    await close();
  });
});

describe("sqlite3 adapter error handling", () => {
  it("rejects when run throws synchronously", async () => {
    const adapter = new Sqlite3Adapter({
      run: () => {
        throw new Error("run fail");
      },
    } as any);

    await expect(adapter.run("SELECT 1")).rejects.toThrow("run fail");
  });

  it("rejects when runPrepared throws synchronously", async () => {
    const adapter = new Sqlite3Adapter({
      prepare: () => {
        throw new Error("prepare fail");
      },
    } as any);

    await expect(
      adapter.runPrepared("INSERT INTO t values (?)", ["1"]),
    ).rejects.toThrow("prepare fail");
  });

  it("rejects when prepared statements fail at run time", async () => {
    const adapter = new Sqlite3Adapter({
      prepare: () => {
        return {
          run: (cb: (err?: Error | null) => void) => {
            cb(new Error("stmt failed"));
          },
          finalize: () => undefined,
        };
      },
    } as any);

    await expect(
      adapter.runPrepared("INSERT INTO t values (?)", ["1"]),
    ).rejects.toThrow("stmt failed");
  });

  it("uses getAll to retrieve rows", async () => {
    const db = new Database(":memory:");
    const adapter = new Sqlite3Adapter(db);
    const close = promisify<void>(db.close, db);

    await adapter.run("CREATE TABLE items(id int)");
    await adapter.runPrepared("INSERT INTO items values (?)", ["1"]);
    await expect(adapter.getAll<{ id: number }>("SELECT id FROM items")).resolves.toEqual([
      { id: 1 },
    ]);

    await close();
  });

  it("logs rollback failures when rollback cannot be executed", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    const adapter = new Sqlite3Adapter({
      run: (sql: string, cb: (err?: Error | null) => void) => {
        if (sql === "ROLLBACK") {
          throw new Error("rollback fail");
        }
        if (sql === "BAD") {
          cb(new Error("bad query"));
          return;
        }
        cb(null);
      },
      prepare: () => {
        throw new Error("not used");
      },
      all: () => undefined,
      get: () => undefined,
    } as any);

    await expect(adapter.transaction(["BAD"])).rejects.toThrow("bad query");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
    consoleLog.mockRestore();
  });
});
