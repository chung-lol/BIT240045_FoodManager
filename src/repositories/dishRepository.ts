import type { Db } from '@/database/database';
import { COLS, SQL, SYNC_STATUS, type SyncStatus } from '@/database/schema';
import type { Dish, DishDetail, DishImage, DishListItem } from '@/models';
import { normalizeName } from '@/utils/text';

const { T, c } = SQL;
type Row = Record<string, unknown>;

// ------------------------------------------------------------------
// Mapping: cột có tiền tố MSSV  <->  model TypeScript
// ------------------------------------------------------------------
function mapImage(row: Row): DishImage {
  return {
    id: String(row[COLS.id]),
    dishId: String(row[COLS.dishId]),
    imageUrl: String(row[COLS.imageUrl]),
    isThumbnail: Number(row[COLS.isThumbnail]) === 1,
    sortOrder: Number(row[COLS.sortOrder]),
  };
}

function mapDishBase(row: Row): Omit<Dish, 'images'> {
  return {
    id: String(row[COLS.id]),
    name: String(row[COLS.name]),
    description: String(row[COLS.description] ?? ''),
    price: Number(row[COLS.price]),
    preparationTime: Number(row[COLS.preparationTime]),
    isAvailable: Number(row[COLS.isAvailable]) === 1,
    dishCategoryId: String(row[COLS.dishCategoryId]),
    createdAt: Number(row[COLS.createdAt]),
    updatedAt: Number(row[COLS.updatedAt]),
    syncStatus: row[COLS.syncStatus] as SyncStatus,
  };
}

// ------------------------------------------------------------------
// Đọc
// ------------------------------------------------------------------

/** Danh sách món chưa xoá kèm tên danh mục, ảnh đại diện và số ảnh. */
export async function listDishes(db: Db): Promise<DishListItem[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT d.*, cat.${c.name} AS CategoryName,
        (SELECT i.${c.imageUrl} FROM ${T.image} i
          WHERE i.${c.dishId} = d.${c.id}
          ORDER BY i.${c.isThumbnail} DESC, i.${c.sortOrder} ASC LIMIT 1) AS ThumbnailUrl,
        (SELECT COUNT(*) FROM ${T.image} i WHERE i.${c.dishId} = d.${c.id}) AS ImageCount
     FROM ${T.dish} d
     JOIN ${T.category} cat ON cat.${c.id} = d.${c.dishCategoryId}
     WHERE d.${c.isDeleted} = 0`,
  );
  return rows.map((r) => ({
    ...mapDishBase(r),
    categoryName: String(r.CategoryName),
    thumbnailUrl: (r.ThumbnailUrl as string | null) ?? null,
    imageCount: Number(r.ImageCount),
  }));
}

export async function getDishImages(db: Db, dishId: string): Promise<DishImage[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM ${T.image} WHERE ${c.dishId} = ? ORDER BY ${c.sortOrder} ASC`,
    [dishId],
  );
  return rows.map(mapImage);
}

export async function getDishDetail(db: Db, id: string): Promise<DishDetail | null> {
  const row = await db.getFirstAsync<Row>(
    `SELECT d.*, cat.${c.name} AS CategoryName
     FROM ${T.dish} d
     JOIN ${T.category} cat ON cat.${c.id} = d.${c.dishCategoryId}
     WHERE d.${c.id} = ? AND d.${c.isDeleted} = 0`,
    [id],
  );
  if (!row) return null;
  const images = await getDishImages(db, id);
  return { ...mapDishBase(row), images, categoryName: String(row.CategoryName) };
}

export async function dishNameExistsInCategory(
  db: Db,
  name: string,
  categoryId: string,
  excludeId?: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<Row>(
    `SELECT 1 AS x FROM ${T.dish}
     WHERE ${c.dishCategoryId} = ? AND ${c.normalizedName} = ? AND ${c.isDeleted} = 0 AND ${c.id} <> ?`,
    [categoryId, normalizeName(name), excludeId ?? ''],
  );
  return !!row;
}

// ------------------------------------------------------------------
// Ghi (luôn được gọi bên trong writeTransaction)
// ------------------------------------------------------------------

type DishWrite = Omit<Dish, 'images' | 'syncStatus'>;

