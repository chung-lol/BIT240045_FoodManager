# GIẢI THÍCH TOÀN BỘ ỨNG DỤNG BIT240045_FoodManager

Tài liệu này giải thích ứng dụng từ lúc khởi động đến khi người dùng xem, thêm, sửa, xoá món ăn và khi dữ liệu được tự động đồng bộ với MockAPI. Mục tiêu là giúp người đọc hiểu **chức năng dùng để làm gì**, **luồng xử lý chạy qua đâu**, **logic nào được áp dụng** và **đoạn mã nào trực tiếp thực hiện logic đó**.

> Project: `BIT240045_FoodManager`  
> Công nghệ: React Native + Expo SDK 58 + TypeScript  
> Lưu trữ chính: SQLite trên thiết bị  
> Lưu trữ từ xa: MockAPI REST API  
> Kiến trúc: offline-first – giao diện luôn đọc/ghi SQLite trước, sau đó tự đồng bộ nền

---

## Mục lục

1. Bài toán và các chức năng
2. Công nghệ và cấu trúc thư mục
3. Kiến trúc tổng thể
4. Luồng khởi động ứng dụng
5. Cấu hình MSSV và MockAPI
6. Model và quan hệ dữ liệu
7. Schema SQLite và ràng buộc dữ liệu
8. Migration, transaction và hàng đợi ghi
9. Dữ liệu mẫu
10. Màn hình danh sách món ăn
11. Tìm kiếm, lọc và sắp xếp
12. Thêm món ăn
13. Sửa món ăn
14. Xem chi tiết món ăn
15. Xoá món ăn
16. Quản lý nhiều ảnh và ảnh đại diện
17. Phân loại Quick/Regular
18. Quản lý danh mục món ăn
19. Validation và chuẩn hoá dữ liệu
20. Đa ngôn ngữ
21. Quản lý state bằng Zustand
22. Cơ chế offline-first
23. Kết nối MockAPI
24. Thuật toán tự động đồng bộ
25. Chống trùng và chống mất dữ liệu khi sync
26. Xử lý lỗi và trạng thái đặc biệt
27. Database Inspector
28. Giao diện responsive mobile/web
29. Các luồng hoàn chỉnh từ đầu đến cuối
30. Kiểm thử và cách chạy project
31. Đối chiếu yêu cầu đề bài
32. Câu hỏi thuyết trình thường gặp

---

# 1. Bài toán và các chức năng

Ứng dụng quản lý hai đối tượng chính:

- `DishCategory`: loại món ăn, ví dụ Main Dishes, Appetizers, Drinks.
- `Dish`: món ăn, có tên, giá, thời gian chế biến, trạng thái đang bán, mô tả, loại món và danh sách ảnh.

Người dùng có thể:

- Xem danh sách và chi tiết món.
- Thêm, sửa, xoá món.
- Quản lý danh mục.
- Tìm theo tên; lọc theo loại, trạng thái và khoảng giá.
- Sắp xếp theo tên, giá hoặc thời gian chế biến.
- Thêm nhiều URL ảnh và chọn ảnh đại diện.
- Đổi giao diện English/Tiếng Việt.
- Tiếp tục thao tác khi mất mạng.
- Tự động đồng bộ SQLite với MockAPI khi có Internet trở lại.

Điểm quan trọng nhất của thiết kế là **SQLite mới là nguồn dữ liệu trực tiếp của giao diện**. MockAPI là bản dữ liệu từ xa phục vụ đồng bộ. Vì vậy mất mạng không làm nút Lưu bị vô hiệu.

---

# 2. Công nghệ và cấu trúc thư mục

Các thư viện chính trong `package.json`:

```json
{
  "expo": "~58.0.16",
  "react-native": "0.88.0",
  "expo-router": "~58.0.24",
  "expo-sqlite": "~58.0.13",
  "@react-native-community/netinfo": "12.0.1",
  "zustand": "^5.0.15"
}
```

Vai trò từng thư mục:

```text
src/app/           Các màn hình và route của Expo Router
src/components/    Component giao diện dùng lại
src/models/        Kiểu dữ liệu TypeScript
src/database/      Schema, migration, mở DB và seed
src/repositories/  Câu SQL, ánh xạ hàng DB thành model
src/services/      Validation và nghiệp vụ của ứng dụng
src/store/         State dùng chung bằng Zustand
src/api/           HTTP client và chuyển đổi dữ liệu MockAPI
src/sync/          Phát hiện mạng, lập lịch và thuật toán sync
src/i18n/          Từ điển English/Tiếng Việt
src/utils/         Hàm xử lý chuỗi, số tiền và UUID
```

Mỗi lớp có trách nhiệm riêng:

- Screen/Component: nhận thao tác và hiển thị.
- Service: thực hiện luật nghiệp vụ.
- Repository: thực hiện SQL.
- Database: quản lý kết nối/transaction.
- Sync: trao đổi với MockAPI.

---

# 3. Kiến trúc tổng thể

```text
Người dùng
   ↓
Screen / Component
   ↓ gọi hàm nghiệp vụ
Service + Validation
   ↓ đọc/ghi
Repository
   ↓ SQL
SQLite trên thiết bị
   ↓ thông báo dữ liệu đổi        ↓ hẹn đồng bộ
Zustand → UI tải lại              Sync Scheduler
                                      ↓
                                 Sync Engine
                                      ↕ REST
                                   MockAPI
```

Ví dụ khi thêm món:

