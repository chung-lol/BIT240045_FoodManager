# Bộ test case

Cột **Tự động** ghi tên test trong `tests/logic.test.ts` (chạy `npm run test:logic`, SQLite thật + MockAPI giả lập). Cột **Tay** để tự điền Pass/Fail khi chạy trên đúng thiết bị sẽ dùng để demo — phần giao diện chỉ kiểm chứng được bằng tay.

## A. Validation và ràng buộc nghiệp vụ

| ID | Tình huống | Thao tác trên app | Kết quả mong đợi | Tự động | Tay |
|---|---|---|---|---|---|
| TC01 | Tên toàn khoảng trắng | Thêm món, Name = `"   "` | Lỗi "Name is required", không lưu | TC01 | |
| TC02 | Giá = 0 / âm / chữ | Price = `0`, `-5`, `abc` | Lỗi tương ứng dưới ô Price | TC02a/b/c | |
| TC03 | Thời gian = 0 hoặc lẻ | Prep time = `0`, `12.5` | Lỗi, yêu cầu số nguyên phút > 0 | TC03a/b | |
| TC04 | Danh mục không tồn tại | (Không chọn được trên UI — kiểm bằng test) | Lỗi categoryNotFound | TC04 | — |
| TC05 | Trùng tên cùng danh mục | Thêm "  chicken   RICE " vào Main Dishes | Lỗi trùng tên | TC05, TC05b | |
| TC06 | Trùng tên khác danh mục | Thêm "Chicken Rice" vào Appetizers | Lưu được | TC06 | |
| TC06b | Sửa món giữ nguyên tên | Mở Beef Noodles → sửa giá | Lưu được, không báo trùng | TC06b | |
| TC07 | Xoá món → Huỷ | Chi tiết → Delete → Cancel | Món vẫn còn | — | |
| TC08 | Xoá món → Đồng ý | Chi tiết → Delete → Delete | Về danh sách, món biến mất | TC08 | |
| TC09 | Xoá danh mục đang có món | Categories → xoá Main Dishes | Hộp thoại "Cannot delete… N dish(es)" | TC09 | |
| TC09b | Xoá danh mục rỗng / trùng tên danh mục | Thêm "Desserts", thêm " desserts ", xoá "Desserts" | Báo trùng; xoá được danh mục rỗng | CAT | |
| VAL | URL ảnh sai / trùng | Thêm ảnh `abc`, thêm cùng URL 2 lần | Lỗi dưới ô ảnh | VAL | |

## B. Ảnh, nhãn, danh sách

| ID | Tình huống | Thao tác | Kết quả mong đợi | Tự động | Tay |
|---|---|---|---|---|---|
| TC10 | Đổi thumbnail | Chicken Rice → chọn ảnh 3 → Set as thumbnail | Sao vàng chuyển sang ảnh 3, danh sách hiện ảnh 3 | TC10, DB06 | |
| IMG | Ảnh đầu tự thành thumbnail | Thêm món 2 ảnh, không chọn | Ảnh 1 là thumbnail | IMG | |
| IMG2 | Xoá ảnh đại diện trong form | Sửa món → xoá ảnh đang là thumbnail | Ảnh còn lại đầu tiên tự lên thay | — | |
| IMG3 | URL ảnh hỏng | Thêm ảnh `https://example.com/khong-co.jpg` | Khung "Image unavailable", không vỡ giao diện | — | |
| TC11 | 15 phút | Món có Prep time 15 | Nhãn **Quick** | TC11/12 | |
| TC12 | 16 phút | Sửa thành 16 | Nhãn **Regular** | TC11/12 | |
| TC13 | Lọc "Available" | Filters → Status: Available | French Fries ẩn; chọn All thì hiện lại | TC13 | |
| TC14 | Kết hợp nhiều điều kiện | Tìm "rice" + Main Dishes + Available + 20000–60000 + Price ↓ | Chỉ Chicken Rice | TC14, TC14b | |
| TC15 | Giữ bộ lọc khi quay lại | Đặt bộ lọc ở TC14 → mở món → Edit → Save → Back | Ô tìm kiếm và mọi điều kiện còn nguyên | — | |
| TC16 | Min > Max | Min 60000, Max 20000 | Lỗi khoảng giá, bỏ qua điều kiện giá | TC16 | |
| TC17 | ID không tồn tại | Settings → Inspect database → Open dish by ID → `abc` | Màn "Dish not found" + nút Go back | TC17 | |
| SEARCH | Tìm không dấu | Tìm "pho bo" (sau khi thêm "Phở bò") | Ra "Phở bò" | SEARCH | |
| TC18 | Đổi ngôn ngữ | Settings → Tiếng Việt, mở mọi màn, gây lỗi validation, mở hộp thoại xoá | Mọi nhãn, nút, trạng thái, lỗi, hộp thoại đều tiếng Việt; mở lại app vẫn tiếng Việt | — | |

