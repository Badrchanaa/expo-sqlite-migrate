import type { Database, Statement } from "sqlite3";
import { BaseAdapter, type TransactionQuery } from "./BaseAdapter";
import { promisify } from "../utils/promisify";

enum TransactionType {
  DEFERRED = "DEFERRED",
  IMMEDIATE = "IMMEDIATE",
  EXCLUSIVE = "EXCLUSIVE",
}

export class Sqlite3Adapter extends BaseAdapter<Database> {
  constructor(db: Database) {
    super(db);
  }

  async run(query: string) {
    console.log("[SQLite3Adapter] run query:", query);
    return new Promise<void>((resolve, reject) => {
      try {
        this.db.run(query, (err) => {
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async runPrepared(query: string, params: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare(query, params);
        stmt.run((err) => {
          stmt.finalize();
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAll<T>(source: string, ...params: any[]): Promise<T[]> {
    console.log("[SQLite3Adapter] get query:", source, params);
    const get = promisify<T[]>(this.db.all, this.db);
    return get(source, ...params);
  }

  async transaction(
    queries: TransactionQuery[],
    transactionType = TransactionType.IMMEDIATE,
  ) {
    await this.run(`BEGIN ${transactionType} TRANSACTION`);
    try {
      for (const query of queries) {
        if (typeof query === "string") {
          await this.run(query);
        } else {
          await this.runPrepared(query.sql, query.params);
        }
      }
      await this.run("COMMIT");
    } catch (err) {
      console.error("[Transaction error]: ", err);
      console.log("ROLLING BACK");
      await this.run("ROLLBACK").catch((e) =>
        console.error("ROLLBACK FAILED", e),
      );
      throw err;
    }
  }

  async getFirst<T>(source: string, ...params: any[]): Promise<T | null> {
    const get = promisify<T>(this.db.get, this.db);
    return get(source, ...params);
  }
}
// good code
