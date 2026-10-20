import type { Db } from '@/database/database';
import { COLS, SQL, SYNC_STATUS, type SyncStatus } from '@/database/schema';
import type { CategoryWithCount, DishCategory } from '@/models';
import { normalizeName } from '@/utils/text';

const { T, c } = SQL;
type Row = Record<string, unknown>;

/** Ánh xạ cột có tiền tố MSSV -> model TypeScript. */
function mapCategory(row: Row): DishCategory {
  return {
    id: String(row[COLS.id]),
    name: String(row[COLS.name]),
    description: String(row[COLS.description] ?? ''),
    createdAt: Number(row[COLS.createdAt]),
    updatedAt: Number(row[COLS.updatedAt]),
    syncStatus: row[COLS.syncStatus] as SyncStatus,
  };
}

const ACTIVE = `${c.isDeleted} = 0`;

export async function listCategories(db: Db): Promise<DishCategory[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM ${T.category} WHERE ${ACTIVE} ORDER BY ${c.name} COLLATE NOCASE`,
  );
  return rows.map(mapCategory);
}

export async function listCategoriesWithCount(db: Db): Promise<CategoryWithCount[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT cat.*, (
        SELECT COUNT(*) FROM ${T.dish} d
        WHERE d.${c.dishCategoryId} = cat.${c.id} AND d.${c.isDeleted} = 0
     ) AS DishCount
     FROM ${T.category} cat
     WHERE cat.${c.isDeleted} = 0
     ORDER BY cat.${c.name} COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...mapCategory(r), dishCount: Number(r.DishCount) }));
}

export async function getCategory(db: Db, id: string): Promise<DishCategory | null> {
  const row = await db.getFirstAsync<Row>(
    `SELECT * FROM ${T.category} WHERE ${c.id} = ? AND ${ACTIVE}`,
    [id],
  );
  return row ? mapCategory(row) : null;
}

export async function categoryNameExists(db: Db, name: string, excludeId?: string): Promise<boolean> {
  const row = await db.getFirstAsync<Row>(
    `SELECT 1 AS x FROM ${T.category}
     WHERE ${c.normalizedName} = ? AND ${ACTIVE} AND ${c.id} <> ?`,
    [normalizeName(name), excludeId ?? ''],
  );
  return !!row;
}

export async function countActiveDishesInCategory(db: Db, categoryId: string): Promise<number> {
  const row = await db.getFirstAsync<Row>(
    `SELECT COUNT(*) AS n FROM ${T.dish} WHERE ${c.dishCategoryId} = ? AND ${c.isDeleted} = 0`,
    [categoryId],
  );
  return Number(row?.n ?? 0);
}

export async function insertCategory(
  db: Db,
  cat: Omit<DishCategory, 'syncStatus'>,
  syncStatus: SyncStatus = SYNC_STATUS.pending,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO ${T.category}
      (${c.id}, ${c.name}, ${c.normalizedName}, ${c.description}, ${c.createdAt}, ${c.updatedAt}, ${c.syncStatus})
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [cat.id, cat.name, normalizeName(cat.name), cat.description, cat.createdAt, cat.updatedAt, syncStatus],
  );
}

/** Sửa từ phía người dùng: đánh dấu Pending + tăng LocalVersion. */
export async function updateCategoryLocal(
  db: Db,
  id: string,
  data: { name: string; description: string },
  now: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE ${T.category}
     SET ${c.name} = ?, ${c.normalizedName} = ?, ${c.description} = ?, ${c.updatedAt} = ?,
         ${c.syncStatus} = 'pending', ${c.localVersion} = ${c.localVersion} + 1
     WHERE ${c.id} = ? AND ${ACTIVE}`,
    [data.name, normalizeName(data.name), data.description, now, id],
  );
}

/** Xoá mềm (tombstone) để lần đồng bộ sau còn biết phải xoá trên MockAPI. */
export async function tombstoneCategory(db: Db, id: string, now: number): Promise<void> {
  await db.runAsync(
    `UPDATE ${T.category}
     SET ${c.isDeleted} = 1, ${c.updatedAt} = ?, ${c.syncStatus} = 'pending',
         ${c.localVersion} = ${c.localVersion} + 1
     WHERE ${c.id} = ?`,
    [now, id],
  );
}