## C. Dữ liệu bền vững và đặt tên

| ID | Tình huống | Thao tác | Kết quả mong đợi | Tự động | Tay |
|---|---|---|---|---|---|
| DB01 | Tiền tố MSSV | Settings → Inspect database | Badge xanh "All … prefixed", mọi tên có `{MSSV}_` | DB01 | |
| DB02 | Foreign key bật | Như trên | `PRAGMA foreign_keys = ON` | DB02 | |
| DB03 | Seed có version | Đóng/mở app 3 lần | Vẫn 3 danh mục / 15 món ban đầu, không tạo trùng | DB03 | |
| DB04–05 | Ràng buộc ở tầng SQLite | (bằng test) | CHECK và FK chặn dữ liệu sai kể cả khi bỏ qua service | DB04, DB05 | — |
| PERSIST | Dữ liệu còn sau khi tắt app | Thêm món → vuốt tắt app → mở lại | Món vẫn còn | — | |

## D. Offline và đồng bộ MockAPI

| ID | Tình huống | Thao tác | Kết quả mong đợi | Tự động | Tay |
|---|---|---|---|---|---|
| SYNC01 | Đồng bộ lần đầu | Cấu hình MockAPI, mở app có mạng | Thanh trạng thái "Online · All synced"; dashboard MockAPI có 3 danh mục + 15 món | SYNC01 | |
| SYNC02 | Không trùng khi sync lặp | Kéo app ra nền rồi mở lại vài lần | Số bản ghi trên MockAPI không đổi | SYNC02 | |
| TC19 | Thêm món khi offline | Bật chế độ máy bay → thêm "Offline Soup" | Lưu ngay, thanh trạng thái "Offline · 1 pending", icon đám mây cam trên thẻ món | TC19/20 | |
| TC19b | Offline + tắt app | (APK) Tắt app khi offline → mở lại | Món vẫn còn, vẫn pending | — | |
| TC20 | Có mạng trở lại | Tắt chế độ máy bay, không bấm gì | Vài giây sau "All synced"; F5 dashboard MockAPI thấy món | TC19/20 | |
| SYNC03 | Sửa giá khi offline | Offline → sửa giá Chicken Rice → online | MockAPI có giá mới | SYNC03 | |
| SYNC04 | Xoá khi offline | Offline → xoá món → online | MockAPI mất bản ghi; món không quay lại sau lượt sync tiếp | SYNC04 | |
| TC21 | Timeout sau khi server đã ghi | (bằng test) | Retry không tạo bản thứ 2 | TC21 | — |
| TC22 | MockAPI lỗi 500 | (bằng test; hoặc tạm sửa sai URL) | Không mất dữ liệu pending, lượt sau đồng bộ được | TC22 | — |
| SYNC05 | Sửa trong lúc đang gửi | (bằng test) | Thay đổi mới nhất không bị đánh dấu Synced nhầm | SYNC05 | — |
| SYNC06 | Sửa trên dashboard MockAPI | Sửa `{MSSV}_Price` trên web → đưa app ra nền rồi mở lại | App hiện giá mới | SYNC06 | |
| SYNC07 | Xoá trên dashboard MockAPI | Xoá một món trên web → mở lại app | Món biến mất khỏi app | SYNC07 | |
| SYNC08 | Server có bản trùng | (bằng test) | Tự dọn còn 1 | SYNC08 | — |
| SYNC09–11 | Gỡ app cài lại | Gỡ app → cài lại → mở có mạng | Không trùng, không ghi đè dữ liệu đã sửa, món/danh mục đã xoá không sống lại | SYNC09, SYNC11 | |
| SYNC10 | Resource MockAPI bị xoá sạch | Xoá hết bản ghi trên web → mở lại app | App đẩy lại toàn bộ, không xoá dữ liệu trên máy | SYNC10 | |