```text
DishForm
  → createDish()
  → validateDishShape() + kiểm tra DB
  → insertDish() + replaceDishImages() trong transaction
  → notifyDataChanged()
  → scheduleSync('local-change')
  → POST hoặc PUT lên MockAPI khi có mạng
```

Lợi ích:

- UI không gọi SQL trực tiếp.
- Logic không phụ thuộc màn hình nên dễ kiểm thử.
- Mất mạng vẫn lưu được.
- Transaction bảo đảm món và ảnh cùng thành công hoặc cùng rollback.

---

# 4. Luồng khởi động ứng dụng

File: `src/app/_layout.tsx`.

Khi app mở, `useBootstrap()` chạy ba bước theo thứ tự:

```ts
await getDb();
await seedIfNeeded();
await useLanguageStore.getState().loadLanguage();
```

Ý nghĩa:

1. `getDb()` mở SQLite và chạy migration.
2. `seedIfNeeded()` thêm 3 loại và 5 món mẫu đúng một lần.
3. `loadLanguage()` đọc ngôn ngữ đã lưu.

Chỉ khi ba bước thành công, Router và giao diện chính mới được render. Nếu lỗi, app hiển thị lỗi và nút Retry thay vì crash.

Sau khi sẵn sàng, component `SyncRunner` gắn cơ chế theo dõi mạng:

```tsx
function SyncRunner() {
  useNetworkSync();
  return null;
}
```

Như vậy auto-sync sống ở layout gốc và hoạt động trong toàn ứng dụng, không phụ thuộc người dùng đang ở màn hình nào.

---

# 5. Cấu hình MSSV và MockAPI

File: `src/config/appConfig.ts`.

```ts
export const STUDENT_ID = 'BIT240045';

export const MOCKAPI_BASE_URL =
  'https://6ad74ddd95e98f36aef24400.mockapi.io/apt/v1';

export const MOCKAPI_RESOURCES = {
  categories: `${STUDENT_ID}_DishCategory`,
  dishes: `${STUDENT_ID}_Dish`,
} as const;
```

Kết quả:

- Resource danh mục: `BIT240045_DishCategory`.
- Resource món: `BIT240045_Dish`.
- Mọi bảng, cột và field nghiệp vụ đều sinh từ `BIT240045_`.

Tên project hiển thị được khai báo trong `app.json`:

```json
{
  "expo": {
    "name": "BIT240045_FoodManager",
    "slug": "bit240045-foodmanager"
  }
}
```

`BUSINESS_RULES` gom toàn bộ giới hạn vào một chỗ:

```ts
export const BUSINESS_RULES = {
  quickDishMaxMinutes: 15,
  nameMaxLength: 100,
  descriptionMaxLength: 500,
  maxPrice: 100_000_000,
  maxPreparationMinutes: 1_440,
  maxImagesPerDish: 10,
} as const;
```

---

# 6. Model và quan hệ dữ liệu

File: `src/models/index.ts`.

## 6.1 DishCategory

```ts
export interface DishCategory {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  syncStatus: SyncStatus;
}
```

## 6.2 DishImage

```ts
export interface DishImage {
  id: string;
  dishId: string;
  imageUrl: string;
  isThumbnail: boolean;
  sortOrder: number;
}
```

`dishId` tạo quan hệ nhiều ảnh thuộc một món. `isThumbnail` đánh dấu ảnh đại diện và `sortOrder` giữ thứ tự.

## 6.3 Dish

```ts
export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  preparationTime: number;
  isAvailable: boolean;
  dishCategoryId: string;
  images: DishImage[];
  createdAt: number;
  updatedAt: number;
  syncStatus: SyncStatus;
}
```

Quan hệ:

```text
DishCategory 1 ──── N Dish 1 ──── N DishImage
```

Mỗi món bắt buộc có đúng một `dishCategoryId`. Một món có thể không có ảnh hoặc có nhiều ảnh, nhưng tối đa một ảnh đại diện.

---

# 7. Schema SQLite và ràng buộc dữ liệu

File: `src/database/schema.ts`.

Tiền tố được sinh một lần:

```ts
export const PREFIX = `${STUDENT_ID}_`;
const p = (name: string) => `${PREFIX}${name}`;
```

Tên bảng:

```ts
export const TABLES = {
  category: p('DishCategory'),
  dish: p('Dish'),
  image: p('DishImage'),
  setting: p('AppSetting'),
} as const;
```

Tên cột cũng có tiền tố:

```ts
export const COLS = {
  id: p('Id'),
  name: p('Name'),
  price: p('Price'),
  preparationTime: p('PreparationTime'),
  dishCategoryId: p('DishCategoryId'),
  imageUrl: p('ImageUrl'),
  isThumbnail: p('IsThumbnail'),
  syncStatus: p('SyncStatus'),
  isDeleted: p('IsDeleted'),
  remoteId: p('RemoteId'),
  localVersion: p('LocalVersion'),
  // ...
} as const;
```

Do đó tên thật trong DB là `BIT240045_Dish`, `BIT240045_Name`, `BIT240045_Price`...

## 7.1 Ràng buộc giá và thời gian

```sql
BIT240045_Price REAL NOT NULL CHECK (BIT240045_Price > 0),
BIT240045_PreparationTime INTEGER NOT NULL
  CHECK (BIT240045_PreparationTime > 0)
```

Validation ở UI giúp báo lỗi dễ hiểu, còn `CHECK` trong DB là lưới an toàn cuối cùng.

## 7.2 Không trùng tên món trong cùng loại

