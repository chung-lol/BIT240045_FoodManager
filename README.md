# BIT240045_foodmanager — Food Manager (Quản lý món ăn)

Ứng dụng di động quản lý món ăn cho bài kiểm tra giữa kỳ môn Phát triển ứng dụng di động.
**React Native + Expo SDK 58 + TypeScript + SQLite (offline-first) + MockAPI (đồng bộ tự động).**

| Hạng mục theo barem | Đáp ứng trong app |
|---|---|
| CRUD món ăn, xem chi tiết, xác nhận xoá | `src/app/index.tsx`, `dish/[id].tsx`, `dish/new.tsx`, `dish/edit/[id].tsx` |
| Lưu dữ liệu bền vững | SQLite `expo-sqlite`, bảng/cột có tiền tố `{MSSV}_` |
| Tìm kiếm + nhiều bộ lọc đồng thời + sắp xếp + giữ bộ lọc | `services/dishQuery.ts` (hàm thuần), `store/filterStore.ts` |
| Nhiều ảnh, đổi ảnh đại diện | `components/DishForm.tsx`, `dishRepository.setThumbnail` + unique index |
| Validation & ràng buộc nghiệp vụ | `services/validationService.ts` + CHECK/UNIQUE/FOREIGN KEY trong `database/schema.ts` |
| Quick (≤ 15 phút) / Regular (> 15 phút) | `dishQuery.speedLabel` |
| English mặc định ↔ Tiếng Việt | `src/i18n/*`, đổi ở màn Settings, lựa chọn được lưu lại |
| Offline + tự đồng bộ MockAPI, không trùng | `src/sync/*` — chi tiết ở mục 6 |
| Đặt tên `{MSSV}_` | `config/appConfig.ts` → `database/schema.ts`; kiểm chứng tại màn **Database** |

---

## 1. Cấu hình bắt buộc trước khi chạy (2 dòng)

Mở `src/config/appConfig.ts`:

```ts
export const STUDENT_ID = 'BIT240045';                                     // ← MSSV, chỉ chữ và số
export const MOCKAPI_BASE_URL = 'https://YOUR_PROJECT_ID.mockapi.io/api/v1'; // ← URL project MockAPI
```

Toàn bộ tên bảng, cột, index SQLite, tên resource và tên field gửi lên MockAPI đều sinh ra từ `STUDENT_ID`, nên chỉ sửa đúng một chỗ. Khi còn để `'MSSV'`, app hiện banner đỏ nhắc nhở. MSSV toàn chữ số vẫn chạy được vì mọi định danh SQL được đặt trong dấu nháy kép.

> Đổi `STUDENT_ID` sau khi đã chạy app sẽ tạo ra bộ bảng mới. Gỡ app (hoặc xoá dữ liệu Expo Go) để bắt đầu sạch.

## 2. Tạo MockAPI (khoảng 3 phút)

1. Đăng nhập https://mockapi.io → **New project** (có thể đặt API prefix `/api/v1`).
2. Tạo **2 resource**, tên đúng bằng giá trị trong `MOCKAPI_RESOURCES`:
   - `{MSSV}_DishCategory`
   - `{MSSV}_Dish`
3. Trong schema mỗi resource chỉ cần giữ trường `id`. Xoá các trường faker mặc định (`name`, `avatar`, `createdAt`). **Không bấm "Generate data"**: app tự đẩy dữ liệu mẫu lên ở lần đồng bộ đầu tiên.
4. Copy URL project (dạng `https://xxxxxxxx.mockapi.io/api/v1`) vào `MOCKAPI_BASE_URL`.

Nếu MockAPI không cho đặt tên resource có dấu `_` hoặc bắt đầu bằng chữ số, đổi `MOCKAPI_RESOURCES` sang tên khác bất kỳ. Các field dữ liệu (`{MSSV}_Name`, `{MSSV}_Price`...) vẫn giữ tiền tố.

Mỗi món được lưu trên MockAPI có dạng:

