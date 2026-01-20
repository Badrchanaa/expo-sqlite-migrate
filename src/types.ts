import { Database } from "sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import type { BaseAdapter } from "./adapters/BaseAdapter";

export interface DBMap {
  "expo-sqlite": SQLiteDatabase;
  sqlite3: Database;
}

export type DBTypeLiteral = keyof DBMap;

export type AdapterMap = {
  [K in keyof DBMap]: new (db: DBMap[K]) => BaseAdapter<DBMap[K]>;
};