```sql
CREATE UNIQUE INDEX BIT240045_UX_Dish_Category_Name
ON BIT240045_Dish (
  BIT240045_DishCategoryId,
  BIT240045_NormalizedName
)
WHERE BIT240045_IsDeleted = 0;
```

Hai món khác loại có thể cùng tên. Hai món cùng loại không thể trùng tên sau chuẩn hoá.

## 7.3 Khoá ngoại

```sql
BIT240045_DishCategoryId TEXT NOT NULL
REFERENCES BIT240045_DishCategory (BIT240045_Id)
ON UPDATE CASCADE ON DELETE RESTRICT
```

`ON DELETE RESTRICT` bảo vệ danh mục đang được món sử dụng.

## 7.4 Tối đa một thumbnail

```sql
CREATE UNIQUE INDEX BIT240045_UX_DishImage_Thumbnail
ON BIT240045_DishImage (BIT240045_DishId)
WHERE BIT240045_IsThumbnail = 1;
```

Đây là partial unique index: mỗi món có thể có nhiều ảnh `false`, nhưng chỉ một ảnh `true`.

## 7.5 Metadata đồng bộ

- `SyncStatus`: `pending` hoặc `synced`.
- `IsDeleted`: tombstone của bản ghi bị xoá local.
- `RemoteId`: ID kỹ thuật MockAPI tạo.
- `LocalVersion`: tăng khi local thay đổi, chống race condition.
- `LastSyncError`: lỗi đồng bộ gần nhất của bản ghi.

---

# 8. Migration, transaction và hàng đợi ghi

File: `src/database/database.ts`.

Mở DB và bật WAL + khoá ngoại:

```ts
const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
await db.execAsync(
  'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
);
```

App đọc `PRAGMA user_version`, chạy lần lượt các migration còn thiếu và tăng version. Cơ chế này cho phép nâng cấp schema mà không xoá dữ liệu cũ.

Tất cả thao tác ghi dùng `writeTransaction()`:

```ts
let writeChain: Promise<unknown> = Promise.resolve();

export function writeTransaction<T>(task: (db: Db) => Promise<T>) {
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
```

`writeChain` là mutex đơn giản: thao tác ghi từ UI và Sync Engine không chen vào nhau. Nếu một lệnh trong transaction lỗi thì toàn bộ transaction rollback.

---

# 9. Dữ liệu mẫu

File: `src/database/seed.ts`.

Project có 3 danh mục và 5 món:

- Main Dishes
- Appetizers
- Drinks
- Chicken Rice
- Beef Noodles
- Spring Rolls
- French Fries
- Lemon Tea

Seed chỉ chạy một lần:

```ts
if ((await getSetting(db, SETTING_KEYS.seedDone)) === '1') {
  return false;
}
```

Toàn bộ danh mục, món, ảnh và cờ `SeedDone` được ghi trong cùng transaction:

```ts
await writeTransaction(async (tx) => {
  for (const c of CATEGORIES) await insertCategory(tx, ...);
  for (const d of DISHES) {
    await insertDish(tx, ...);
    await replaceDishImages(tx, d.id, ...);
  }
  await setSetting(tx, SETTING_KEYS.seedDone, '1');
});
```

ID seed cố định thay vì random. Khi cài lại app, cùng một món vẫn có cùng ID nghiệp vụ, vì vậy Sync Engine không POST bản sao.

---

# 10. Màn hình danh sách món ăn

File: `src/app/index.tsx`.

Màn hình đọc song song món và danh mục từ SQLite:

```ts
const [d, c] = await Promise.all([
  getAllDishes(),
  getCategories(),
]);
setDishes(d);
setCategories(c);
```

`getAllDishes()` đi theo luồng:

```text
index.tsx
 → dishService.getAllDishes()
 → dishRepository.listDishes()
 → SELECT từ SQLite
 → DishListItem[]
```

Mỗi `DishListItem` có thêm `categoryName`, `thumbnailUrl` và `imageCount`, giúp card không phải gọi DB nhiều lần.

Màn hình theo dõi `useDataStore.version`. Sau khi UI hoặc Sync Engine thay đổi SQLite, `notifyDataChanged()` tăng version và effect tải dữ liệu mới.

```ts
const version = useDataStore((s) => s.version);

useEffect(() => {
  // tải lại món và danh mục
}, [version, setFilter]);
```

Món ngừng bán vẫn xuất hiện trong danh sách quản lý; chỉ biến mất nếu người dùng lọc “Available”.

---

# 11. Tìm kiếm, lọc và sắp xếp

File logic: `src/services/dishQuery.ts`.  
File giao diện: `src/components/DishFilters.tsx`.

## 11.1 Tìm kiếm

`searchKey()` chuyển chữ thường và bỏ dấu tiếng Việt:

```ts
const q = searchKey(f.search);
if (q && !searchKey(d.name).includes(q)) return false;
```

Vì dùng `includes`, tìm một phần tên hoạt động. Ví dụ `pho bo` có thể khớp `Phở bò`.

## 11.2 Kết hợp bộ lọc

Tất cả điều kiện dùng phép AND:

```ts
const items = all.filter((d) => {
  if (q && !searchKey(d.name).includes(q)) return false;
  if (f.categoryId && d.dishCategoryId !== f.categoryId) return false;
  if (f.status === 'available' && !d.isAvailable) return false;
  if (f.status === 'unavailable' && d.isAvailable) return false;
  if (min !== null && d.price < min) return false;
  if (max !== null && d.price > max) return false;
  return true;
});
```