```json
{
  "id": "7",
  "2251172999_Id": "3f6c2c1e-...",
  "2251172999_Name": "Chicken Rice",
  "2251172999_Price": 45000,
  "2251172999_PreparationTime": 20,
  "2251172999_IsAvailable": true,
  "2251172999_DishCategoryId": "seed-cat-main",
  "2251172999_Images": "[{\"2251172999_Id\":\"...\",\"2251172999_ImageUrl\":\"https://...\",\"2251172999_IsThumbnail\":true}]",
  "2251172999_UpdatedAt": 1792483200000
}
```

`id` là id kỹ thuật do MockAPI sinh. Khoá nhận diện thật là `{MSSV}_Id`, một UUID sinh trên điện thoại ngay lúc lưu.

## 3. Cài đặt và chạy

Yêu cầu: Node.js ≥ 22.5 (để chạy test), app **Expo Go** bản hỗ trợ SDK 58 trên điện thoại, hoặc Android emulator.

```bash
npm install          # .npmrc đã bật legacy-peer-deps để tránh lỗi ERESOLVE react/react-dom
npx expo start       # quét QR bằng Expo Go, hoặc bấm "a" để mở Android emulator
```

Kiểm tra chất lượng:

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint (eslint-config-expo)
npm run test:logic   # 45 test tự động: SQLite thật + MockAPI giả lập (xem docs/TEST_CASES.md)
```

## 4. Demo offline cho chắc ăn

Expo Go tải JavaScript từ máy tính (Metro). Mất mạng thì app **đang chạy** vẫn hoạt động, nhưng nếu reload hoặc mở lại app khi offline, Expo Go sẽ không tải được bundle. Hai cách an toàn:

- **Khuyến nghị — APK chạy độc lập:** `npx eas-cli@latest build -p android --profile preview` (cấu hình có sẵn trong `eas.json`). Cài APK lên máy thật hoặc emulator, khi đó tắt/bật mạng, đóng/mở app thoải mái.
- **Dùng Expo Go:** mở app, vào danh sách món cho ảnh tải xong, *sau đó* mới bật chế độ máy bay. Không reload trong lúc offline.

Kịch bản demo chi tiết: `docs/VIDEO_SCRIPTS.md`.

## 5. Kiến trúc

```
UI (src/app, src/components)            ← chỉ hiển thị, đọc store + gọi service
   │
Services (src/services)                 ← validation, nghiệp vụ, lọc/sắp xếp (hàm thuần)
   │
Repositories (src/repositories)         ← SQL, ánh xạ cột {MSSV}_X ↔ model TypeScript
   │
SQLite (src/database)  ◄────────────►  Sync Engine (src/sync)  ◄────►  MockAPI (src/api)
 nguồn dữ liệu chính                    NetInfo + AppState + retry      REST
 cho mọi màn hình
