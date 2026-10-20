import { BUSINESS_RULES } from '@/config/appConfig';
import type { DishListItem, SpeedLabel } from '@/models';
import type { DishFilters } from '@/store/filterStore';
import { parseMoney, searchKey } from '@/utils/text';
import type { ErrorMessage } from './validationService';

export function speedLabel(preparationTime: number): SpeedLabel {
  return preparationTime <= BUSINESS_RULES.quickDishMaxMinutes ? 'quick' : 'regular';
}

export interface FilterResult {
  items: DishListItem[];
  priceError: ErrorMessage | null;
}

/**
 * Áp dụng ĐỒNG THỜI tất cả điều kiện (AND), rồi mới sắp xếp:
 *   tên chứa chuỗi tìm kiếm  AND  danh mục  AND  trạng thái  AND  min <= giá <= max
 * Hàm thuần (không đụng DB/UI) => dễ giải thích trong video và dễ unit test.
 */
export function applyDishFilters(all: DishListItem[], f: DishFilters): FilterResult {
  let priceError: ErrorMessage | null = null;

  const minRaw = f.minPrice.trim();
  const maxRaw = f.maxPrice.trim();
  let min = minRaw ? parseMoney(minRaw) : null;
  let max = maxRaw ? parseMoney(maxRaw) : null;

  if (min !== null && Number.isNaN(min)) {
    priceError = { key: 'minPriceInvalid' };
    min = null;
  }
  if (max !== null && Number.isNaN(max)) {
    priceError = priceError ?? { key: 'maxPriceInvalid' };
    max = null;
  }
  if (min !== null && max !== null && min > max) {
    // Khoảng giá vô lý: báo lỗi và BỎ QUA điều kiện giá (không trả về danh sách rỗng gây hiểu nhầm).
    priceError = { key: 'priceRangeInvalid' };
    min = null;
    max = null;
  }

  const q = searchKey(f.search);

  const items = all.filter((d) => {
    if (q && !searchKey(d.name).includes(q)) return false;
    if (f.categoryId && d.dishCategoryId !== f.categoryId) return false;
    if (f.status === 'available' && !d.isAvailable) return false;
    if (f.status === 'unavailable' && d.isAvailable) return false;
    if (min !== null && d.price < min) return false;
    if (max !== null && d.price > max) return false;
    return true;
  });

  const byName = (a: DishListItem, b: DishListItem) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  items.sort((a, b) => {
    switch (f.sort) {
      case 'priceAsc':
        return a.price - b.price || byName(a, b);
      case 'priceDesc':
        return b.price - a.price || byName(a, b);
      case 'timeAsc':
        return a.preparationTime - b.preparationTime || byName(a, b);
      default:
        return byName(a, b);
    }
  });

  return { items, priceError };
}

export function countActiveFilters(f: DishFilters): number {
  let n = 0;
  if (f.categoryId) n++;
  if (f.status !== 'all') n++;
  if (f.minPrice.trim() || f.maxPrice.trim()) n++;
  if (f.sort !== 'nameAsc') n++;
  return n;
}