Ví dụ người dùng nhập “rice”, chọn Main Dishes, Available và giá 20.000–50.000 thì món phải thoả **đồng thời** cả bốn điều kiện.

## 11.3 Khoảng giá sai

```ts
if (min !== null && max !== null && min > max) {
  priceError = { key: 'priceRangeInvalid' };
  min = null;
  max = null;
}
```

App báo lỗi và bỏ riêng điều kiện giá, thay vì trả danh sách trắng gây hiểu nhầm.

## 11.4 Sắp xếp

```ts
items.sort((a, b) => {
  switch (f.sort) {
    case 'priceAsc': return a.price - b.price || byName(a, b);
    case 'priceDesc': return b.price - a.price || byName(a, b);
    case 'timeAsc': return a.preparationTime - b.preparationTime || byName(a, b);
    default: return byName(a, b);
  }
});
```

Tên là tiêu chí phụ khi hai giá trị bằng nhau, giúp thứ tự ổn định.

## 11.5 Giữ bộ lọc khi quay lại

Bộ lọc nằm trong Zustand `filterStore`, không nằm trong local state của màn hình:

```ts
export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value })),
  reset: () => set({ filters: DEFAULT_FILTERS }),
}));
```

Khi mở chi tiết rồi quay lại, màn danh sách được mount lại nhưng store vẫn còn, nên bộ lọc được giữ.

---

# 12. Thêm món ăn

Màn hình: `src/app/dish/new.tsx`.  
Form: `src/components/DishForm.tsx`.  
Nghiệp vụ: `src/services/dishService.ts`.

Luồng:

```text
Người dùng nhập form
 → DishForm gọi onSubmit
 → createDish(input)
 → validate form
 → kiểm tra danh mục/trùng tên trong DB
 → sinh UUID
 → ghi món + ảnh trong transaction
 → UI tải lại
 → hẹn auto-sync
```

Đoạn code chính:

```ts
export async function createDish(input: DishFormInput): Promise<string> {
  const value = await validateWithDb(input);
  const id = newId();
  const now = Date.now();

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
    await dishRepo.replaceDishImages(
      db,
      id,
      buildImages(id, value.images),
    );
  });

  notifyDataChanged();
  scheduleSync('local-change');
  return id;
}
```

UUID được sinh trên thiết bị:

```ts
export function newId(): string {
  return Crypto.randomUUID();
}
```

Món vừa thêm mang `SyncStatus = pending`. UI hiển thị ngay từ SQLite; không chờ request mạng.

---

# 13. Sửa món ăn

Màn hình: `src/app/dish/edit/[id].tsx`.

Màn hình đọc món theo `id`, chuyển dữ liệu hiện tại về dạng chuỗi của form và dùng lại `DishForm`. Dùng chung form giúp validation và trải nghiệm thêm/sửa nhất quán.

Service kiểm tra ID tồn tại trước:

```ts
const existing = await dishRepo.getDishDetail(db, id);
if (!existing) throw new Error('NOT_FOUND');
```

Khi lưu:

```ts
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
  await dishRepo.replaceDishImages(
    tx,
    id,
    buildImages(id, value.images),
  );
});
```

Repository đánh dấu bản ghi `pending` và tăng `LocalVersion`. Sau đó UI tải lại và sync được hẹn giống chức năng thêm.

---

# 14. Xem chi tiết món ăn

File: `src/app/dish/[id].tsx`.

Route động `/dish/[id]` lấy ID bằng Expo Router rồi gọi `getDish(id)`. Kết quả gồm món, tên danh mục và toàn bộ ảnh.

Màn hình hiển thị:

- Tên món.
- Danh mục.
- Giá.
- Thời gian.
- Available/Unavailable.
- Quick/Regular.
- Mô tả.
- Danh sách ảnh và thumbnail.
- Trạng thái Pending/Synced.
- Nút sửa và xoá.

Nếu `getDish()` trả `null`, màn hình dùng component `NotFound` thay vì truy cập thuộc tính của `undefined` và crash.

---

# 15. Xoá món ăn

Màn chi tiết luôn hỏi xác nhận:

```ts
Alert.alert(
  t('deleteDish'),
  t('deleteDishConfirm', { name: dish.name }),
  [
    { text: t('cancel'), style: 'cancel' },
    {
      text: t('delete'),
      style: 'destructive',
      onPress: async () => {
        await deleteDish(dish.id);
        router.back();
      },
    },
  ],
);
```

Service không xoá vật lý ngay:

```ts
export async function deleteDish(id: string): Promise<void> {
  await writeTransaction(async (db) => {
    await dishRepo.tombstoneDish(db, id, Date.now());
  });
  notifyDataChanged();
  scheduleSync('local-change');
}
```

`tombstoneDish()` đặt `IsDeleted = 1`, `SyncStatus = pending`. Các truy vấn UI chỉ lấy bản ghi `IsDeleted = 0`, nên món biến mất ngay. Khi có mạng, Sync Engine DELETE bản ghi MockAPI rồi mới `purgeDish()` để xoá vật lý local.

Tombstone giải quyết trường hợp xoá khi offline: nếu xoá vật lý ngay, app sẽ không còn thông tin để biết phải xoá bản nào trên server.

---

# 16. Quản lý nhiều ảnh và ảnh đại diện

File form: `src/components/DishForm.tsx`.

## 16.1 Thêm URL ảnh

