export interface DBAdapter {
  run: (query: string) => Promise<void>;
  getFirst: <T>(preparedQuery: string, ...params: any[]) => Promise<T | null>;
  getAll: <T>(preparedQuery: string, ...params: any[]) => Promise<T[]>;
  transaction: (queries: TransactionQuery[]) => Promise<void>;
  runPrepared: (query: string, params: string[]) => Promise<void>;
}

export type TransactionQuery =
  | string
  | {
      sql: string;
      params: string[];
    };

export abstract class BaseAdapter<DBType> implements DBAdapter {
  protected db: DBType;
  constructor(db: DBType) {
    this.db = db;
  }
  abstract run(query: string): Promise<void>;
  abstract runPrepared(query: string, params: string[]): Promise<void>;
  abstract transaction(queries: TransactionQuery[]): Promise<void>;
  abstract getFirst<T>(
    preparedQuery: string,
    ...params: any[]
  ): Promise<T | null>;
  abstract getAll<T>(preparedQuery: string, ...params: any[]): Promise<T[]>;
}
