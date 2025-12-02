import type { Database } from "sqlite3";
import { BaseAdapter } from "./BaseAdapter";
import { promisify } from "../utils/promisify";

export class Sqlite3Adapter extends BaseAdapter<Database> {
  constructor(db: Database) {
    super(db);
  }

  async run(query: string) {
    this.db.run(query);
  }

  async getAll<T>(source: string, ...params: any[]): Promise<T[]> {
    const get = promisify<T[]>(this.db.all, this.db);
    return get(source, ...params);
  }

  async getFirst<T>(source: string, ...params: any[]): Promise<T | null> {
    const get = promisify<T>(this.db.get, this.db);
    return get(source, ...params);
  }
}