```ts
if (!isHttpUrl(url)) {
  return setUrlError({ key: 'imageUrlInvalid' });
}
if (form.images.some(
  (i) => i.imageUrl.toLowerCase() === url.toLowerCase(),
)) {
  return setUrlError({ key: 'imageUrlDuplicate' });
}
```

App chỉ nhận HTTP/HTTPS, chặn URL trùng và giới hạn 10 ảnh.

Ảnh đầu tiên tự thành thumbnail:

```ts
{
  imageUrl: url,
  isThumbnail: form.images.length === 0,
}
```

## 16.2 Chọn thumbnail

```ts
form.images.map((img, i) => ({
  ...img,
  isThumbnail: i === index,
}));
```

Đoạn này tắt tất cả thumbnail cũ và chỉ bật ảnh được chọn.

## 16.3 Xoá ảnh đại diện

Nếu xoá đúng ảnh thumbnail và vẫn còn ảnh, form tự chọn ảnh đầu tiên còn lại. Nhờ đó món có ảnh sẽ luôn có một ảnh đại diện.

## 16.4 Đổi thumbnail tại màn chi tiết

```ts
await writeTransaction(async (db) => {
  const ok = await dishRepo.setThumbnail(db, dishId, imageId);
  if (!ok) throw new Error('IMAGE_NOT_FOUND');
  await dishRepo.touchDish(db, dishId, Date.now());
});
```

Việc bỏ cờ ảnh cũ, bật ảnh mới và đánh dấu món pending nằm trong cùng transaction.

## 16.5 Ảnh trên MockAPI

SQLite dùng bảng ảnh riêng. MockAPI chỉ có hai resource nên ảnh được chuyển thành JSON trong field `BIT240045_Images`:

```ts
[REMOTE_FIELDS.images]: JSON.stringify(
  d.images.map((i) => ({
    [COLS.id]: i.id,
    [COLS.imageUrl]: i.imageUrl,
    [COLS.isThumbnail]: i.isThumbnail,
    [COLS.sortOrder]: i.sortOrder,
  })),
),
```

---

# 17. Phân loại Quick/Regular

File: `src/services/dishQuery.ts`.

```ts
export function speedLabel(preparationTime: number): SpeedLabel {
  return preparationTime <= BUSINESS_RULES.quickDishMaxMinutes
    ? 'quick'
    : 'regular';
}
```

- `PreparationTime <= 15`: Quick/Nhanh.
- `PreparationTime > 15`: Regular/Thông thường.

Đây là thuộc tính suy ra nên không cần lưu thêm cột, tránh dữ liệu mâu thuẫn, ví dụ thời gian 20 nhưng nhãn vẫn Quick.

---

# 18. Quản lý danh mục món ăn

Màn hình: `src/app/categories.tsx`.  
Service: `src/services/categoryService.ts`.

Màn hình hiển thị danh mục cùng số món. Người dùng có thể thêm, sửa và xoá danh mục.

Thêm/sửa dùng chung hàm `saveCategory()`:

```ts
const categoryId = id ?? newId();

await writeTransaction(async (tx) => {
  if (id) {
    await catRepo.updateCategoryLocal(tx, id, value, now);
  } else {
    await catRepo.insertCategory(tx, {
      id: categoryId,
      ...value,
      createdAt: now,
      updatedAt: now,
    });
  }
});
```

Không cho xoá danh mục đang được dùng:

```ts
const count = await catRepo.countActiveDishesInCategory(db, id);
if (count > 0) {
  throw new CategoryInUseError(cat.name, count);
}
await catRepo.tombstoneCategory(db, id, Date.now());
```

Có hai lớp bảo vệ:

1. Service đếm món và đưa thông báo thân thiện.
2. SQLite `ON DELETE RESTRICT` ngăn sai sót ở tầng dữ liệu.

`CategoryPicker` trong form luôn đọc danh mục từ SQLite, nên người dùng chọn giá trị hợp lệ thay vì tự nhập ID.

---

# 19. Validation và chuẩn hoá dữ liệu

File: `src/services/validationService.ts`.

Validation chia thành hai nhóm:

1. Validation thuần: không cần DB.
2. Validation nghiệp vụ: cần truy vấn DB.

## 19.1 Validation thuần

```ts
const name = cleanText(input.name);
if (!name) errors.name = { key: 'nameRequired' };

const price = parseMoney(input.price);
if (input.price.trim() === '') {
  errors.price = { key: 'priceRequired' };
} else if (Number.isNaN(price)) {
  errors.price = { key: 'priceInvalid' };
} else if (price <= 0) {
  errors.price = { key: 'pricePositive' };
}
```

Thời gian phải là số nguyên dương; mô tả, tên và ảnh có giới hạn. Hàm trả cả `errors` và `value` đã parse để service không phải parse lại.

## 19.2 Validation cần DB

```ts
const cat = await getCategory(db, value.dishCategoryId);
if (!cat) {
  dbErrors.dishCategoryId = { key: 'categoryNotFound' };
}

const dup = await dishRepo.dishNameExistsInCategory(
  db,
  value.name,
  value.dishCategoryId,
  excludeId,
);
if (dup) dbErrors.name = { key: 'duplicateDishName' };
```

Khi sửa, `excludeId` loại chính món hiện tại khỏi phép kiểm tra trùng.

## 19.3 Chuẩn hoá tên

