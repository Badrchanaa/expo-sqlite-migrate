import type { Database } from "sqlite3";
import { BaseAdapter } from "./BaseAdapter";
import { promisify } from "../utils/promisify";

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

  async getAll<T>(source: string, ...params: any[]): Promise<T[]> {
    console.log("[SQLite3Adapter] get query:", source, params);
    const get = promisify<T[]>(this.db.all, this.db);
    return get(source, ...params);
  }

  async getFirst<T>(source: string, ...params: any[]): Promise<T | null> {
    const get = promisify<T>(this.db.get, this.db);
    return get(source, ...params);
  }
}
