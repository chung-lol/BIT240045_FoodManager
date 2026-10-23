# Kịch bản 2 video

Thời lượng chỉ là gợi ý; đề không quy định số phút. Quay màn hình điện thoại/emulator, mở song song tab trình duyệt dashboard MockAPI để chứng minh đồng bộ.

---

## Video 1 — Demo ứng dụng (nộp trong ca kiểm tra) · khoảng 6–8 phút

**Chuẩn bị trước khi bấm quay**
- Bản APK `preview` đã cài (hoặc Expo Go đã mở sẵn và tải xong ảnh).
- Dashboard MockAPI mở ở resource `{MSSV}_Dish`.
- App đang ở tiếng Anh, bộ lọc đã Reset, dữ liệu đúng 15 món mẫu với ảnh đúng món (seed cũ tự nâng cấp, không cần xoá dữ liệu app).

| # | Thao tác | Lời nói gợi ý |
|---|---|---|
| 1 | Settings → Inspect database | "Em là Lê Thành Chung, MSSV …. Đây là schema SQLite thật trên máy: mọi bảng, cột, index đều có tiền tố MSSV, khoá ngoại đang bật." |
| 2 | Về danh sách | "Danh sách hiển thị tên, giá, loại, trạng thái, thời gian, ảnh đại diện và nhãn Quick/Regular." |
| 3 | Mở Chicken Rice → bấm từng ảnh → Set as thumbnail ảnh 3 → Back | "Món có nhiều ảnh; đổi ảnh đại diện thì ảnh cũ tự bỏ chọn, danh sách cập nhật ngay." |
| 4 | Add dish: để trống tên, giá 0, thời gian `abc` → Save | "Validation: tên rỗng, giá phải > 0, thời gian là số nguyên phút." |
| 5 | Nhập "chicken rice", chọn Main Dishes → Save | "Trùng tên trong cùng loại bị chặn, không phân biệt hoa thường." |
| 6 | Đổi sang Appetizers → thêm 2 URL ảnh → Save | "Cùng tên nhưng khác loại thì hợp lệ." |
| 7 | Mở một món → Edit → đổi giá, đổi thời gian 15 → 16 → Save | "Sửa xong quay lại thấy giá mới; 16 phút chuyển sang Regular." |
| 8 | Delete → Cancel, rồi Delete → Delete | "Có hộp thoại xác nhận; Huỷ thì không xoá." |
| 9 | Categories → xoá Main Dishes | "Không xoá được loại còn món." |
| 10 | Tìm "rice" + Filters: Main Dishes, Available, 20000–60000, Price ↓ | "Các điều kiện áp dụng đồng thời." |
| 11 | Mở một món kết quả → Edit → Save → Back 2 lần | "Bộ lọc vẫn giữ nguyên khi quay lại." |
| 12 | Nhập Min 60000, Max 20000 | "Khoảng giá sai thì báo lỗi." → Reset |
| 13 | Settings → Tiếng Việt → đi qua danh sách, chi tiết, form lỗi, hộp thoại xoá | "Toàn bộ nhãn, trạng thái, lỗi đều đổi sang tiếng Việt." |
| 14 | **Bật chế độ máy bay** → thanh trạng thái thành Offline | "Giờ em ngắt mạng hoàn toàn." |
| 15 | Thêm "Offline Soup"; sửa giá Beef Noodles | "Vẫn lưu được, thấy biểu tượng đám mây cam: đang chờ đồng bộ, thanh trạng thái báo 2 pending." |
| 16 | (APK) Tắt hẳn app, mở lại | "Dữ liệu offline vẫn còn vì nằm trong SQLite." |
| 17 | F5 dashboard MockAPI | "Trên server chưa có Offline Soup." |
| 18 | **Tắt chế độ máy bay**, không bấm gì | "Em không bấm nút nào." → chờ "All synced" |
| 19 | F5 dashboard MockAPI | "Offline Soup đã lên, giá Beef Noodles đã đổi, và chỉ có một bản, không bị trùng." |

## Video 2 — Giải thích mã nguồn (hạn 23/10/2026) · khoảng 12–15 phút

Mở VS Code, phóng to chữ. Nói **vì sao** chứ không chỉ đọc code.

