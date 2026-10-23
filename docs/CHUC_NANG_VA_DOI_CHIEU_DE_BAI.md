# Đối chiếu đề bài và giải thích chức năng BIT240045 FoodManager

Tài liệu này dùng để kiểm tra mức độ đáp ứng đề giữa kỳ và làm dàn ý thuyết minh mã nguồn cho Video 2. Kết luận: phần mã nguồn đã đáp ứng toàn bộ nhóm chức năng cơ bản và đã triển khai đầy đủ logic nâng cao offline-first; 45/45 bài kiểm thử logic đang đạt. MockAPI thật và hai resource đã được cấu hình; các việc còn lại trước khi nộp là đẩy mã nguồn lên Git và quay hai video theo yêu cầu.

# 1. Kết luận đối chiếu nhanh

| Yêu cầu | Trạng thái | Bằng chứng chính |
|---|---|---|
| React Native hoặc công nghệ mobile hợp lệ | Đạt | React Native, Expo SDK 58 và TypeScript trong `package.json` |
| Tên project theo `{MSSV}_FoodManager` | Đạt trong cấu hình app | `app.json` dùng `BIT240045_FoodManager`; tên package npm viết thường theo quy ước npm |
| Hai model `DishCategory`, `Dish` và danh sách ảnh | Đạt | `src/models/index.ts` |
| Tối thiểu 3 loại và 5 món | Đạt | `src/database/seed.ts`; test DB03 |
| Bảng và trường có tiền tố `BIT240045_` | Đạt | `src/database/schema.ts`; test DB01; màn Database Inspector |
| Danh sách, chi tiết, thêm, sửa, xoá có xác nhận | Đạt | `src/app/index.tsx`, `src/app/dish/*` |
| Chọn loại món từ dữ liệu lưu trữ | Đạt | `src/components/CategoryPicker.tsx` |
| Tìm kiếm, lọc kết hợp và sắp xếp | Đạt | `src/services/dishQuery.ts`; test TC13, TC14, TC14b, TC16 |
| Giữ bộ lọc khi chuyển màn hình | Đạt | Zustand store trong `src/store/filterStore.ts` |
| Nhiều ảnh và tối đa một thumbnail | Đạt | `DishForm`, `dishService`, unique index trong schema; test DB06, TC10 |
| Quick khi thời gian ≤ 15 phút | Đạt | `speedLabel`; test TC11/12 |
| Không xoá loại đang được sử dụng | Đạt | `categoryService`; khoá ngoại `ON DELETE RESTRICT`; test TC09 |
| Xử lý ID không tồn tại, ảnh rỗng, giá sai và lỗi API | Đạt | `NotFound`, `SmartImage`, validation service, sync error handling |
| English mặc định và chuyển English ↔ Tiếng Việt | Đạt | `src/i18n/*`, `languageStore`; lựa chọn được lưu SQLite |
| Lưu khi offline | Đạt về implementation và test | UI luôn ghi SQLite trước; test TC19/20 và SYNC03–05 |
| Tự đồng bộ khi có mạng, không tạo bản ghi trùng | Đạt về implementation và test | `useNetworkSync`, `syncScheduler`, `syncEngine`; test SYNC01–11 |
| MockAPI thật để demo nâng cao | Đạt | Endpoint `/apt/v1`; hai resource `BIT240045_DishCategory` và `BIT240045_Dish` |
| Link Git để nộp | Chưa sẵn sàng | Repository hiện chưa cấu hình Git remote |
| Video 1 và Video 2 | Chưa thể xác minh trong mã nguồn | Cần quay và nộp bên ngoài project |

Điểm mã nguồn dự kiến theo barem là 6/6 điểm cho phần chức năng cơ bản và nâng cao, với điều kiện phần MockAPI thật được cấu hình và demo thành công trên thiết bị. Bốn điểm video chỉ được tính khi quay và nộp đúng yêu cầu.

# 2. Công nghệ, kiến trúc và luồng dữ liệu

