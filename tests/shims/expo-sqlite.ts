/**
 * Shim expo-sqlite cho môi trường Node (chỉ dùng trong test).
 * Dùng SQLite thật (node:sqlite) => các câu SQL, CHECK, UNIQUE partial index,
 * FOREIGN KEY, ON CONFLICT... được kiểm chứng y như trên điện thoại.
 */
import { DatabaseSync } from 'node:sqlite';

type Param = string | number | null;

export class SQLiteDatabase {
  constructor(public raw: DatabaseSync) {}
  async execAsync(sql: string) {
    this.raw.exec(sql);
  }
  async runAsync(sql: string, params: Param[] = []) {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async getAllAsync<T>(sql: string, params: Param[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...params) as T[];
  }
  async getFirstAsync<T>(sql: string, params: Param[] = []): Promise<T | null> {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async withTransactionAsync(task: () => Promise<void>) {
    this.raw.exec('BEGIN');
    try {
      await task();
      this.raw.exec('COMMIT');
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Test có thể "cài lại app" bằng cách thay DatabaseSync bên dưới. */
export const testHandle: { db: SQLiteDatabase | null } = { db: null };

export async function openDatabaseAsync(_name: string): Promise<SQLiteDatabase> {
  testHandle.db = new SQLiteDatabase(new DatabaseSync(':memory:'));
  return testHandle.db;
}
