import type { SQLiteDatabase } from "expo-sqlite";
import { BaseAdapter, type TransactionQuery } from "./BaseAdapter";

export class ExpoAdapter extends BaseAdapter<SQLiteDatabase> {
  constructor(db: SQLiteDatabase) {
    super(db);
  }

  async run(query: string) {
    return this.db.execAsync(query);
  }

  async runPrepared(query: string, params: string[]) {
    const statement = await this.db.prepareAsync(query);
    try {
      await statement.executeAsync(params);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll<T>(source: string, ...params: any[]): Promise<T[]> {
    return this.db.getAllAsync(source, ...params);
  }

  async getFirst<T>(source: string, ...params: any[]): Promise<T | null> {
    return this.db.getFirstAsync(source, ...params);
  }

  async transaction(queries: TransactionQuery[]): Promise<void> {
    return this.db.withExclusiveTransactionAsync(async (tx) => {
      for (const query of queries) {
        if (typeof query === "string") {
          await tx.execAsync(query);
        } else {
          const statement = await tx.prepareAsync(query.sql);
          try {
            await statement.executeAsync(query.params);
          } finally {
            await statement.finalizeAsync();
          }
        }
      }
    });
  }
}