Ứng dụng sử dụng React Native với Expo Router. SQLite là nguồn dữ liệu chính cho mọi màn hình. MockAPI chỉ là nơi đồng bộ từ xa, vì vậy thao tác thêm, sửa và xoá không phụ thuộc trạng thái Internet.

```text
Màn hình React Native
        ↓ gọi
Service: validation và nghiệp vụ
        ↓ gọi
Repository: câu lệnh SQL và ánh xạ model
        ↓
SQLite trên thiết bị
        ↕ tự động đồng bộ
Sync Engine ↔ MockAPI REST
```

Luồng khởi động nằm trong `src/app/_layout.tsx`:

```ts
await getDb();
await seedIfNeeded();
await useLanguageStore.getState().loadLanguage();
```

Sau khi SQLite được mở, migration được chạy, dữ liệu mẫu được seed đúng một lần, ngôn ngữ đã chọn được nạp lại và `useNetworkSync()` bắt đầu theo dõi kết nối mạng.

# 3. Model và quan hệ dữ liệu

## 3.1 DishCategory

Model tại `src/models/index.ts` lưu ID, tên, mô tả, thời gian tạo/cập nhật và trạng thái đồng bộ:

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

## 3.2 Dish và DishImage

Mỗi món bắt buộc thuộc một danh mục qua `dishCategoryId`. Danh sách `images` cho phép một món có nhiều ảnh.

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

Trong SQLite, ảnh được tách thành bảng riêng để tạo khoá ngoại và ràng buộc thumbnail. Khi gửi MockAPI, ảnh được nhúng thành mảng JSON trong field `BIT240045_Images`.

# 4. Tiền tố MSSV trong bảng và trường dữ liệu

`src/config/appConfig.ts` là nguồn cấu hình MSSV duy nhất:

```ts
export const STUDENT_ID = 'BIT240045';
```

`src/database/schema.ts` sinh mọi tên bảng, cột và index từ tiền tố:

```ts
export const PREFIX = `${STUDENT_ID}_`;
const p = (name: string) => `${PREFIX}${name}`;

export const TABLES = {
  category: p('DishCategory'),
  dish: p('Dish'),
  image: p('DishImage'),
  setting: p('AppSetting'),
};

export const COLS = {
  id: p('Id'),
  name: p('Name'),
  price: p('Price'),
  preparationTime: p('PreparationTime'),
  dishCategoryId: p('DishCategoryId'),
  // ...
};
```

Kết quả thực tế là các tên như `BIT240045_Dish`, `BIT240045_Name` và `BIT240045_Price`. Màn `src/app/database.tsx` đọc schema thật qua các lệnh `PRAGMA`, hiển thị bảng/cột/index và tự báo tên nào thiếu tiền tố. Đây là màn nên mở khi thuyết minh Video 2.

# 5. Dữ liệu mẫu

`src/database/seed.ts` khai báo đúng 3 danh mục và 5 món. Dữ liệu có cả món đang bán, ngừng bán, Quick, Regular, nhiều ảnh và không có ảnh để phục vụ demo đầy đủ.

```ts
const CATEGORIES = [
  { id: 'seed-cat-main', name: 'Main Dishes', ... },
  { id: 'seed-cat-appetizer', name: 'Appetizers', ... },
  { id: 'seed-cat-drink', name: 'Drinks', ... },
];

const DISHES = [
  // Chicken Rice, Beef Noodles, Spring Rolls,
  // French Fries và Lemon Tea
];
```

Hàm `seedIfNeeded()` dùng cờ `BIT240045_AppSetting.SeedDone` để không seed lại sau mỗi lần mở app. ID mẫu cố định giúp cài lại app vẫn không tạo bản ghi trùng trên MockAPI.

# 6. Danh sách và đọc dữ liệu món ăn

Màn danh sách là `src/app/index.tsx`. Màn hình gọi đồng thời service đọc món và danh mục:

```ts
const [d, c] = await Promise.all([getAllDishes(), getCategories()]);
setDishes(d);
setCategories(c);
```

