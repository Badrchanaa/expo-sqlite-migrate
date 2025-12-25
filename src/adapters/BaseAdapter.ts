export interface DBAdapter {
  run: (query: string) => Promise<void>;
  getFirst: <T>(preparedQuery: string, ...params: any[]) => Promise<T | null>;
  getAll: <T>(preparedQuery: string, ...params: any[]) => Promise<T[]>;
  transaction: (queries: string[]) => Promise<void>;
}

export abstract class BaseAdapter<DBType = any> implements DBAdapter {
  protected db: DBType;
  constructor(db: DBType) {
    this.db = db;
  }
  abstract run(query: string): Promise<void>;
  abstract transaction(queries: string[]): Promise<void>;
  abstract getFirst<T>(
    preparedQuery: string,
    ...params: any[]
  ): Promise<T | null>;
  abstract getAll<T>(preparedQuery: string, ...params: any[]): Promise<T[]>;
}
