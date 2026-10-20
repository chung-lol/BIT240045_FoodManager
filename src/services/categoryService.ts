import { getDb, writeTransaction } from '@/database/database';
import type { CategoryFormInput, CategoryWithCount, DishCategory } from '@/models';
import * as catRepo from '@/repositories/categoryRepository';
import { notifyDataChanged } from '@/store/dataStore';
import { scheduleSync } from '@/sync/syncScheduler';
import { newId } from '@/utils/id';
import { type CategoryField, hasErrors, ValidationError, validateCategoryShape } from './validationService';

export class CategoryInUseError extends Error {
  constructor(
    public readonly categoryName: string,
    public readonly dishCount: number,
  ) {
    super('CATEGORY_IN_USE');
    this.name = 'CategoryInUseError';
  }
}

export async function getCategories(): Promise<DishCategory[]> {
  return catRepo.listCategories(await getDb());
}

export async function getCategoriesWithCount(): Promise<CategoryWithCount[]> {
  return catRepo.listCategoriesWithCount(await getDb());
}

const isUniqueViolation = (e: unknown) => String((e as Error)?.message ?? e).includes('UNIQUE constraint failed');

export async function saveCategory(input: CategoryFormInput, id?: string): Promise<string> {
  const { errors, value } = validateCategoryShape(input);
  const db = await getDb();
  if (!errors.name && (await catRepo.categoryNameExists(db, value.name, id))) {
    errors.name = { key: 'duplicateCategoryName' };
  }
  if (hasErrors(errors)) throw new ValidationError<CategoryField>(errors);

  const now = Date.now();
  const categoryId = id ?? newId();
  try {
    await writeTransaction(async (tx) => {
      if (id) await catRepo.updateCategoryLocal(tx, id, value, now);
      else await catRepo.insertCategory(tx, { id: categoryId, ...value, createdAt: now, updatedAt: now });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError<CategoryField>({ name: { key: 'duplicateCategoryName' } });
    throw e;
  }
  notifyDataChanged();
  scheduleSync('local-change');
  return categoryId;
}

/**
 * Ràng buộc "không xoá danh mục đang có món" được kiểm tra 2 lớp:
 *  1) Service: đếm món còn hoạt động -> ném CategoryInUseError (thông báo thân thiện).
 *  2) SQLite: FOREIGN KEY ... ON DELETE RESTRICT chặn xoá vật lý nếu còn món tham chiếu.
 * Kiểm tra lại BÊN TRONG transaction để tránh race (vd vừa có món được thêm).
 */
export async function deleteCategory(id: string): Promise<void> {
  await writeTransaction(async (db) => {
    const cat = await catRepo.getCategory(db, id);
    if (!cat) return;
    const count = await catRepo.countActiveDishesInCategory(db, id);
    if (count > 0) throw new CategoryInUseError(cat.name, count);
    await catRepo.tombstoneCategory(db, id, Date.now());
  });
  notifyDataChanged();
  scheduleSync('local-change');
}