`getAllDishes()` gọi `dishRepository.listDishes()`. Câu SQL lấy món, tên danh mục, thumbnail và số lượng ảnh trong một lần đọc. Món ngừng bán vẫn được lấy vì điều kiện chỉ loại các bản ghi đã xoá mềm.

Mỗi thẻ món hiển thị tên, danh mục, giá, thời gian, trạng thái bán và nhãn Quick/Regular qua `src/components/DishCard.tsx`.

# 7. Thêm món

Màn thêm là `src/app/dish/new.tsx`, dùng form chung `src/components/DishForm.tsx`. Danh mục trong picker được đọc từ SQLite, không cho nhập ID danh mục tự do.

Luồng lưu trong `src/services/dishService.ts`:

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
    await dishRepo.replaceDishImages(db, id, buildImages(id, value.images));
  });

  notifyDataChanged();
  scheduleSync('local-change');
  return id;
}
```

Các bước logic:

1. Làm sạch và kiểm tra dữ liệu form.
2. Kiểm tra danh mục có thật và tên món không trùng trong cùng danh mục.
3. Sinh UUID trên thiết bị.
4. Ghi món và toàn bộ ảnh trong cùng một transaction SQLite.
5. Cập nhật giao diện ngay.
6. Hẹn đồng bộ; không chờ MockAPI nên vẫn lưu được khi offline.

# 8. Sửa món

Màn `src/app/dish/edit/[id].tsx` đọc món hiện có và đưa dữ liệu vào cùng `DishForm`. Khi lưu, `updateDish()` kiểm tra ID tồn tại, validate lại và cập nhật món cùng ảnh trong một transaction.

```ts
const existing = await dishRepo.getDishDetail(db, id);
if (!existing) throw new Error('NOT_FOUND');

