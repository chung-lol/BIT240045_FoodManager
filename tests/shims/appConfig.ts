/**
 * Cấu hình dùng riêng cho test: MSSV toàn chữ số (trường hợp khó nhất cho SQL vì
 * định danh bắt đầu bằng chữ số bắt buộc phải đặt trong nháy kép).
 * Các hằng số khác lấy nguyên từ file cấu hình thật.
 */
export * from '../../src/config/appConfig';
export const STUDENT_ID = '2251172999';
export const MOCKAPI_BASE_URL = 'https://test-project.mockapi.io/api/v1';
export const DATABASE_NAME = 'test.db';
export function isMockApiConfigured() {
  return true;
}
export function isStudentIdPlaceholder() {
  return false;
}