export async function insertDish(db: Db, dish: DishWrite, syncStatus: SyncStatus = SYNC_STATUS.pending) {
  await db.runAsync(
    `INSERT INTO ${T.dish}
      (${c.id}, ${c.name}, ${c.normalizedName}, ${c.description}, ${c.price}, ${c.preparationTime},
       ${c.isAvailable}, ${c.dishCategoryId}, ${c.createdAt}, ${c.updatedAt}, ${c.syncStatus})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dish.id,
      dish.name,
      normalizeName(dish.name),
      dish.description,
      dish.price,
      dish.preparationTime,
      dish.isAvailable ? 1 : 0,
      dish.dishCategoryId,
      dish.createdAt,
      dish.updatedAt,
      syncStatus,
    ],
  );
}

export async function updateDishLocal(db: Db, dish: Omit<DishWrite, 'createdAt'>) {
  await db.runAsync(
    `UPDATE ${T.dish} SET
       ${c.name} = ?, ${c.normalizedName} = ?, ${c.description} = ?, ${c.price} = ?,
       ${c.preparationTime} = ?, ${c.isAvailable} = ?, ${c.dishCategoryId} = ?, ${c.updatedAt} = ?,
       ${c.syncStatus} = 'pending', ${c.localVersion} = ${c.localVersion} + 1
     WHERE ${c.id} = ? AND ${c.isDeleted} = 0`,
    [
      dish.name,
      normalizeName(dish.name),
      dish.description,
      dish.price,
      dish.preparationTime,
      dish.isAvailable ? 1 : 0,
      dish.dishCategoryId,
      dish.updatedAt,
      dish.id,
    ],
  );
}

/** Đánh dấu món có thay đổi cần đồng bộ (vd: chỉ đổi thumbnail). */
export async function touchDish(db: Db, id: string, now: number) {
  await db.runAsync(
    `UPDATE ${T.dish} SET ${c.updatedAt} = ?, ${c.syncStatus} = 'pending',
       ${c.localVersion} = ${c.localVersion} + 1
     WHERE ${c.id} = ?`,
    [now, id],
  );
}

/**
 * Thay toàn bộ ảnh của món. Gọi trong transaction nên nếu một ảnh lỗi
 * thì cả món + ảnh đều rollback, không bao giờ "lưu được nửa chừng".
 */
export async function replaceDishImages(db: Db, dishId: string, images: DishImage[]) {
  await db.runAsync(`DELETE FROM ${T.image} WHERE ${c.dishId} = ?`, [dishId]);
  for (const img of images) {
    await db.runAsync(
      `INSERT INTO ${T.image} (${c.id}, ${c.dishId}, ${c.imageUrl}, ${c.isThumbnail}, ${c.sortOrder})
       VALUES (?, ?, ?, ?, ?)`,
      [img.id, dishId, img.imageUrl, img.isThumbnail ? 1 : 0, img.sortOrder],
    );
  }
}

/**
 * Đổi ảnh đại diện. BẮT BUỘC bỏ cờ ở ảnh cũ TRƯỚC, sau đó mới bật ảnh mới;
 * làm ngược thứ tự sẽ vi phạm unique index "tối đa 1 thumbnail".
 */
export async function setThumbnail(db: Db, dishId: string, imageId: string): Promise<boolean> {
  await db.runAsync(`UPDATE ${T.image} SET ${c.isThumbnail} = 0 WHERE ${c.dishId} = ?`, [dishId]);
  const res = await db.runAsync(
    `UPDATE ${T.image} SET ${c.isThumbnail} = 1 WHERE ${c.id} = ? AND ${c.dishId} = ?`,
    [imageId, dishId],
  );
  return res.changes === 1;
}

export async function tombstoneDish(db: Db, id: string, now: number) {
  await db.runAsync(
    `UPDATE ${T.dish} SET ${c.isDeleted} = 1, ${c.updatedAt} = ?, ${c.syncStatus} = 'pending',
       ${c.localVersion} = ${c.localVersion} + 1
     WHERE ${c.id} = ?`,
    [now, id],
  );
}

// ------------------------------------------------------------------
// Dành cho Sync Engine
// ------------------------------------------------------------------

export interface DishSyncRow extends Dish {
  isDeleted: boolean;
  remoteId: string | null;
  localVersion: number;
}

export async function listAllDishesForSync(db: Db): Promise<DishSyncRow[]> {
  const rows = await db.getAllAsync<Row>(`SELECT * FROM ${T.dish}`);
  const imageRows = await db.getAllAsync<Row>(`SELECT * FROM ${T.image} ORDER BY ${c.sortOrder}`);
  const byDish = new Map<string, DishImage[]>();
  for (const r of imageRows) {
    const img = mapImage(r);
    const list = byDish.get(img.dishId) ?? [];
    list.push(img);
    byDish.set(img.dishId, list);
  }
  return rows.map((r) => ({
    ...mapDishBase(r),
    images: byDish.get(String(r[COLS.id])) ?? [],
    isDeleted: Number(r[COLS.isDeleted]) === 1,
    remoteId: (r[COLS.remoteId] as string | null) ?? null,
    localVersion: Number(r[COLS.localVersion]),
  }));
}

export async function markDishSynced(db: Db, id: string, remoteId: string, version: number) {
  await db.runAsync(`UPDATE ${T.dish} SET ${c.remoteId} = ? WHERE ${c.id} = ?`, [remoteId, id]);
  await db.runAsync(
    `UPDATE ${T.dish} SET ${c.syncStatus} = 'synced', ${c.lastSyncError} = NULL
     WHERE ${c.id} = ? AND ${c.localVersion} = ?`,
    [id, version],
  );
}

export async function setDishSyncError(db: Db, id: string, message: string) {
  await db.runAsync(`UPDATE ${T.dish} SET ${c.lastSyncError} = ? WHERE ${c.id} = ?`, [message, id]);
}

export async function purgeDish(db: Db, id: string) {
  // Ảnh bị xoá theo nhờ ON DELETE CASCADE.
  await db.runAsync(`DELETE FROM ${T.dish} WHERE ${c.id} = ?`, [id]);
}

/**
 * Ghi bản ghi từ MockAPI vào local (bao gồm ảnh).
 * Trả về false nếu bỏ qua vì bản local đang Pending (thay đổi local được ưu tiên).
 */
export async function upsertDishFromRemote(db: Db, dish: Omit<Dish, 'syncStatus'>, remoteId: string) {
  const existing = await db.getFirstAsync<Row>(
    `SELECT ${c.syncStatus} AS s FROM ${T.dish} WHERE ${c.id} = ?`,
    [dish.id],
  );
  if (existing && existing.s !== SYNC_STATUS.synced) return false;

  if (existing) {
    await db.runAsync(
      `UPDATE ${T.dish} SET
         ${c.name} = ?, ${c.normalizedName} = ?, ${c.description} = ?, ${c.price} = ?,
         ${c.preparationTime} = ?, ${c.isAvailable} = ?, ${c.dishCategoryId} = ?,
         ${c.updatedAt} = ?, ${c.remoteId} = ?, ${c.isDeleted} = 0, ${c.lastSyncError} = NULL
       WHERE ${c.id} = ? AND ${c.syncStatus} = 'synced'`,
      [
        dish.name,
        normalizeName(dish.name),
        dish.description,
        dish.price,
        dish.preparationTime,
        dish.isAvailable ? 1 : 0,
        dish.dishCategoryId,
        dish.updatedAt,
        remoteId,
        dish.id,
      ],
    );
  } else {
    await insertDish(db, dish, SYNC_STATUS.synced);
    await db.runAsync(`UPDATE ${T.dish} SET ${c.remoteId} = ? WHERE ${c.id} = ?`, [remoteId, dish.id]);
  }
  await replaceDishImages(db, dish.id, dish.images);
  return true;
}

export async function markAllDishesPending(db: Db) {
  await db.runAsync(
    `UPDATE ${T.dish} SET ${c.syncStatus} = 'pending', ${c.remoteId} = NULL,
       ${c.localVersion} = ${c.localVersion} + 1`,
  );
}

export async function markDishPending(db: Db, id: string) {
  await db.runAsync(
    `UPDATE ${T.dish} SET ${c.syncStatus} = 'pending', ${c.remoteId} = NULL,
       ${c.localVersion} = ${c.localVersion} + 1 WHERE ${c.id} = ?`,
    [id],
  );
}

export async function countPending(db: Db): Promise<number> {
  const row = await db.getFirstAsync<Row>(
    `SELECT
      (SELECT COUNT(*) FROM ${T.dish} WHERE ${c.syncStatus} = 'pending') +
      (SELECT COUNT(*) FROM ${T.category} WHERE ${c.syncStatus} = 'pending') AS n`,
  );
  return Number(row?.n ?? 0);
}

/** Toàn bộ URL ảnh (dùng để tải trước vào cache đĩa phục vụ xem offline). */
export async function listAllImageUrls(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<Row>(`SELECT DISTINCT ${c.imageUrl} AS u FROM ${T.image}`);
  return rows.map((r) => String(r.u));
}