const value = await validateWithDb(input, id);
await writeTransaction(async (tx) => {
  await dishRepo.updateDishLocal(tx, {
    id,
    name: value.name,
    description: value.description,
    price: value.price,
    preparationTime: value.preparationTime,
    isAvailable: value.isAvailable,
    dishCategoryId: value.dishCategoryId,
    updatedAt: Date.now(),
  });
  await dishRepo.replaceDishImages(tx, id, buildImages(id, value.images));
});
```

Repository đặt `BIT240045_SyncStatus = 'pending'` và tăng `BIT240045_LocalVersion`, nhờ đó Sync Engine biết bản ghi phải được đẩy lại và không đánh dấu nhầm bản sửa cũ là đã đồng bộ.

# 9. Chi tiết và xoá món

Màn chi tiết `src/app/dish/[id].tsx` hiển thị toàn bộ thông tin và danh sách ảnh. Nếu ID không có trong SQLite, `getDish()` trả `null` và màn `NotFound` được hiển thị.

Xoá luôn có hộp thoại xác nhận:

```ts
Alert.alert(t('deleteDish'), t('deleteDishConfirm', { name: dish.name }), [
  { text: t('cancel'), style: 'cancel' },
  {
    text: t('delete'),
    style: 'destructive',
    onPress: async () => {
      await deleteDish(dish.id);
      router.back();
    },
  },
]);
```

`deleteDish()` không xoá vật lý ngay mà tạo tombstone:

```ts
await dishRepo.tombstoneDish(db, id, Date.now());
scheduleSync('local-change');
```

Món biến mất khỏi UI ngay. Khi có mạng, Sync Engine xoá bản tương ứng trên MockAPI rồi mới purge bản local.

# 10. Tìm kiếm, lọc và sắp xếp

Hàm thuần `applyDishFilters()` trong `src/services/dishQuery.ts` áp dụng đồng thời tất cả điều kiện theo phép AND:

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

Sau lọc, danh sách được sắp theo giá tăng, giá giảm hoặc thời gian tăng. Nếu giá tối thiểu lớn hơn giá tối đa, app báo lỗi và bỏ qua riêng điều kiện giá để không tạo một danh sách trống gây hiểu nhầm.

Tìm kiếm dùng `searchKey()` để chuẩn hoá chữ thường, khoảng trắng và dấu tiếng Việt. Ví dụ tìm `pho bo` vẫn khớp `Phở bò`.

Bộ lọc nằm trong `src/store/filterStore.ts`, không nằm trong state cục bộ của màn hình:

```ts
export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value })),
  reset: () => set({ filters: DEFAULT_FILTERS }),
}));
```

Vì store tồn tại ngoài vòng đời màn hình, mở chi tiết hoặc sửa rồi quay lại vẫn giữ tìm kiếm, danh mục, trạng thái, khoảng giá và kiểu sắp xếp.

# 11. Quản lý nhiều ảnh và thumbnail

Trong `DishForm`, ảnh được thêm bằng URL HTTP/HTTPS. App chặn URL sai, URL trùng và vượt quá 10 ảnh. Ảnh đầu tiên tự động là thumbnail.

```ts
const addImage = () => {
  const url = newUrl.trim();
  if (!isHttpUrl(url)) return setUrlError({ key: 'imageUrlInvalid' });
  if (form.images.some((i) => i.imageUrl.toLowerCase() === url.toLowerCase()))
    return setUrlError({ key: 'imageUrlDuplicate' });

  update('images', [
    ...form.images,
    { imageUrl: url, isThumbnail: form.images.length === 0 },
  ]);
};
```

Đổi thumbnail trên form bỏ cờ tất cả ảnh cũ rồi chỉ bật ảnh được chọn:

```ts
form.images.map((img, i) => ({
  ...img,
  isThumbnail: i === selectedIndex,
}));
```

Ở màn chi tiết, `changeThumbnail()` chạy trong transaction. Repository tắt thumbnail cũ trước rồi bật ảnh mới. SQLite còn có partial unique index để chặn tuyệt đối hai thumbnail cho cùng món:

```sql
CREATE UNIQUE INDEX BIT240045_UX_DishImage_Thumbnail
ON BIT240045_DishImage (BIT240045_DishId)
WHERE BIT240045_IsThumbnail = 1;
```

# 12. Phân loại Quick và Regular

Không lưu thêm cột phân loại; nhãn được tính từ thời gian chế biến tại lúc hiển thị:

```ts
export function speedLabel(preparationTime: number): SpeedLabel {
  return preparationTime <= 15 ? 'quick' : 'regular';
}
```

Kết quả đúng yêu cầu: 15 phút là Quick/Nhanh; 16 phút là Regular/Thường.

# 13. Validation và ràng buộc nghiệp vụ

App kiểm tra ở hai lớp.

## 13.1 Lớp service

`src/services/validationService.ts` kiểm tra:

- Tên không rỗng và không quá 100 ký tự.
- Giá là số hợp lệ và lớn hơn 0.
- Thời gian là số nguyên dương.
- Danh mục đã được chọn.
- URL ảnh hợp lệ, không trùng và không vượt giới hạn.
- Không có hơn một thumbnail.

`dishService.validateWithDb()` kiểm tra thêm dữ liệu cần truy vấn database:

```ts
const cat = await getCategory(db, value.dishCategoryId);
if (!cat) dbErrors.dishCategoryId = { key: 'categoryNotFound' };

