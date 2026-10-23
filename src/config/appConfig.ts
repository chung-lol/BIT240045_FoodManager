/**
 * ============================================================
 *  CẤU HÌNH DUY NHẤT CẦN SỬA TRƯỚC KHI CHẠY / NỘP BÀI
 * ============================================================
 *
 * 1. STUDENT_ID: thay bằng MSSV thật. Toàn bộ tên bảng, tên cột SQLite,
 *    tên index và tên field gửi lên MockAPI đều được sinh từ hằng số này
 *    (xem src/database/schema.ts), nên chỉ cần sửa đúng MỘT chỗ.
 *    MSSV toàn chữ số (vd 2251012345) vẫn dùng được vì mọi định danh SQL
 *    đều được đặt trong dấu nháy kép.
 *
 * 2. MOCKAPI_BASE_URL: URL project trên https://mockapi.io
 *    Ví dụ: https://6712abcd1234567890abcdef.mockapi.io/api/v1
 *    Nếu để nguyên giá trị mẫu, app vẫn chạy 100% local và màn hình
 *    sẽ báo "MockAPI chưa được cấu hình".
 *
 * Lưu ý: đổi STUDENT_ID sau khi đã chạy app => tạo ra bộ bảng MỚI.
 * Hãy gỡ app / xoá dữ liệu app để bắt đầu sạch.
 */
export const STUDENT_ID = 'BIT240045';

export const MOCKAPI_BASE_URL = 'https://6ad74ddd95e98f36aef24400.mockapi.io/apt/v1';

/**
 * Tên 2 resource tạo trên MockAPI (đóng vai trò 2 "bảng" phía server), cũng mang tiền tố MSSV
 * cho đồng nhất với yêu cầu đặt tên. Ảnh được nhúng vào bản ghi món ăn
 * (field {MSSV}_Images) nên chỉ cần 2 resource.
 * Nếu giao diện MockAPI không chấp nhận tên này (vd MSSV bắt đầu bằng chữ số),
 * đổi thành tên khác bất kỳ ở đây — các FIELD dữ liệu vẫn luôn có tiền tố MSSV.
 */
export const MOCKAPI_RESOURCES = {
  categories: `${STUDENT_ID}_DishCategory`,
  dishes: `${STUDENT_ID}_Dish`,
} as const;

export const SYNC_CONFIG = {
  /** Timeout cho mỗi request HTTP. */
  requestTimeoutMs: 10_000,
  /** Gom nhiều thay đổi liên tiếp rồi mới đồng bộ một lần. */
  debounceMs: 800,
  /** Chu kỳ kiểm tra lại khi vẫn còn bản ghi Pending. */
  retryTickMs: 15_000,
  /** Backoff khi đồng bộ lỗi: 5s, 10s, 20s ... tối đa 2 phút. */
  backoffBaseMs: 5_000,
  backoffMaxMs: 120_000,
} as const;

export const BUSINESS_RULES = {
  quickDishMaxMinutes: 15,
  nameMaxLength: 100,
  descriptionMaxLength: 500,
  maxPrice: 100_000_000,
  maxPreparationMinutes: 1_440,
  maxImagesPerDish: 10,
} as const;

/** Tên file SQLite trên thiết bị. */
export const DATABASE_NAME = 'BIT240045_foodmanager.db';

/** true khi vẫn để giá trị mẫu => app hiện cảnh báo đỏ ở màn Danh sách và Cài đặt. */
export function isStudentIdPlaceholder(): boolean {
  return (STUDENT_ID as string) === 'MSSV';
}

export function isMockApiConfigured(): boolean {
  return /^https?:\/\//.test(MOCKAPI_BASE_URL) && !MOCKAPI_BASE_URL.includes('YOUR_PROJECT_ID');
}

if (!/^[A-Za-z0-9]+$/.test(STUDENT_ID)) {
  // Chặn ký tự lạ để tên bảng/cột luôn hợp lệ và không thể chèn SQL.
  throw new Error('STUDENT_ID chỉ được chứa chữ và số (A-Z, a-z, 0-9).');
}
