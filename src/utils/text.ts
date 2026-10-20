/**
 * Chuẩn hoá tên để so trùng: NFC, gộp khoảng trắng, bỏ khoảng trắng đầu/cuối,
 * chữ thường theo Unicode.
 *
 * Không dùng lower() của SQLite vì nó chỉ hạ chữ ASCII:
 * lower('PHỞ BÒ') = 'phỞ bÒ'  =>  "Phở bò" và "PHỞ BÒ" bị coi là KHÁC nhau.
 * Vì vậy tên chuẩn hoá được tính ở JS và lưu vào cột {MSSV}_NormalizedName
 * (có unique index).
 */
export function normalizeName(value: string): string {
  return safeNormalize(value, 'NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** String.normalize an toàn: nếu engine JS không hỗ trợ thì trả nguyên chuỗi thay vì crash. */
function safeNormalize(value: string, form: 'NFC' | 'NFD'): string {
  try {
    return typeof value.normalize === 'function' ? value.normalize(form) : value;
  } catch {
    return value;
  }
}

/** Bảng bỏ dấu tiếng Việt tường minh — chạy đúng kể cả khi normalize('NFD') không khả dụng. */
const VI_FOLD: [RegExp, string][] = [
  [/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a'],
  [/[èéẹẻẽêềếệểễ]/g, 'e'],
  [/[ìíịỉĩ]/g, 'i'],
  [/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o'],
  [/[ùúụủũưừứựửữ]/g, 'u'],
  [/[ỳýỵỷỹ]/g, 'y'],
  [/đ/g, 'd'],
];

/** Gộp khoảng trắng thừa để lưu tên gọn gàng ("  Phở   bò " -> "Phở bò"). */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Khoá tìm kiếm: chữ thường + bỏ dấu tiếng Việt.
 * Tìm "pho" vẫn ra "Phở bò"; tìm "PHỞ" cũng ra. Đây là tập cha của yêu cầu
 * "không phân biệt hoa/thường".
 */
export function searchKey(value: string): string {
  let s = safeNormalize(value, 'NFC').toLowerCase();
  for (const [re, ch] of VI_FOLD) s = s.replace(re, ch);
  return safeNormalize(s, 'NFD')
    .replace(/[\u0300-\u036f]/g, '') // dấu tổ hợp còn sót (bàn phím gõ dạng tổ hợp)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse số tiền người dùng nhập. Chấp nhận: "45000", "45.000", "45,000",
 * "45 000", "12.5", "12,5". Trả về NaN nếu không hợp lệ ("abc", "1e3", "-5").
 */
export function parseMoney(raw: string): number {
  const s = raw.replace(/\s/g, '').trim();
  if (s === '') return NaN;
  // Dạng có phân cách hàng nghìn: 1.234.567 hoặc 1,234,567
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    return Number(s.replace(/[.,]/g, ''));
  }
  // Dạng thập phân thường: 12.5 / 12,5 / 45000
  if (/^\d+([.,]\d+)?$/.test(s)) {
    return Number(s.replace(',', '.'));
  }
  return NaN;
}

/** Parse số nguyên dương thuần ("20" hợp lệ, "20.5"/"abc"/"" => NaN). */
export function parseIntStrict(raw: string): number {
  const s = raw.trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

/** Định dạng tiền VND không phụ thuộc Intl (Hermes trên một số máy thiếu locale). */
export function formatMoney(value: number, lang: 'en' | 'vi'): string {
  const rounded = Math.round(value * 100) / 100;
  const [intPart, decPart] = String(rounded).split('.');
  const sep = lang === 'vi' ? '.' : ',';
  const decSep = lang === 'vi' ? ',' : '.';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${grouped}${decPart ? decSep + decPart : ''} ₫`;
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value.trim());
}