```ts
export function normalizeName(value: string): string {
  return safeNormalize(value, 'NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

`"  Chicken   Rice "` và `"chicken rice"` được coi là cùng tên.

## 19.4 Parse số tiền

`parseMoney()` nhận `45000`, `45.000`, `45,000`, `45 000`, nhưng từ chối chữ, số âm và scientific notation như `1e3`.

## 19.5 Lỗi dạng translation key

```ts
errors.name = { key: 'nameRequired' };
```

Validation không lưu câu English cố định. UI dịch key theo ngôn ngữ hiện tại, nên đổi ngôn ngữ thì lỗi cũng đổi theo.

---

# 20. Đa ngôn ngữ

Các file:

- `src/i18n/en.ts`
- `src/i18n/vi.ts`
- `src/i18n/index.ts`
- `src/store/languageStore.ts`

Ngôn ngữ mặc định là English:

```ts
export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'en',
  // ...
}));
```

Khi đổi ngôn ngữ:

```ts
setLanguage: async (lang) => {
  set({ language: lang });
  const db = await getDb();
  await setSetting(db, SETTING_KEYS.language, lang);
},
```

State làm UI đổi ngay, còn SQLite giữ lựa chọn sau khi đóng/mở app.

Hook dịch:

```ts
export function useT() {
  const lang = useLanguageStore((s) => s.language);
  return (key, params) => translate(lang, key, params);
}
```

Từ điển Việt được ép kiểu theo key của từ điển Anh. Nếu thêm nhãn mới ở English nhưng quên Vietnamese, TypeScript báo lỗi.

---

# 21. Quản lý state bằng Zustand

Project không đưa dữ liệu món vào global store; SQLite là nguồn dữ liệu chính. Zustand chỉ giữ state UI và trạng thái ứng dụng.

## 21.1 `dataStore`

Giữ số `version`. Mỗi lần DB thay đổi, tăng version để màn hình reload.

## 21.2 `filterStore`

Giữ tìm kiếm, danh mục, trạng thái, giá, sort và trạng thái mở panel.

## 21.3 `languageStore`

Giữ `en/vi` và lưu lựa chọn vào SQLite.

## 21.4 `syncStore`

Giữ:

- Có mạng hay không.
- Có đang sync hay không.
- Số bản ghi pending.
- Lần sync gần nhất.
- Lỗi gần nhất.

## 21.5 `toastStore`

Giữ một thông báo thành công/lỗi và tự ẩn sau 2,6 giây.

---

# 22. Cơ chế offline-first

Quy tắc chung của mọi thao tác ghi:

```text
Validate
 → transaction SQLite
 → notifyDataChanged
 → scheduleSync
```

Không có bước nào bắt buộc phải gọi MockAPI trước khi báo lưu thành công.

Ví dụ khi offline:

1. Người dùng thêm món.
2. Món được lưu SQLite với `pending`.
3. Món xuất hiện ngay trên UI.
4. `requestSync()` thấy offline nên không gọi API.
5. Khi mạng trở lại, NetInfo kích hoạt sync.

Đây là khác biệt giữa offline-first và mô hình gọi API trực tiếp: trong mô hình trực tiếp, request lỗi thì người dùng mất thao tác; ở đây thay đổi đã an toàn trong local DB.

---

# 23. Kết nối MockAPI

HTTP client: `src/api/mockApiClient.ts`.

Request có timeout bằng `AbortController`:

```ts
const controller = new AbortController();
const timer = setTimeout(
  () => controller.abort(),
  SYNC_CONFIG.requestTimeoutMs,
);

const res = await fetch(url, {
  method,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: body === undefined ? undefined : JSON.stringify(body),
  signal: controller.signal,
});
```

Các hàm REST:

- `listRecords()`: GET danh sách.
- `createRecord()`: POST.
- `updateRecord()`: PUT theo remote ID.
- `deleteRecord()`: DELETE; 404 được coi như đã xoá để idempotent.

`remoteMappers.ts` chuyển model local sang field có tiền tố và ngược lại. Dữ liệu server bị sửa tay sai sẽ bị kiểm tra; record thiếu ID/tên/category hoặc có giá/thời gian sai sẽ bị bỏ qua thay vì làm hỏng DB local.

---

# 24. Thuật toán tự động đồng bộ

Ba file chính:

- `useNetworkSync.ts`: quyết định **khi nào** cần sync.
- `syncScheduler.ts`: bảo đảm **cách chạy** sync an toàn.
- `syncEngine.ts`: quyết định **dữ liệu nào push/pull/delete**.

## 24.1 Các thời điểm tự kích hoạt

```ts
const unsubscribeNet = NetInfo.addEventListener((state) => {
  const online = isOnline(state);
  useSyncStore.getState().set({ isOnline: online });
  if (online && wasOnline !== true) {
    void requestSync(
      wasOnline === null ? 'startup' : 'reconnect',
    );
  }
});
```

Sync được kích hoạt khi:

- Mở app và có mạng.
- Offline chuyển thành online.
- App trở lại foreground.
- Có thay đổi local.
- Timer 15 giây thấy còn pending.
- Người dùng chọn Sync now.

Nút Sync now chỉ là tiện ích, không phải điều kiện bắt buộc.

## 24.2 Debounce

```ts
export function scheduleSync(reason, delayMs = SYNC_CONFIG.debounceMs) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void requestSync(reason);
  }, delayMs);
}
```

Nếu người dùng sửa liên tục, app gom thay đổi trong 800 ms rồi sync một lượt.

## 24.3 Single-flight

```ts
if (running) {
  rerunRequested = true;
  return running;
}
```

Chỉ một lượt sync chạy tại một thời điểm. Yêu cầu đến trong lúc đang chạy chỉ đặt cờ chạy thêm một lượt sau đó. Điều này tránh hai request POST song song tạo trùng.

## 24.4 Backoff

```ts
const delay = Math.min(
  SYNC_CONFIG.backoffBaseMs * 2 ** (failureCount - 1),
  SYNC_CONFIG.backoffMaxMs,
);
```

Khi lỗi liên tiếp, thời gian thử lại là 5s, 10s, 20s... tối đa 2 phút, tránh spam server.

## 24.5 Thứ tự một lượt sync

`runSyncOnce()` thực hiện:

1. GET toàn bộ danh mục và món từ MockAPI.
2. Lập index theo `BIT240045_Id`.
3. Dọn duplicate remote có cùng ID nghiệp vụ.
4. Push danh mục pending trước.
5. Push món pending sau, vì món cần category tồn tại.
6. Xử lý tombstone món trước, category sau.
7. Pull/merge bản ghi remote về local.
8. Xử lý record synced đã bị xoá từ nơi khác.
9. Lưu thời gian sync gần nhất.

Thứ tự category trước dish và xoá dish trước category tôn trọng khoá ngoại.

---

# 25. Chống trùng và chống mất dữ liệu khi sync

## 25.1 Hai loại ID

- `BIT240045_Id`: ID nghiệp vụ do app sinh, không đổi.
- `id`: ID kỹ thuật do MockAPI sinh, dùng trong URL PUT/DELETE.

Sync tìm theo ID nghiệp vụ:

```ts
const remote = dishIndex.get(local.id)?.[0];
const body = toRemoteDish(local);