| # | File | Ý chính cần nói |
|---|---|---|
| 1 | `app.json`, `package.json` | Tên project BIT240045_foodmanager, Expo SDK 58, các thư viện: expo-sqlite, NetInfo, Zustand, expo-router, expo-image. |
| 2 | `README.md` mục 5 | Kiến trúc 4 tầng, offline-first: SQLite là nguồn chính, MockAPI chỉ là đích đồng bộ. |
| 3 | `src/config/appConfig.ts` | MSSV khai báo **một chỗ**; luật nghiệp vụ (Quick ≤ 15 phút, giới hạn ảnh...). |
| 4 | `src/database/schema.ts` | **Phần bắt buộc chỉ rõ:** hàm `p()` sinh tên `{MSSV}_...` cho bảng, cột, index; `q()` đặt nháy kép. Đọc CHECK Price > 0, FK RESTRICT, unique index trùng tên theo loại, unique index thumbnail. Mở song song màn **Database** trên điện thoại để chứng minh schema thật. |
| 5 | `src/models/index.ts` | 2 model chính DishCategory và Dish; DishImage là thành phần của Dish. |
| 6 | `src/database/database.ts` | Bật `PRAGMA foreign_keys` (mặc định tắt); migration bằng `user_version`; hàng đợi ghi tuần tự và lý do không dùng `withExclusiveTransactionAsync`. |
| 7 | `src/database/seed.ts` | Seed 1 lần (cờ SeedDone), Id cố định, UpdatedAt cũ: cài lại app không tạo trùng trên MockAPI. |
| 8 | `src/repositories/dishRepository.ts` | Ánh xạ cột ↔ model; lưu món + ảnh trong một transaction; `setThumbnail` bỏ cờ cũ **trước** rồi mới bật cờ mới. |
| 9 | `src/services/validationService.ts`, `dishService.ts` | Validate 2 lớp (service + ràng buộc SQLite); `NormalizedName` vì `lower()` của SQLite không hiểu tiếng Việt; lỗi trả về dạng khoá để dịch được. |
| 10 | `src/services/dishQuery.ts`, `store/filterStore.ts` | Hàm thuần lọc AND rồi sắp xếp; bộ lọc ở store toàn cục nên giữ được khi điều hướng. |
| 11 | `src/components/DishForm.tsx` | Một form cho Thêm và Sửa; quản lý danh sách ảnh, chọn thumbnail, xoá thumbnail thì ảnh khác lên thay. |
| 12 | `src/i18n/` | `en.ts` mặc định, `vi.ts` có kiểu `Record<TranslationKey, string>` nên thiếu khoá là lỗi biên dịch; lựa chọn lưu trong bảng AppSetting. |
| 13 | `src/sync/useNetworkSync.ts` | 5 thời điểm tự kích hoạt đồng bộ; NetInfo kiểm tra `isInternetReachable`. |
| 14 | `src/sync/syncScheduler.ts` | Single-flight, debounce, backoff. |
| 15 | `src/sync/syncEngine.ts` | Đọc comment đầu file: snapshot → dọn trùng → đẩy → xoá → kéo về. Hai cơ chế cốt lõi: tra `{MSSV}_Id` trước khi POST (chống trùng khi timeout) và kiểm tra `LocalVersion` khi đánh dấu Synced (chống mất thay đổi). Chính sách xung đột Last-Write-Wins và quy tắc dữ liệu mẫu. |
| 16 | `src/api/` | Payload gửi lên MockAPI cũng dùng field có tiền tố MSSV; timeout 10 s bằng AbortController; 404 khi DELETE coi như đã xoá. |
| 17 | Terminal: `npm run test:logic` | 45 test chạy SQLite thật + MockAPI giả lập, có cả kịch bản mất mạng, timeout, cài lại app. |

**Câu hỏi giảng viên có thể hỏi — chuẩn bị sẵn câu trả lời**
- *Nếu POST thành công nhưng mất phản hồi thì sao?* → Lượt sau GET snapshot, thấy `{MSSV}_Id` đã có nên PUT, không POST lại.
- *Đang gửi mà người dùng sửa tiếp thì sao?* → `LocalVersion` đã tăng nên bản ghi vẫn Pending, lượt sau gửi bản mới.
- *Xoá offline xong tải dữ liệu server về thì món có hiện lại không?* → Không, vì tombstone `IsDeleted = 1` vẫn Pending và bước kéo về bỏ qua bản ghi Pending.
- *Xoá offline một món rồi xoá luôn danh mục của nó thì sao?* → Service chỉ đếm món chưa xoá nên cho phép; danh mục được đánh dấu tombstone. Xoá vật lý chỉ diễn ra khi đồng bộ, theo thứ tự món trước, danh mục sau; nếu vẫn còn tham chiếu thì FK RESTRICT chặn và lượt sau làm lại.
- *Sửa thêm field ALTER TABLE thì sao?* → Thêm phần tử mới vào cuối mảng `MIGRATIONS` (`ALTER TABLE ... ADD COLUMN`), không sửa migration cũ; `PRAGMA user_version` sẽ tự chạy phần mới.
- *Sửa trực tiếp: thêm field X vào món* → migration mới, model, repository (`mapDishBase`, insert/update), `remoteMappers`, form, i18n — theo đúng thứ tự các tầng.
- *Đổi ngưỡng Quick thành 20 phút* → `BUSINESS_RULES.quickDishMaxMinutes` trong `appConfig.ts`.
