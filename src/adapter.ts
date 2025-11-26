import type { SQLiteDatabase } from "expo-sqlite";

export class Adapter {
  private _db;
  constructor(db: SQLiteDatabase) {
    this._db = db;
  }

  async exec(query: string) {
    return this._db.execAsync(query);
  }

  execSync(query: string) {
    return this._db.execSync(query);
  }

  async getAll<T>(source: string, ...params: any[]): Promise<T[]> {
    return this._db.getAllAsync(source, ...params);
  }

  async getFirst<T>(source: string, ...params: any[]): Promise<T | null> {
    return this._db.getFirstAsync(source, ...params);
  }
}