const saved = remote
  ? await updateRecord(R.dishes, remote.id, body)
  : await createRecord(R.dishes, body);
```

Nếu POST thành công trên server nhưng response bị timeout, lần sync sau GET sẽ tìm thấy cùng `BIT240045_Id` và dùng PUT, không POST bản thứ hai.

## 25.2 Dọn duplicate remote

Nếu vì lý do ngoài app đã có nhiều remote record cùng ID nghiệp vụ, Sync Engine giữ một bản và xoá các bản dư.

## 25.3 LocalVersion chống race condition

Giả sử sync đang gửi version 2, người dùng sửa món thành version 3 trước khi response về. App chỉ đánh dấu synced nếu version vẫn bằng version đã gửi:

```sql
UPDATE BIT240045_Dish
SET BIT240045_SyncStatus = 'synced'
WHERE BIT240045_Id = ?
  AND BIT240045_LocalVersion = ?;
```

Version 3 không bị đánh dấu nhầm là synced và sẽ được gửi ở lượt sau.

## 25.4 Không ghi đè local pending

Khi pull, nếu local đang `pending` hoặc `IsDeleted = 1`, server không được ghi đè. Thay đổi chưa đồng bộ của người dùng luôn được bảo vệ.

---

# 26. Xử lý lỗi và trạng thái đặc biệt

| Trường hợp | Cách xử lý |
|---|---|
| ID món không tồn tại | Hiển thị `NotFound`, không crash |
| Danh sách trống | `EmptyState` với hướng dẫn phù hợp |
| Không có kết quả lọc | Thông báo và nút reset filter |
| Ảnh rỗng/lỗi tải | `SmartImage` hiển thị placeholder |
| Giá/thời gian sai | Lỗi cạnh đúng field |
| Khoảng min > max | Báo lỗi, bỏ riêng điều kiện giá |
| Danh mục không tồn tại | `categoryNotFound` |
| Trùng tên món cùng loại | Service báo lỗi + unique index chặn |
| Xoá category đang dùng | `CategoryInUseError` + FK RESTRICT |
| Mất mạng | Giữ pending, thử lại khi online |
| HTTP lỗi | Lưu lỗi sync và không xoá thay đổi local |
| Timeout | `ApiError` status 0, scheduler backoff |
| Dữ liệu remote sai | Mapper bỏ qua record không hợp lệ |

`SmartImage` còn dùng cache đĩa của `expo-image`. Sau sync, app prefetch URL ảnh để tăng khả năng xem lại khi offline.

---

# 27. Database Inspector

Màn hình: `src/app/database.tsx`.  
Logic: `src/repositories/schemaInspector.ts`.

Màn hình đọc schema thật bằng:

- `sqlite_master`
- `PRAGMA table_info`
- `PRAGMA index_list`
- `PRAGMA foreign_key_list`

Inspector hiển thị bảng, cột, index, khoá ngoại và cảnh báo nếu tên nào thiếu tiền tố `BIT240045_`. Đây là bằng chứng trực tiếp cho phần yêu cầu MSSV trong video thuyết minh.

---

# 28. Giao diện responsive mobile/web

Màn danh sách dùng kích thước cửa sổ:

```ts
const { width } = useWindowDimensions();
const isDesktop = width >= 900;
const columns = isDesktop ? 2 : 1;
```

- Mobile: một cột, nút Add dish nổi ở góc dưới.
- Desktop/web: hai cột, nội dung giới hạn 1280 px, Add dish nằm trong header.
- Các form/detail/settings/categories/database được giới hạn chiều rộng và căn giữa.

Phần nghiệp vụ không phụ thuộc giao diện nên chạy giống nhau trên Android, iOS và web.

---

# 29. Các luồng hoàn chỉnh từ đầu đến cuối

## 29.1 Luồng thêm món khi online

```text
Nhấn Add dish
 → chọn category từ SQLite
 → nhập form và URL ảnh
 → submit
 → validateDishShape
 → kiểm tra category + duplicate trong SQLite
 → sinh UUID
 → transaction INSERT dish + images
 → status pending
 → UI reload và thấy món ngay
 → scheduleSync
 → GET snapshot MockAPI
 → không thấy business ID
 → POST
 → lưu remoteId, status synced
