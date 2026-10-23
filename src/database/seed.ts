import { getDb, writeTransaction } from './database';
import { SETTING_KEYS, SQL } from './schema';
import { insertCategory } from '@/repositories/categoryRepository';
import { insertDish, replaceDishImages, touchDish } from '@/repositories/dishRepository';
import { getSetting, setSetting } from '@/repositories/settingRepository';

/**
 * Dữ liệu mẫu: 3 danh mục, 15 món (10 món ăn + 5 đồ uống), có món ngừng bán,
 * có món Quick/Regular và ảnh đúng với tên món để demo trực quan.
 *
 * Hai quyết định quan trọng:
 *  1) Seed có version. Bản cũ version 1 (5 món) sẽ tự nâng lên version 2
 *     (15 món), nhưng các lần mở sau không sinh thêm bản ghi.
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

const SEED_VERSION = '2';

/** Ảnh thật theo đúng món; tham số crop giúp card và màn chi tiết tải ảnh vừa phải. */
const unsplash = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=82`;

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
    images: [
      unsplash('photo-1569058242252-623df46b5025'),
      unsplash('photo-1603496987674-79600a000f55'),
      unsplash('photo-1605704931020-ba62cdb2ba9b'),
    ],
  },
  {
    id: 'seed-dish-beef-noodles',
    name: 'Beef Noodles',
    description: 'Rice noodles in slow-cooked beef broth with fresh herbs.',
    price: 55000,
    preparationTime: 15,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [unsplash('photo-1657457320973-e8cf9b4d4a59')],
  },
  {
    id: 'seed-dish-spring-rolls',
    name: 'Spring Rolls',
    description: 'Crispy fried rolls with pork, mushroom and vermicelli.',
    price: 30000,
    preparationTime: 10,
    isAvailable: true,
    dishCategoryId: 'seed-cat-appetizer',
    images: [unsplash('photo-1515022376298-7333f33e704b')],
  },
  {
    id: 'seed-dish-french-fries',
    name: 'French Fries',
    description: 'Golden potato fries with ketchup.',
    price: 25000,
    preparationTime: 8,
    isAvailable: false,
    dishCategoryId: 'seed-cat-appetizer',
    images: [unsplash('photo-1573080496219-bb080dd4f877')],
  },
  {
    id: 'seed-dish-lemon-tea',
    name: 'Lemon Tea',
    description: 'Iced black tea with fresh lemon.',
    price: 18000,
    preparationTime: 5,
    isAvailable: true,
    dishCategoryId: 'seed-cat-drink',
    images: [unsplash('photo-1556679343-c7306c1976bc')],
  },
  {
    id: 'seed-dish-margherita-pizza',
    name: 'Margherita Pizza',
    description: 'Stone-baked pizza with tomato, mozzarella and fresh basil.',
    price: 89000,
    preparationTime: 18,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [unsplash('photo-1574071318508-1cdbab80d002')],
  },
  {
    id: 'seed-dish-beef-burger',
    name: 'Beef Burger',
    description: 'Grilled beef patty with cheese, lettuce, tomato and house sauce.',
    price: 79000,
    preparationTime: 15,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [unsplash('photo-1568901346375-23c9450c58cd')],
  },
  {
    id: 'seed-dish-spaghetti-bolognese',
    name: 'Spaghetti Bolognese',
    description: 'Spaghetti served with slow-cooked beef and tomato sauce.',
    price: 85000,
    preparationTime: 22,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [unsplash('photo-1473093295043-cdd812d0e601')],
  },
  {
    id: 'seed-dish-sushi-platter',
    name: 'Sushi Platter',
    description: 'A selection of fresh nigiri and maki rolls with soy sauce.',
    price: 129000,
    preparationTime: 25,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [unsplash('photo-1579871494447-9811cf80d66c')],
  },
  {
    id: 'seed-dish-grilled-salmon',
    name: 'Grilled Salmon',
    description: 'Grilled salmon fillet served with seasonal vegetables and lemon.',
    price: 149000,
    preparationTime: 24,
    isAvailable: true,
    dishCategoryId: 'seed-cat-main',
    images: [unsplash('photo-1467003909585-2f8a72700288')],
  },
  {
    id: 'seed-dish-iced-coffee',
    name: 'Iced Coffee',
    description: 'Strong chilled coffee served over ice with optional condensed milk.',
    price: 25000,
    preparationTime: 5,
    isAvailable: true,
    dishCategoryId: 'seed-cat-drink',
    images: [unsplash('photo-1517701604599-bb29b565090c')],
  },
  {
    id: 'seed-dish-orange-juice',
    name: 'Orange Juice',
    description: 'Freshly squeezed orange juice served cold.',
    price: 30000,
    preparationTime: 5,
    isAvailable: true,
    dishCategoryId: 'seed-cat-drink',
    images: [unsplash('photo-1600271886742-f049cd451bba')],
  },
  {
    id: 'seed-dish-caesar-salad',
    name: 'Caesar Salad',
    description: 'Crisp romaine lettuce with parmesan, croutons and Caesar dressing.',
    price: 59000,
    preparationTime: 10,
    isAvailable: true,
    dishCategoryId: 'seed-cat-appetizer',
    images: [unsplash('photo-1546793665-c74683f339c1')],
  },
  {
    id: 'seed-dish-milk-tea',
    name: 'Milk Tea',
    description: 'Chilled milk tea with chewy black tapioca pearls.',
    price: 35000,
    preparationTime: 6,
    isAvailable: true,
    dishCategoryId: 'seed-cat-drink',
    images: [unsplash('photo-1751199956820-ecb919004024')],
  },
  {
    id: 'seed-dish-coconut-water',
    name: 'Coconut Water',
    description: 'Fresh coconut water served chilled with tender coconut flesh.',
    price: 28000,
    preparationTime: 4,
    isAvailable: true,
    dishCategoryId: 'seed-cat-drink',
    images: ['https://image.freizeit.at/images/cfs_square_616/8781653/fbplus13.png'],
  },
];

/** Các món được bổ sung ở seed v2 phải có LocalVersion > 1 để Sync Engine hiểu
 * đây là dữ liệu mới cần POST, không nhầm với seed cũ đã bị người dùng xoá trên server. */
const V2_ADDED_DISH_IDS = new Set(DISHES.slice(5).map((d) => d.id));

export async function seedIfNeeded(): Promise<boolean> {
  const db = await getDb();
  const installedVersion = await getSetting(db, SETTING_KEYS.seedDone);
  if (installedVersion === SEED_VERSION) return false;

  await writeTransaction(async (tx) => {
    const categoryRows = await tx.getAllAsync<Record<string, unknown>>(
      `SELECT ${SQL.c.id} AS id FROM ${SQL.T.category}`,
    );
    const existingCategoryIds = new Set(categoryRows.map((r) => String(r.id)));
    for (const c of CATEGORIES) {
      if (!existingCategoryIds.has(c.id)) {
        await insertCategory(tx, { ...c, createdAt: SEED_TS, updatedAt: SEED_TS });
      }
    }

    const dishRows = await tx.getAllAsync<Record<string, unknown>>(
      `SELECT ${SQL.c.id} AS id, ${SQL.c.localVersion} AS localVersion,
              ${SQL.c.isDeleted} AS isDeleted FROM ${SQL.T.dish}`,
    );
    const existingDishes = new Map(dishRows.map((r) => [String(r.id), r]));

    for (const d of DISHES) {
      const { images, ...dish } = d;
      const mappedImages = images.map((url, i) => ({
        id: `${d.id}-img-${i + 1}`,
        dishId: d.id,
        imageUrl: url,
        isThumbnail: i === 0,
        sortOrder: i,
      }));
      const existing = existingDishes.get(d.id);
      if (!existing) {
        await insertDish(tx, { ...dish, createdAt: SEED_TS, updatedAt: SEED_TS });
        await replaceDishImages(tx, d.id, mappedImages);
        if (installedVersion === '1' && V2_ADDED_DISH_IDS.has(d.id)) {
          await touchDish(tx, d.id, SEED_TS);
        }
      } else if (
        installedVersion === '1' &&
        Number(existing.localVersion) === 1 &&
        Number(existing.isDeleted) === 0
      ) {
        // Nâng cấp ảnh ngẫu nhiên của seed v1 thành ảnh đúng món. Chỉ thay những
        // seed chưa từng được người dùng sửa để không ghi đè dữ liệu cá nhân.
        await replaceDishImages(tx, d.id, mappedImages);
        await touchDish(tx, d.id, Date.now());
      }
    }
    // Đặt version trong cùng transaction: nâng cấp thành công trọn vẹn hoặc rollback.
    await setSetting(tx, SETTING_KEYS.seedDone, SEED_VERSION);
  });
  return true;
}
