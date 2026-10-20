import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME } from '@/config/appConfig';
import { MIGRATIONS } from './schema';

export type Db = SQLite.SQLiteDatabase;

let dbPromise: Promise<Db> | null = null;

async function openAndMigrate(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // PRAGMA foreign_keys có hiệu lực THEO KẾT NỐI và mặc định TẮT trong SQLite.
  // Quên dòng này => FOREIGN KEY / ON DELETE RESTRICT chỉ là "trang trí".
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    // PRAGMA không nhận tham số bind => nội suy số nguyên (an toàn).
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((err) => {
      dbPromise = null; // cho phép thử lại nếu mở DB lỗi
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Hàng đợi ghi tuần tự (mutex).
 *
 * Vì sao không dùng withExclusiveTransactionAsync của expo-sqlite?
 * Hàm đó mở MỘT KẾT NỐI MỚI, trên kết nối mới PRAGMA foreign_keys lại về OFF
 * (và PRAGMA này không thể bật bên trong transaction) => mất ràng buộc khoá ngoại.
 * Thay vào đó: mọi thao tác GHI của app đi qua hàng đợi này và chạy trong
 * withTransactionAsync trên kết nối chính (đã bật foreign_keys), nên các
 * transaction không bao giờ chen nhau (UI ghi và Sync Engine ghi cùng lúc).
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function writeTransaction<T>(task: (db: Db) => Promise<T>): Promise<T> {
  const run = async () => {
    const db = await getDb();
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await task(db);
    });
    return result;
  };
  const next = writeChain.then(run, run);
  writeChain = next.catch(() => undefined);
  return next;
}
