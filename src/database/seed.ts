import { getDb, writeTransaction } from './database';
import { SETTING_KEYS } from './schema';
import { insertCategory } from '@/repositories/categoryRepository';
import { insertDish, replaceDishImages } from '@/repositories/dishRepository';
import { getSetting, setSetting } from '@/repositories/settingRepository';

/**
 * Dữ liệu mẫu: 3 danh mục, 5 món (có món ngừng bán, có món Quick/Regular,
 * 2 món có nhiều ảnh để demo đổi thumbnail).
 *
 * Hai quyết định quan trọng:
 *  1) Chỉ seed MỘT lần (cờ SeedDone trong bảng {MSSV}_AppSetting), không sinh thêm
 *     5 bản ghi mỗi lần mở app.
 *  2) Id CỐ ĐỊNH (không random). Nếu gỡ app cài lại, seed chạy lại nhưng có cùng Id
 *     với bản đã có trên MockAPI => Sync Engine nhận ra là cùng bản ghi, không tạo trùng.
 *     UpdatedAt của seed để rất cũ, nên dữ liệu đã sửa trên server luôn "thắng" seed.
 */
const SEED_TS = Date.UTC(2026, 0, 1);

/**
 * Mọi Id của dữ liệu mẫu bắt đầu bằng tiền tố này. Sync Engine dùng nó để nhận ra
 * "bản ghi mẫu chưa từng bị người dùng sửa": khi MockAPI đã có dữ liệu, server là
 * nguồn sự thật cho các bản ghi đó (món mẫu đã bị xoá trên server sẽ KHÔNG sống lại
 * khi gỡ app cài lại).
 */
export const SEED_ID_PREFIX = 'seed-';

const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/600`;

const CATEGORIES = [
  { id: 'seed-cat-main', name: 'Main Dishes', description: 'Rice, noodles and hearty meals' },
  { id: 'seed-cat-appetizer', name: 'Appetizers', description: 'Small bites before the main course' },
  { id: 'seed-cat-drink', name: 'Drinks', description: 'Tea, coffee and juices' },
];

const DISHES = [
  {
    id: 'seed-dish-chicken-rice',
    name: 'Chicken Rice',
    description: 'Poached chicken with fragrant rice, ginger sauce and cucumber.',
    price: 45000,
    preparationTime: 20,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [img('chicken-rice-1'), img('chicken-rice-2'), img('chicken-rice-3')],
  },
  {
    id: 'seed-dish-beef-noodles',
    name: 'Beef Noodles',
    description: 'Rice noodles in slow-cooked beef broth with fresh herbs.',
    price: 55000,
    preparationTime: 15,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [img('beef-noodles-1'), img('beef-noodles-2')],
  },
  {
    id: 'seed-dish-spring-rolls',
    name: 'Spring Rolls',
    description: 'Crispy fried rolls with pork, mushroom and vermicelli.',
    price: 30000,
    preparationTime: 10,
    isAvailable: true,
    dishCategoryId: 'seed-cat-appetizer',
    images: [img('spring-rolls-1')],
  },
  {
    id: 'seed-dish-french-fries',
    name: 'French Fries',
    description: 'Golden potato fries with ketchup.',
    price: 25000,
    preparationTime: 8,
    isAvailable: false,
    dishCategoryId: 'seed-cat-appetizer',
    images: [],
  },
  {
    id: 'seed-dish-lemon-tea',
    name: 'Lemon Tea',
    description: 'Iced black tea with fresh lemon.',
    price: 18000,
    preparationTime: 5,
    isAvailable: true,
    dishCategoryId: 'seed-cat-drink',
    images: [img('lemon-tea-1')],
  },
];

export async function seedIfNeeded(): Promise<boolean> {
  const db = await getDb();
  if ((await getSetting(db, SETTING_KEYS.seedDone)) === '1') return false;

  await writeTransaction(async (tx) => {
    for (const c of CATEGORIES) {
      await insertCategory(tx, { ...c, createdAt: SEED_TS, updatedAt: SEED_TS });
    }
    for (const d of DISHES) {
      const { images, ...dish } = d;
      await insertDish(tx, { ...dish, createdAt: SEED_TS, updatedAt: SEED_TS });
      await replaceDishImages(
        tx,
        d.id,
        images.map((url, i) => ({
          id: `${d.id}-img-${i + 1}`,
          dishId: d.id,
          imageUrl: url,
          isThumbnail: i === 0,
          sortOrder: i,
        })),
      );
    }
    // Đặt cờ trong cùng transaction: seed thành công trọn vẹn hoặc không có gì.
    await setSetting(tx, SETTING_KEYS.seedDone, '1');
  });
  return true;
}