```

## 29.2 Luồng sửa món khi offline

```text
Mất mạng
 → mở detail → Edit
 → sửa giá/thời gian
 → UPDATE SQLite
 → LocalVersion + 1, status pending
 → UI cập nhật ngay
 → requestSync bỏ qua vì offline
 → mạng trở lại
 → NetInfo gọi requestSync('reconnect')
 → GET remote snapshot
 → PUT record tương ứng
 → đánh dấu synced nếu LocalVersion chưa đổi
```

## 29.3 Luồng xoá món khi offline

```text
Xác nhận Delete
 → IsDeleted = 1, pending
 → món biến mất khỏi UI
 → mạng trở lại
 → DELETE MockAPI bằng remoteId
 → purge vật lý khỏi SQLite
```

## 29.4 Luồng dữ liệu được sửa trên server

```text
App sync
 → GET MockAPI
 → mapper kiểm tra dữ liệu
 → nếu local không pending và remote mới/khác
 → upsert vào SQLite
 → notifyDataChanged
 → màn hình tự tải lại
```

---

# 30. Kiểm thử và cách chạy project

## 30.1 Cài dependency

```bash
npm install
```

## 30.2 Chạy web

```bash
npm run web
```

## 30.3 Chạy Android

```bash
npm run android
```

## 30.4 Kiểm tra chất lượng

```bash
npm run typecheck
npm run lint
npm run test:logic
```

Logic test hiện bao phủ schema, seed, validation, CRUD, FK, thumbnail, Quick/Regular, filter/sort, offline, timeout sau POST, lỗi HTTP, LocalVersion, pull từ server và dọn duplicate.

---

# 31. Đối chiếu yêu cầu đề bài

| Yêu cầu | Phần thực hiện |
|---|---|
| React Native | Expo + React Native trong `package.json` |
| Tên project có MSSV | `app.json` |
| 2 model chính | `src/models/index.ts` |
| 3 loại, 5 món | `src/database/seed.ts` |
| Table/field có tiền tố | `src/database/schema.ts` |
| Danh sách/chi tiết/thêm/sửa/xoá | `src/app` + `dishService.ts` |
| Chọn loại từ dữ liệu lưu | `CategoryPicker.tsx` |
| Tìm kiếm/lọc/sort kết hợp | `dishQuery.ts`, `DishFilters.tsx` |
| Giữ bộ lọc | `filterStore.ts` |
| Nhiều ảnh và thumbnail | `DishForm.tsx`, `dishRepository.ts` |
| Quick/Regular | `speedLabel()` |
| Không xoá loại đang dùng | `categoryService.ts` + FK |
| Xử lý lỗi | validation, NotFound, EmptyState, SmartImage |
| English ↔ Vietnamese | `src/i18n`, `languageStore.ts` |
| Lưu offline | SQLite-first trong service |
| Auto sync | `useNetworkSync`, scheduler, engine |
| Không tạo trùng | business ID + single-flight + dedupe |

---

# 32. Câu hỏi thuyết trình thường gặp

## Tại sao không gọi MockAPI trực tiếp từ màn hình?

Vì yêu cầu offline. Màn hình gọi service; service ghi SQLite trước. MockAPI lỗi không làm mất thao tác người dùng.

## Tại sao cần Repository?

Repository cô lập SQL và ánh xạ tên cột có tiền tố. Service chỉ tập trung nghiệp vụ, screen chỉ tập trung UI.

## Tại sao vừa validation ở JS vừa có constraint SQLite?

JS cho thông báo thân thiện; constraint DB là lớp bảo vệ cuối nếu có race condition hoặc code khác ghi sai.

## Tại sao xoá mềm bằng tombstone?

Khi offline, app phải nhớ bản ghi nào cần DELETE trên server. Xoá vật lý ngay sẽ mất thông tin đó.

## Tại sao cần ID local và ID MockAPI?

ID local là khoá nghiệp vụ ổn định để chống trùng. ID MockAPI chỉ dùng làm địa chỉ PUT/DELETE của resource.

## Tại sao cần LocalVersion?

Để response của request cũ không đánh dấu nhầm bản sửa mới là đã synced.

## Tại sao chỉ cho một lượt sync chạy?

Hai lượt song song có thể cùng không thấy record remote rồi cùng POST, sinh duplicate. Single-flight loại bỏ tình huống đó.

## Tại sao ảnh là bảng riêng ở SQLite nhưng JSON trên MockAPI?

SQLite cần quan hệ, cascade và unique thumbnail. Đề chỉ yêu cầu hai resource chính trên MockAPI nên ảnh được nhúng vào Dish để đơn giản server.

## Tại sao Quick không lưu vào DB?

Quick được suy ra hoàn toàn từ `PreparationTime <= 15`. Không lưu giúp tránh hai giá trị mâu thuẫn.

## Tóm tắt một câu về kiến trúc

**Ứng dụng dùng React Native/Expo, ghi và đọc SQLite theo kiến trúc offline-first, tách Screen–Service–Repository, rồi dùng NetInfo + Sync Scheduler + Sync Engine để tự động đồng bộ nhất quán với MockAPI mà không tạo bản ghi trùng.**

