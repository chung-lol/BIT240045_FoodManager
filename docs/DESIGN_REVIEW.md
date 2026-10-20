# Review bản phân tích thiết kế ban đầu — những gì giữ, những gì đổi, và vì sao

Bản phân tích gốc đúng ở các quyết định lớn: offline-first với SQLite làm nguồn dữ liệu chính, tách Screen → Service → Repository, form dùng chung cho Thêm/Sửa, unique index có điều kiện cho thumbnail, tombstone cho thao tác xoá offline, single-flight cho sync, và nhận định rằng hai video chiếm 40% điểm. Các điểm đó được giữ nguyên trong code.

Dưới đây là những chỗ đã thay đổi hoặc bổ sung khi triển khai thật. Mỗi điểm đều có test tự động tương ứng trong `tests/logic.test.ts`.

## 1. Bảng `SyncQueue` dạng nhật ký thao tác → "outbox theo bản ghi"

**Bản gốc:** một bảng SyncQueue ghi từng thao tác CREATE / UPDATE / DELETE.

**Vấn đề:** offline tạo món rồi sửa 3 lần rồi xoá sẽ sinh 5 dòng queue, phải xử lý đúng thứ tự và gộp các thao tác. Lỗi thứ tự (UPDATE chạy trước CREATE, DELETE trước UPDATE) là nguồn bug kinh điển.

**Cách làm:** mỗi bản ghi tự mang trạng thái của nó — `{MSSV}_SyncStatus` (pending/synced), `{MSSV}_IsDeleted` (tombstone), `{MSSV}_LocalVersion`. "Hàng đợi" chính là câu truy vấn `WHERE SyncStatus = 'pending'`. Sửa 5 lần vẫn chỉ cần 1 request; không bao giờ sai thứ tự. Khi thuyết trình vẫn gọi là "outbox/hàng đợi" được, vì bản chất giống nhau.

## 2. Hai loại ID (`ClientId` + `Id`) → một khoá nghiệp vụ duy nhất

**Bản gốc:** thêm `ClientId` riêng, rồi ánh xạ local ID ↔ remote ID.

**Cách làm:** `{MSSV}_Id` chính là UUID sinh trên thiết bị và dùng ở mọi nơi, kể cả khoá ngoại `{MSSV}_DishCategoryId`. `id` của MockAPI chỉ dùng để ghép URL PUT/DELETE (lưu ở `{MSSV}_RemoteId`). Vì quan hệ món–danh mục dùng UUID, không còn chuyện "danh mục chưa có remote ID nên món chưa gửi được".

## 3. "GET theo ClientId trước khi retry" → snapshot toàn bộ mỗi lượt

**Bản gốc:** chỉ khi gặp lỗi không rõ ràng mới GET `?ClientId=...` để kiểm tra.

**Vấn đề thực tế với MockAPI:** tài liệu MockAPI chỉ nói lọc bằng query string, không cam kết so khớp chính xác (thực tế thường là so khớp chứa chuỗi), và tài liệu của một số dự án dùng MockAPI ghi nhận trả 404 khi lọc không có kết quả. Dựa vào hành vi đó để chống trùng là rủi ro. Ngoài ra "lỗi không rõ ràng" rất khó phân loại đúng.

**Cách làm:** mỗi lượt sync GET toàn bộ 2 resource (dữ liệu bài này chỉ vài chục bản ghi), lập chỉ mục theo `{MSSV}_Id`, *luôn* tra chỉ mục trước khi POST. Có thêm bước tự dọn nếu server lỡ có 2 bản cùng `{MSSV}_Id`. Test `TC21` mô phỏng đúng tình huống "server đã tạo nhưng client timeout" và xác nhận không sinh bản thứ hai.

## 4. Lỗ hổng chưa được nhắc: sửa dữ liệu trong lúc request đang bay

Nếu engine gửi PUT giá 31.000 và trong lúc chờ phản hồi người dùng sửa thành 32.000, cách "gửi xong thì xoá khỏi queue" sẽ đánh dấu Synced nhầm và giá 32.000 không bao giờ được gửi. Code chỉ đánh dấu Synced khi `LocalVersion` còn khớp với lúc đọc ra (`markDishSynced`). Test `SYNC05`.

## 5. "Local pending wins" → Last-Write-Wins + quy tắc cho dữ liệu mẫu

**Bản gốc:** dữ liệu local đang chờ luôn thắng.

**Vấn đề:** gỡ app cài lại (rất hay xảy ra trước buổi demo) thì seed chạy lại, mọi bản ghi mẫu đều "pending" và sẽ ghi đè dữ liệu đã sửa trên MockAPI. Nếu seed dùng UUID ngẫu nhiên như bản gốc gợi ý thì còn tệ hơn: MockAPI bị nhân đôi 5 món mỗi lần cài lại.

**Cách làm:**
- Seed dùng **Id cố định** (`seed-dish-chicken-rice`...) và `UpdatedAt` rất cũ.
- So `UpdatedAt` giữa local và server: bản mới hơn thắng.
- Bản ghi mẫu chưa từng bị sửa (`LocalVersion = 1`, chưa có `RemoteId`): nếu server đã có dữ liệu thì server là nguồn sự thật; món mẫu đã bị xoá trên server sẽ không sống lại.