// ------------------------------------------------------------------
// Các hàm dưới đây chỉ Sync Engine dùng
// ------------------------------------------------------------------

export interface CategorySyncRow extends DishCategory {
  isDeleted: boolean;
  remoteId: string | null;
  localVersion: number;
}

function mapSyncRow(row: Row): CategorySyncRow {
  return {
    ...mapCategory(row),
    isDeleted: Number(row[COLS.isDeleted]) === 1,
    remoteId: (row[COLS.remoteId] as string | null) ?? null,
    localVersion: Number(row[COLS.localVersion]),
  };
}

export async function listAllCategoriesForSync(db: Db): Promise<CategorySyncRow[]> {
  const rows = await db.getAllAsync<Row>(`SELECT * FROM ${T.category}`);
  return rows.map(mapSyncRow);
}

/**
 * Chỉ đánh dấu Synced nếu LocalVersion KHÔNG đổi kể từ lúc đọc ra để gửi.
 * Nếu người dùng sửa tiếp trong lúc request đang bay, bản ghi vẫn Pending.
 */
export async function markCategorySynced(db: Db, id: string, remoteId: string, version: number): Promise<void> {
  await db.runAsync(
    `UPDATE ${T.category} SET ${c.remoteId} = ? WHERE ${c.id} = ?`,
    [remoteId, id],
  );
  await db.runAsync(
    `UPDATE ${T.category} SET ${c.syncStatus} = 'synced', ${c.lastSyncError} = NULL
     WHERE ${c.id} = ? AND ${c.localVersion} = ?`,
    [id, version],
  );
}

export async function setCategorySyncError(db: Db, id: string, message: string): Promise<void> {
  await db.runAsync(`UPDATE ${T.category} SET ${c.lastSyncError} = ? WHERE ${c.id} = ?`, [message, id]);
}

export async function purgeCategory(db: Db, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM ${T.category} WHERE ${c.id} = ?`, [id]);
}

/** Ghi dữ liệu từ server vào local. Không bao giờ ghi đè bản ghi đang Pending. */
export async function upsertCategoryFromRemote(
  db: Db,
  cat: Omit<DishCategory, 'syncStatus'>,
  remoteId: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO ${T.category}
      (${c.id}, ${c.name}, ${c.normalizedName}, ${c.description}, ${c.createdAt}, ${c.updatedAt},
       ${c.syncStatus}, ${c.isDeleted}, ${c.remoteId})
     VALUES (?, ?, ?, ?, ?, ?, 'synced', 0, ?)
     ON CONFLICT(${c.id}) DO UPDATE SET
       ${c.name} = excluded.${c.name},
       ${c.normalizedName} = excluded.${c.normalizedName},
       ${c.description} = excluded.${c.description},
       ${c.updatedAt} = excluded.${c.updatedAt},
       ${c.remoteId} = excluded.${c.remoteId},
       ${c.syncStatus} = 'synced',
       ${c.isDeleted} = 0,
       ${c.lastSyncError} = NULL
     WHERE ${T.category}.${c.syncStatus} = 'synced'`,
    [cat.id, cat.name, normalizeName(cat.name), cat.description, cat.createdAt, cat.updatedAt, remoteId],
  );
}

export async function markAllCategoriesPending(db: Db): Promise<void> {
  await db.runAsync(
    `UPDATE ${T.category} SET ${c.syncStatus} = 'pending', ${c.remoteId} = NULL,
       ${c.localVersion} = ${c.localVersion} + 1`,
  );
}

export async function markCategoryPending(db: Db, id: string): Promise<void> {
  await db.runAsync(
    `UPDATE ${T.category} SET ${c.syncStatus} = 'pending', ${c.remoteId} = NULL,
       ${c.localVersion} = ${c.localVersion} + 1 WHERE ${c.id} = ?`,
    [id],
  );
}
