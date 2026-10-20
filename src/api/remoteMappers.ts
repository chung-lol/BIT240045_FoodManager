import { COLS, REMOTE_FIELDS } from '@/database/schema';
import type { Dish, DishCategory, DishImage } from '@/models';
import { cleanText, isHttpUrl } from '@/utils/text';
import type { RemoteRecord } from './mockApiClient';

/**
 * Payload gửi lên MockAPI dùng CHÍNH tên cột có tiền tố MSSV, ví dụ:
 *   { "MSSV_Id": "...", "MSSV_Name": "Chicken Rice", "MSSV_Price": 45000, ... }
 * `id` (không tiền tố) là id kỹ thuật do MockAPI tự sinh, app chỉ dùng làm địa chỉ URL.
 * Khoá nghiệp vụ để nhận diện bản ghi luôn là {MSSV}_Id (UUID sinh trên thiết bị).
 */

export function toRemoteCategory(c: Omit<DishCategory, 'syncStatus'>): Record<string, unknown> {
  return {
    [COLS.id]: c.id,
    [COLS.name]: c.name,
    [COLS.description]: c.description,
    [COLS.createdAt]: c.createdAt,
    [COLS.updatedAt]: c.updatedAt,
  };
}

export function toRemoteDish(d: Omit<Dish, 'syncStatus'>): Record<string, unknown> {
  return {
    [COLS.id]: d.id,
    [COLS.name]: d.name,
    [COLS.description]: d.description,
    [COLS.price]: d.price,
    [COLS.preparationTime]: d.preparationTime,
    [COLS.isAvailable]: d.isAvailable,
    [COLS.dishCategoryId]: d.dishCategoryId,
    [COLS.createdAt]: d.createdAt,
    [COLS.updatedAt]: d.updatedAt,
    // Ảnh nhúng vào bản ghi món dưới dạng chuỗi JSON: chỉ cần 2 resource trên MockAPI
    // và kiểu field String luôn lưu được, không phụ thuộc kiểu Object/Array của MockAPI.
    [REMOTE_FIELDS.images]: JSON.stringify(
      d.images.map((i) => ({
        [COLS.id]: i.id,
        [COLS.imageUrl]: i.imageUrl,
        [COLS.isThumbnail]: i.isThumbnail,
        [COLS.sortOrder]: i.sortOrder,
      })),
    ),
  };
}


const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const bool = (v: unknown) => v === true || v === 1 || v === 'true' || v === '1';

/** Đọc bản ghi từ server, trả null nếu dữ liệu không hợp lệ (vd dữ liệu mẫu MockAPI tự sinh). */
export function fromRemoteCategory(r: RemoteRecord): Omit<DishCategory, 'syncStatus'> | null {
  const id = str(r[COLS.id]);
  const name = cleanText(str(r[COLS.name]));
  if (!id || !name) return null;
  const updatedAt = num(r[COLS.updatedAt]);
  const createdAt = num(r[COLS.createdAt]);
  return {
    id,
    name,
    description: str(r[COLS.description]),
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

export function fromRemoteDish(r: RemoteRecord): Omit<Dish, 'syncStatus'> | null {
  const id = str(r[COLS.id]);
  const name = cleanText(str(r[COLS.name]));
  const price = num(r[COLS.price]);
  const time = num(r[COLS.preparationTime]);
  const categoryId = str(r[COLS.dishCategoryId]);
  if (!id || !name || !categoryId) return null;
  if (!(price > 0) || !(time > 0) || !Number.isInteger(time)) return null;

  let rawImages: unknown = r[REMOTE_FIELDS.images];
  if (typeof rawImages === 'string') {
    try {
      rawImages = JSON.parse(rawImages);
    } catch {
      rawImages = [];
    }
  }
  const images: DishImage[] = (Array.isArray(rawImages) ? rawImages : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i, index) => ({
      id: str(i[COLS.id]) || `${id}-img-${index + 1}`,
      dishId: id,
      imageUrl: str(i[COLS.imageUrl]).trim(),
      isThumbnail: bool(i[COLS.isThumbnail]),
      sortOrder: Number.isFinite(num(i[COLS.sortOrder])) ? num(i[COLS.sortOrder]) : index,
    }))
    .filter((i) => isHttpUrl(i.imageUrl));

  // Bảo toàn bất biến "tối đa 1 thumbnail" kể cả khi dữ liệu server bị sửa tay sai.
  let thumbSeen = false;
  for (const i of images) {
    if (i.isThumbnail && !thumbSeen) thumbSeen = true;
    else i.isThumbnail = false;
  }
  if (images.length > 0 && !thumbSeen) images[0].isThumbnail = true;
  // Id ảnh phải duy nhất toàn bảng
  const seen = new Set<string>();
  for (const i of images) {
    if (seen.has(i.id)) i.id = `${id}-img-${i.sortOrder}-${seen.size}`;
    seen.add(i.id);
  }

  const updatedAt = num(r[COLS.updatedAt]);
  const createdAt = num(r[COLS.createdAt]);
  return {
    id,
    name,
    description: str(r[COLS.description]),
    price,
    preparationTime: time,
    isAvailable: bool(r[COLS.isAvailable]),
    dishCategoryId: categoryId,
    images,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}
