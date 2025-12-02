import type { SQLiteDatabase } from "expo-sqlite";
import { BaseAdapter } from "./BaseAdapter";

export class ExpoAdapter extends BaseAdapter<SQLiteDatabase> {
  constructor(db: SQLiteDatabase) {
    super(db);
  }

  async run(query: string) {
    this.db.execAsync(query);
  }

  async getAll<T>(source: string, ...params: any[]): Promise<T[]> {
    return this.db.getAllAsync(source, ...params);
  }

  async getFirst<T>(source: string, ...params: any[]): Promise<T | null> {
    return this.db.getFirstAsync(source, ...params);
  }
}