const dup = await dishRepo.dishNameExistsInCategory(
  db,
  value.name,
  value.dishCategoryId,
  excludeId,
);
if (dup) dbErrors.name = { key: 'duplicateDishName' };
```

## 13.2 Lớp SQLite

Schema vẫn có `CHECK`, `FOREIGN KEY` và `UNIQUE INDEX`, nên dữ liệu sai bị chặn kể cả khi một lỗi lập trình vô tình bỏ qua service:

- `CHECK (BIT240045_Price > 0)`.
- `CHECK (BIT240045_PreparationTime > 0)`.
- Foreign key từ món đến danh mục.
- Unique theo cặp danh mục và tên đã chuẩn hoá.
- Unique thumbnail theo món.

# 14. Không xoá loại món đang được sử dụng

`src/services/categoryService.ts` kiểm tra số món trong transaction:

```ts
const count = await catRepo.countActiveDishesInCategory(db, id);
if (count > 0) {
  throw new CategoryInUseError(cat.name, count);
}
await catRepo.tombstoneCategory(db, id, Date.now());
```

Màn `src/app/categories.tsx` bắt `CategoryInUseError` và hiển thị thông báo thân thiện. SQLite tiếp tục bảo vệ bằng `ON DELETE RESTRICT` nếu còn bản ghi tham chiếu.

# 15. Đa ngôn ngữ

Ngôn ngữ mặc định là English trong `src/store/languageStore.ts`:

```ts
language: 'en'
```

Hai bộ từ điển nằm tại `src/i18n/en.ts` và `src/i18n/vi.ts`. `vi` có kiểu `Record<TranslationKey, string>`, nên TypeScript báo lỗi nếu thiếu bất kỳ khoá nào của English.

Màn Settings gọi `setLanguage('en')` hoặc `setLanguage('vi')`. Lựa chọn được lưu vào bảng `BIT240045_AppSetting`, sau đó được nạp lại khi mở app:

```ts
setLanguage: async (lang) => {
  set({ language: lang });
  await setSetting(await getDb(), SETTING_KEYS.language, lang);
};
```

Validation lưu key thay vì chuỗi đã dịch. Vì vậy khi đổi ngôn ngữ, cả nhãn, nút, trạng thái và lỗi đang hiển thị đều đổi theo.

# 16. Offline first

Mọi thao tác ghi đi theo nguyên tắc:

```text
Validate → transaction SQLite → cập nhật UI → scheduleSync
```

Không có thao tác CRUD nào chờ `fetch()` tới MockAPI. Bản ghi mới hoặc vừa sửa mang trạng thái `pending`; xoá được giữ bằng cờ `IsDeleted`. Vì thế mất mạng không làm nút Lưu thất bại.

`writeTransaction()` trong `src/database/database.ts` xếp hàng mọi thao tác ghi để thao tác người dùng và Sync Engine không chen vào cùng một transaction.

# 17. Phát hiện mạng và tự động đồng bộ

`src/sync/useNetworkSync.ts` theo dõi mạng bằng NetInfo và trạng thái app bằng AppState:

```ts
const unsubscribeNet = NetInfo.addEventListener((state) => {
  const online = isOnline(state);
  useSyncStore.getState().set({ isOnline: online });
  if (online && wasOnline !== true) {
    void requestSync(wasOnline === null ? 'startup' : 'reconnect');
  }
});

const appStateSub = AppState.addEventListener('change', (state) => {
  if (state === 'active') void requestSync('foreground');
});
```

Đồng bộ được kích hoạt khi:

- App khởi động và có mạng.
- Mạng chuyển từ offline sang online.
- App quay lại foreground.
- Người dùng vừa thay đổi dữ liệu local.
- Timer phát hiện vẫn còn bản ghi pending.

Không cần người dùng bấm nút. Nút “Sync now” chỉ là tiện ích kiểm tra thủ công, không phải điều kiện để đồng bộ.

# 18. Thuật toán đồng bộ và chống trùng

`src/sync/syncEngine.ts` thực hiện một lượt đồng bộ theo thứ tự:

1. GET snapshot danh mục và món từ MockAPI.
2. Lập chỉ mục theo field nghiệp vụ `BIT240045_Id`.
3. Dọn các bản ghi server bị trùng ID nghiệp vụ.
4. Đẩy danh mục trước, sau đó đẩy món.
5. Đẩy các tombstone xoá món trước, xoá danh mục sau.
6. Kéo dữ liệu server về nhưng không ghi đè bản local đang pending.
7. Xử lý bản ghi đã bị xoá từ nơi khác.

Điểm quan trọng chống trùng là luôn kiểm tra snapshot trước khi POST:

```ts
const remote = dishIndex.get(local.id)?.[0];
const body = toRemoteDish(local);
const saved = remote
  ? await updateRecord(R.dishes, remote.id, body)
  : await createRecord(R.dishes, body);
