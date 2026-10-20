import * as Crypto from 'expo-crypto';

/**
 * Id nghiệp vụ được sinh NGAY TRÊN THIẾT BỊ (UUID v4) tại thời điểm lưu local,
 * và không bao giờ đổi. Đây là "khoá chống trùng" khi đồng bộ:
 * Sync Engine tìm bản ghi trên MockAPI theo field {MSSV}_Id chứ không theo
 * id kỹ thuật do MockAPI sinh, nên retry bao nhiêu lần cũng không tạo bản sao.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
