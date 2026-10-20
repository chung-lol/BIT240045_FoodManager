import { STUDENT_ID } from '@/config/appConfig';

/**
 * Mọi tên bảng / cột / index đều sinh từ PREFIX = "{MSSV}_".
 * Model TypeScript dùng tên ngắn (id, name, price...), còn Repository
 * chịu trách nhiệm ánh xạ sang tên cột có tiền tố khi đọc/ghi SQLite.
 */
export const PREFIX = `${STUDENT_ID}_`;

const p = (name: string) => `${PREFIX}${name}`;

/** Đặt định danh SQL trong nháy kép: an toàn cả khi MSSV bắt đầu bằng chữ số. */
export const q = (identifier: string) => `"${identifier}"`;

export const TABLES = {
  category: p('DishCategory'),
  dish: p('Dish'),
  image: p('DishImage'),
  setting: p('AppSetting'),
} as const;

export const COLS = {
  id: p('Id'),
  name: p('Name'),
  normalizedName: p('NormalizedName'),
  description: p('Description'),
  price: p('Price'),
  preparationTime: p('PreparationTime'),
  isAvailable: p('IsAvailable'),
  dishCategoryId: p('DishCategoryId'),
  dishId: p('DishId'),
  imageUrl: p('ImageUrl'),
  isThumbnail: p('IsThumbnail'),
  sortOrder: p('SortOrder'),
  createdAt: p('CreatedAt'),
  updatedAt: p('UpdatedAt'),
  // --- Metadata phục vụ offline-first sync ---
  syncStatus: p('SyncStatus'), // 'synced' | 'pending'
  isDeleted: p('IsDeleted'), // tombstone: 1 = đã xoá local, chờ xoá trên server
  remoteId: p('RemoteId'), // id kỹ thuật do MockAPI sinh
  localVersion: p('LocalVersion'), // tăng mỗi lần sửa local, dùng chống race khi sync
  lastSyncError: p('LastSyncError'),
  key: p('Key'),
  value: p('Value'),
} as const;

/** Field chỉ tồn tại trên MockAPI: danh sách ảnh nhúng trong bản ghi món. */
export const REMOTE_FIELDS = {
  images: p('Images'),
} as const;

const T = {
  category: q(TABLES.category),
  dish: q(TABLES.dish),
  image: q(TABLES.image),
  setting: q(TABLES.setting),
};
const c = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, q(v)])) as {
  [K in keyof typeof COLS]: string;
};

/** Tên đã quote, dùng trực tiếp trong câu SQL. */
export const SQL = { T, c };

export const SYNC_STATUS = { synced: 'synced', pending: 'pending' } as const;
export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

/**
 * Migration theo PRAGMA user_version.
 * Thêm phần tử mới vào cuối mảng khi cần đổi schema; KHÔNG sửa migration cũ.
 */
export const MIGRATIONS: string[] = [
  /* v1 */ `
  CREATE TABLE IF NOT EXISTS ${T.category} (
    ${c.id}             TEXT PRIMARY KEY NOT NULL,
    ${c.name}           TEXT NOT NULL CHECK (length(trim(${c.name})) > 0),
    ${c.normalizedName} TEXT NOT NULL,
    ${c.description}    TEXT NOT NULL DEFAULT '',
    ${c.createdAt}      INTEGER NOT NULL,
    ${c.updatedAt}      INTEGER NOT NULL,
    ${c.syncStatus}     TEXT NOT NULL DEFAULT 'pending' CHECK (${c.syncStatus} IN ('synced','pending')),
    ${c.isDeleted}      INTEGER NOT NULL DEFAULT 0 CHECK (${c.isDeleted} IN (0,1)),
    ${c.remoteId}       TEXT,
    ${c.localVersion}   INTEGER NOT NULL DEFAULT 1,
    ${c.lastSyncError}  TEXT
  );

  -- Không trùng tên danh mục (bỏ qua bản ghi đã xoá chờ đồng bộ)
  CREATE UNIQUE INDEX IF NOT EXISTS ${q(p('UX_DishCategory_Name'))}
    ON ${T.category} (${c.normalizedName}) WHERE ${c.isDeleted} = 0;

  CREATE TABLE IF NOT EXISTS ${T.dish} (
    ${c.id}              TEXT PRIMARY KEY NOT NULL,
    ${c.name}            TEXT NOT NULL CHECK (length(trim(${c.name})) > 0),
    ${c.normalizedName}  TEXT NOT NULL,
    ${c.description}     TEXT NOT NULL DEFAULT '',
    ${c.price}           REAL NOT NULL CHECK (${c.price} > 0),
    ${c.preparationTime} INTEGER NOT NULL CHECK (${c.preparationTime} > 0),
    ${c.isAvailable}     INTEGER NOT NULL DEFAULT 1 CHECK (${c.isAvailable} IN (0,1)),
    ${c.dishCategoryId}  TEXT NOT NULL
      REFERENCES ${T.category} (${c.id}) ON UPDATE CASCADE ON DELETE RESTRICT,
    ${c.createdAt}       INTEGER NOT NULL,
    ${c.updatedAt}       INTEGER NOT NULL,
    ${c.syncStatus}      TEXT NOT NULL DEFAULT 'pending' CHECK (${c.syncStatus} IN ('synced','pending')),
    ${c.isDeleted}       INTEGER NOT NULL DEFAULT 0 CHECK (${c.isDeleted} IN (0,1)),
    ${c.remoteId}        TEXT,
    ${c.localVersion}    INTEGER NOT NULL DEFAULT 1,
    ${c.lastSyncError}   TEXT
  );

  -- Không trùng tên món TRONG CÙNG một danh mục (so sánh trên tên đã chuẩn hoá)
  CREATE UNIQUE INDEX IF NOT EXISTS ${q(p('UX_Dish_Category_Name'))}
    ON ${T.dish} (${c.dishCategoryId}, ${c.normalizedName}) WHERE ${c.isDeleted} = 0;
  CREATE INDEX IF NOT EXISTS ${q(p('IX_Dish_Category'))} ON ${T.dish} (${c.dishCategoryId});

  CREATE TABLE IF NOT EXISTS ${T.image} (
    ${c.id}          TEXT PRIMARY KEY NOT NULL,
    ${c.dishId}      TEXT NOT NULL
      REFERENCES ${T.dish} (${c.id}) ON UPDATE CASCADE ON DELETE CASCADE,
    ${c.imageUrl}    TEXT NOT NULL CHECK (length(trim(${c.imageUrl})) > 0),
    ${c.isThumbnail} INTEGER NOT NULL DEFAULT 0 CHECK (${c.isThumbnail} IN (0,1)),
    ${c.sortOrder}   INTEGER NOT NULL DEFAULT 0
  );

  -- Mỗi món có TỐI ĐA một ảnh đại diện (partial unique index)
  CREATE UNIQUE INDEX IF NOT EXISTS ${q(p('UX_DishImage_Thumbnail'))}
    ON ${T.image} (${c.dishId}) WHERE ${c.isThumbnail} = 1;
  CREATE INDEX IF NOT EXISTS ${q(p('IX_DishImage_Dish'))} ON ${T.image} (${c.dishId});

  CREATE TABLE IF NOT EXISTS ${T.setting} (
    ${c.key}   TEXT PRIMARY KEY NOT NULL,
    ${c.value} TEXT
  );
  `,
];

export const SETTING_KEYS = {
  language: 'Language',
  seedDone: 'SeedDone',
  lastSyncAt: 'LastSyncAt',
  lastSyncBaseUrl: 'LastSyncBaseUrl',
} as const;