```

Nếu server đã tạo bản ghi nhưng response bị timeout, lượt sau sẽ tìm thấy cùng `BIT240045_Id` và dùng PUT thay vì POST. Test TC21 xác minh trường hợp này không sinh bản ghi thứ hai.

`LocalVersion` chống mất thay đổi khi người dùng sửa đúng lúc request đang chạy. Repository chỉ đánh dấu synced nếu version vẫn bằng version đã gửi:

```sql
UPDATE BIT240045_Dish
SET BIT240045_SyncStatus = 'synced'
WHERE BIT240045_Id = ? AND BIT240045_LocalVersion = ?;
```

# 19. Xử lý lỗi và trạng thái rỗng

- ID không tồn tại: màn `NotFound` thay vì crash.
- Danh sách rỗng hoặc không có kết quả lọc: `EmptyState` với thông báo phù hợp.
- Không có ảnh hoặc ảnh tải lỗi: `SmartImage` hiển thị placeholder.
- Khoảng giá sai: hiển thị lỗi và bỏ qua riêng điều kiện giá.
- Dữ liệu form sai: lỗi hiển thị cạnh đúng trường và dịch theo ngôn ngữ hiện tại.
- Lỗi mạng: giữ bản ghi pending và thử lại sau.
- HTTP lỗi: lưu `LastSyncError`, tiếp tục xử lý bản ghi khác nếu có thể.
- Retry sync dùng backoff từ 5 giây đến tối đa 2 phút.

# 20. Kết quả kiểm thử tự động

Các lệnh kiểm tra ngày 23/10/2026:

```bash
npm run typecheck
npm run lint
npm run test:logic
```

Kết quả:

- TypeScript: đạt.
- ESLint: đạt.
- Logic tests: 45/45 đạt.

Nhóm test bao phủ schema và tiền tố, seed, validation, CRUD, khoá ngoại, thumbnail, Quick/Regular, tìm kiếm/lọc/sắp xếp, offline, timeout sau POST, lỗi HTTP, sửa trong lúc request đang chạy, kéo dữ liệu từ server và dọn bản ghi trùng.

# 21. Việc còn phải làm trước khi nộp

## 21.1 Cấu hình MockAPI thật

Hai resource đã được tạo:

```text
BIT240045_DishCategory
BIT240045_Dish
```

Endpoint đang được cấu hình trong `src/config/appConfig.ts`:

```ts
export const MOCKAPI_BASE_URL = 'https://6ad74ddd95e98f36aef24400.mockapi.io/apt/v1';
```

Trước khi quay video, mở hai resource trên MockAPI để xác nhận dữ liệu seed đã được tự động đẩy lên và không có bản ghi trùng.

## 21.2 Tạo repository Git để nộp

Repository local hiện chưa có remote. Cần tạo repository có tên nên dùng `BIT240045_FoodManager`, thêm remote, push nhánh `main`, rồi thử mở link ở cửa sổ ẩn danh hoặc mời giảng viên nếu để private.

## 21.3 Kiểm thử thủ công trên đúng thiết bị demo

Sau khi cấu hình MockAPI, chạy toàn bộ checklist trong `docs/TEST_CASES.md`, đặc biệt:

1. Thêm món khi online.
2. Tắt mạng, sửa hoặc thêm món và kiểm tra trạng thái pending.
3. Bật mạng, không bấm Sync, chờ dữ liệu tự xuất hiện trên MockAPI.
4. Kiểm tra MockAPI không có bản ghi trùng.
5. Đổi English ↔ Tiếng Việt trên các màn danh sách, thêm, sửa và chi tiết.
6. Mở Database Inspector để xác nhận toàn bộ tên có tiền tố.

## 21.4 Quay video

Dùng kịch bản chi tiết tại `docs/VIDEO_SCRIPTS.md`. Video 1 phải thể hiện thao tác app và luồng offline/online. Video 2 nên đi theo thứ tự các mục trong tài liệu này, đặc biệt phải chỉ rõ `STUDENT_ID`, cách sinh `PREFIX`, schema bảng/cột và thuật toán đồng bộ.