Chính bộ test đã phát hiện lỗi "món mẫu đã xoá sống lại sau khi cài lại app" trong phiên bản đầu, và quy tắc thứ ba được thêm để sửa (test `SYNC09`, `SYNC11`).

## 6. Bẫy của SQLite/Expo mà bản gốc chưa nêu

- `PRAGMA foreign_keys` **mặc định TẮT** và có hiệu lực theo từng kết nối. Quên dòng này thì `ON DELETE RESTRICT` chỉ là trang trí.
- `withExclusiveTransactionAsync` của expo-sqlite mở *kết nối mới*, trên đó foreign key lại về OFF và không bật được bên trong transaction. Vì vậy app dùng một hàng đợi ghi tuần tự (`writeTransaction`) trên kết nối chính.
- `lower()` và `LIKE` của SQLite chỉ không phân biệt hoa/thường với chữ ASCII. Tên chuẩn hoá được tính bằng JavaScript và lưu vào cột `{MSSV}_NormalizedName` có unique index. Test `TC05b` thử "Phở bò" và "PHỞ  BÒ".
- MSSV toàn chữ số (vd `2251172999_Dish`) **không phải định danh SQL hợp lệ** nếu không đặt trong nháy kép. Mọi tên đều được quote; bộ test chạy với MSSV dạng số để chứng minh.

## 7. Tiền tố MSSV cũng áp dụng cho MockAPI

Bản gốc chỉ nói tới bảng SQLite. Dữ liệu trên MockAPI cũng là "bảng và trường dữ liệu", nên field gửi lên (`{MSSV}_Name`...) và tên resource đều có tiền tố. Cách an toàn nhất trước một quy định có thể bị trừ 1–3 điểm.

## 8. Chứng minh tiền tố MSSV bằng dữ liệu thật thay vì lời nói

Thêm màn **Database** đọc `sqlite_master` và `PRAGMA table_info` từ chính file SQLite trên điện thoại, tự kiểm tra mọi bảng/cột/index có tiền tố và hiển thị trạng thái `PRAGMA foreign_keys`. Khi quay Video 2, mở màn này song song với `schema.ts` là bằng chứng rõ ràng nhất. Banner đỏ cảnh báo nếu quên đổi `STUDENT_ID`.

## 9. Điều hướng: Expo Router thay vì React Navigation

Template Expo SDK 58 mặc định dùng Expo Router (định tuyến theo file). Mỗi màn hình là một file trong `src/app/`, dễ chỉ ra trong video. Deep link `lethanhchungbtgk://dish/<id>` cũng hoạt động sẵn, và có ô "Mở món theo ID" để demo màn hình Not Found (TC17).

## 10. Các chi tiết trải nghiệm nhỏ nhưng dễ bị hỏi

- **Ảnh khi offline:** `expo-image` với cache đĩa, và sau mỗi lượt sync app tải trước toàn bộ ảnh. Ảnh đã từng xem vẫn hiện khi mất mạng; URL lỗi hiện khung dự phòng.
- **Min > Max:** báo lỗi và *bỏ qua* điều kiện giá, thay vì trả danh sách rỗng gây hiểu nhầm.
- **Tìm kiếm không dấu:** "pho bo" vẫn ra "Phở bò" (tập cha của yêu cầu không phân biệt hoa/thường).
- **Lỗi validation lưu dạng khoá dịch**, nên đổi ngôn ngữ thì lỗi đang hiển thị cũng đổi theo.
- **Danh mục đang lọc bị xoá** → tự bỏ điều kiện lọc đó.

## 11. Rủi ro demo mà bản gốc mới chỉ nhắc qua

Expo Go phụ thuộc Metro. Offline thì app đang chạy vẫn ổn, nhưng reload hoặc mở lại app là hỏng. `eas.json` đã có profile `preview` để build APK chạy độc lập. Đây là cách duy nhất để demo trọn kịch bản "tắt mạng → thêm món → đóng app → mở lại → vẫn còn → bật mạng → tự đồng bộ".

## 12. Kiểm thử tự động thay cho kiểm thử thủ công thuần

Bản gốc đề xuất kiểm thử thủ công 22 tình huống. Phần lõi (SQL, validation, lọc, sync) giờ có 45 test chạy bằng `npm run test:logic`, dùng **SQLite thật** của Node và một MockAPI giả lập có thể bật các sự cố: mất mạng, timeout sau khi server đã ghi, lỗi 500, sửa dữ liệu giữa chừng, server bị xoá sạch, cài lại app. Kiểm thử thủ công vẫn cần cho phần giao diện.

## Những gì bản gốc nói đúng nhưng cần nhấn mạnh hơn

- Video 1 và link Git nộp **ngay trong ca kiểm tra**. Mốc 23/10 chỉ là hạn của Video 2.
- Đề cho phép dùng AI nhưng sẽ hỏi và yêu cầu sửa code trực tiếp. Mọi quyết định khó trong code đều có comment tiếng Việt giải thích lý do, nên đọc kỹ các comment ở `schema.ts`, `database.ts`, `syncEngine.ts`, `syncScheduler.ts` trước buổi kiểm tra.