```

**Offline-first:** mọi thao tác ghi xuống SQLite trước, giao diện cập nhật ngay, sau đó Sync Engine mới đẩy lên MockAPI. Mất mạng không làm thao tác Lưu thất bại.

```
src/
├── app/                 Expo Router: mỗi file là một màn hình
│   ├── index.tsx            Danh sách món + tìm kiếm/lọc/sắp xếp
│   ├── dish/[id].tsx        Chi tiết, nhiều ảnh, đổi thumbnail, xoá
│   ├── dish/new.tsx         Thêm món   ┐ dùng chung components/DishForm.tsx
│   ├── dish/edit/[id].tsx   Sửa món    ┘
│   ├── categories.tsx       Loại món + chặn xoá loại đang dùng
│   ├── settings.tsx         Ngôn ngữ, trạng thái đồng bộ
│   └── database.tsx         Xem schema SQLite thật, mở món theo ID
├── config/appConfig.ts  MSSV, MockAPI, luật nghiệp vụ
├── database/            schema (migration), mở DB, seed
├── models/              DishCategory, Dish (chứa DishImage[])
├── repositories/        Truy cập SQLite
├── services/            Nghiệp vụ + validation + lọc
├── api/                 HTTP client MockAPI + mapper payload
├── sync/                syncEngine (thuật toán), syncScheduler (điều phối), useNetworkSync (kích hoạt)
├── store/               Zustand: bộ lọc, ngôn ngữ, trạng thái sync, toast
├── i18n/                en.ts (mặc định), vi.ts (TypeScript bắt buộc dịch đủ khoá)
└── utils/, theme/, components/
tests/                   Test tự động + shim SQLite cho Node
docs/                    Review thiết kế, test case, kịch bản video
```

## 6. Thiết kế dữ liệu

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `{MSSV}_DishCategory` | Id, Name, NormalizedName, Description | UNIQUE(NormalizedName) với bản ghi chưa xoá |
| `{MSSV}_Dish` | Id, Name, NormalizedName, Price, PreparationTime, IsAvailable, Description, DishCategoryId | CHECK Price > 0, CHECK PreparationTime > 0, FK → DishCategory **ON DELETE RESTRICT**, UNIQUE(DishCategoryId, NormalizedName) |
| `{MSSV}_DishImage` | Id, DishId, ImageUrl, IsThumbnail, SortOrder | FK → Dish ON DELETE CASCADE, **UNIQUE(DishId) WHERE IsThumbnail = 1** (tối đa 1 ảnh đại diện) |
| `{MSSV}_AppSetting` | Key, Value | Ngôn ngữ, cờ seed, thời điểm sync |

Cột phục vụ đồng bộ (ở 2 bảng nghiệp vụ): `SyncStatus` (pending/synced), `IsDeleted` (tombstone), `RemoteId`, `LocalVersion`, `LastSyncError`, `CreatedAt`, `UpdatedAt`.

`NormalizedName` được tính bằng JavaScript (gộp khoảng trắng, chữ thường Unicode) vì `lower()` của SQLite chỉ xử lý chữ ASCII: `lower('PHỞ')` vẫn ra `'phỞ'`.

## 7. Cơ chế đồng bộ (tóm tắt — chi tiết trong comment đầu `src/sync/syncEngine.ts`)

1. **Kích hoạt tự động:** mở app, mạng có trở lại (NetInfo), app quay lại foreground, ngay sau mỗi thay đổi local (debounce 0,8 s), định kỳ 15 s khi còn bản ghi Pending. Không cần bấm nút.
2. **Single-flight:** tại một thời điểm chỉ có một lượt đồng bộ; yêu cầu đến giữa chừng chỉ bật cờ chạy thêm một lượt.
3. **Một lượt:** GET snapshot server → dọn bản ghi trùng → đẩy danh mục → đẩy món → xoá (tombstone) → kéo dữ liệu server về, bỏ qua bản ghi đang Pending.
4. **Chống trùng:** trước khi POST luôn tra snapshot theo `{MSSV}_Id`. POST bị timeout dù server đã tạo → lượt sau nhận ra là "đã có" → PUT thay vì POST.
5. **Chống mất dữ liệu khi sửa trong lúc đang gửi:** chỉ đánh dấu Synced nếu `LocalVersion` không đổi kể từ lúc đọc ra để gửi.
6. **Xung đột:** Last-Write-Wins theo `UpdatedAt`. Dữ liệu mẫu chưa bị sửa thì server luôn thắng, nên gỡ app cài lại không ghi đè dữ liệu đã sửa và không làm món đã xoá sống lại.
7. **Lỗi:** lỗi mạng dừng lượt và giữ nguyên Pending; lỗi HTTP ghi nhận theo bản ghi rồi làm tiếp; backoff 5 s → 2 phút.

## 8. Checklist nộp bài

- [ ] Đã đổi `STUDENT_ID` và `MOCKAPI_BASE_URL`, cài lại app; banner đỏ đã biến mất.
- [ ] Màn **Settings → Inspect database** báo "All tables, columns and indexes are prefixed".
- [ ] `npm run typecheck && npm run lint && npm run test:logic` đều qua.
- [ ] Đã chạy tay các test case trong `docs/TEST_CASES.md` trên đúng thiết bị sẽ demo.
- [ ] Repo GitHub để public (hoặc đã mời giảng viên), không commit `node_modules`.
- [ ] Video 1 nộp trong ca kiểm tra; Video 2 trước 23/10/2026; mở thử link video, có tiếng, có MSSV.
