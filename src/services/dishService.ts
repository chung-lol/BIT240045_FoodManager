import { getDb, writeTransaction } from '@/database/database';
import type { DishDetail, DishFormInput, DishImage, DishListItem } from '@/models';
import { getCategory } from '@/repositories/categoryRepository';
import * as dishRepo from '@/repositories/dishRepository';
import { notifyDataChanged } from '@/store/dataStore';
import { scheduleSync } from '@/sync/syncScheduler';
import { newId } from '@/utils/id';
import {
  type CleanDishInput,
  type DishField,
  type ErrorMessage,
  hasErrors,
  ValidationError,
  validateDishShape,
} from './validationService';

/**
 * Luồng ghi offline-first:
 *   validate -> ghi SQLite (món + ảnh trong 1 transaction, đánh dấu Pending)
 *   -> báo UI tải lại ngay -> hẹn Sync Engine đẩy lên MockAPI khi có mạng.
 * KHÔNG chờ MockAPI: mất mạng thì thao tác lưu vẫn thành công.
 */

export async function getAllDishes(): Promise<DishListItem[]> {
  return dishRepo.listDishes(await getDb());
}

export async function getDish(id: string): Promise<DishDetail | null> {
  return dishRepo.getDishDetail(await getDb(), id);
}

/** Chuẩn hoá danh sách ảnh: giữ thứ tự, gán id, đảm bảo có đúng 1 thumbnail nếu có ảnh. */
function buildImages(dishId: string, input: CleanDishInput['images']): DishImage[] {
  const images = input.map((img, index) => ({
    id: img.id ?? newId(),
    dishId,
    imageUrl: img.imageUrl,
    isThumbnail: img.isThumbnail,
    sortOrder: index,
  }));
  if (images.length > 0 && !images.some((i) => i.isThumbnail)) images[0].isThumbnail = true;
  return images;
}

const isUniqueViolation = (e: unknown) => String((e as Error)?.message ?? e).includes('UNIQUE constraint failed');

async function validateWithDb(input: DishFormInput, excludeId?: string) {
  const { errors, value } = validateDishShape(input);
  const db = await getDb();
  const dbErrors: Partial<Record<DishField, ErrorMessage>> = { ...errors };

  if (!dbErrors.dishCategoryId) {
    const cat = await getCategory(db, value.dishCategoryId);
    if (!cat) dbErrors.dishCategoryId = { key: 'categoryNotFound' };
  }
  if (!dbErrors.name && !dbErrors.dishCategoryId) {
    const dup = await dishRepo.dishNameExistsInCategory(db, value.name, value.dishCategoryId, excludeId);
    if (dup) dbErrors.name = { key: 'duplicateDishName' };
  }
  if (hasErrors(dbErrors)) throw new ValidationError<DishField>(dbErrors);
  return value;
}

export async function createDish(input: DishFormInput): Promise<string> {
  const value = await validateWithDb(input);
  const id = newId();
  const now = Date.now();
  try {
    await writeTransaction(async (db) => {
      await dishRepo.insertDish(db, {
        id,
        name: value.name,
        description: value.description,
        price: value.price,
        preparationTime: value.preparationTime,
        isAvailable: value.isAvailable,
        dishCategoryId: value.dishCategoryId,
        createdAt: now,
        updatedAt: now,
      });
      await dishRepo.replaceDishImages(db, id, buildImages(id, value.images));
    });
  } catch (e) {
    // Lưới an toàn: unique index trong SQLite chặn trùng tên kể cả khi kiểm tra ở trên bị "lọt".
    if (isUniqueViolation(e)) throw new ValidationError<DishField>({ name: { key: 'duplicateDishName' } });
    throw e;
  }
  notifyDataChanged();
  scheduleSync('local-change');
  return id;
}

export async function updateDish(id: string, input: DishFormInput): Promise<void> {
  const db = await getDb();
  const existing = await dishRepo.getDishDetail(db, id);
  if (!existing) throw new Error('NOT_FOUND');
  const value = await validateWithDb(input, id);
  const now = Date.now();
  try {
    await writeTransaction(async (tx) => {
      await dishRepo.updateDishLocal(tx, {
        id,
        name: value.name,
        description: value.description,
        price: value.price,
        preparationTime: value.preparationTime,
        isAvailable: value.isAvailable,
        dishCategoryId: value.dishCategoryId,
        updatedAt: now,
      });
      await dishRepo.replaceDishImages(tx, id, buildImages(id, value.images));
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError<DishField>({ name: { key: 'duplicateDishName' } });
    throw e;
  }
  notifyDataChanged();
  scheduleSync('local-change');
}

export async function deleteDish(id: string): Promise<void> {
  await writeTransaction(async (db) => {
    await dishRepo.tombstoneDish(db, id, Date.now());
  });
  notifyDataChanged();
  scheduleSync('local-change');
}

/** Đổi ảnh đại diện: bỏ cờ ảnh cũ + bật ảnh mới trong CÙNG transaction. */
export async function changeThumbnail(dishId: string, imageId: string): Promise<void> {
  await writeTransaction(async (db) => {
    const ok = await dishRepo.setThumbnail(db, dishId, imageId);
    if (!ok) throw new Error('IMAGE_NOT_FOUND'); // rollback, không để món mất thumbnail
    await dishRepo.touchDish(db, dishId, Date.now());
  });
  notifyDataChanged();
  scheduleSync('local-change');
}
