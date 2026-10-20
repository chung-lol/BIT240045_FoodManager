import { en, type TranslationKey } from './en';
import { vi } from './vi';
import { useLanguageStore, type Language } from '@/store/languageStore';

export type { TranslationKey };
export type TranslationParams = Record<string, string | number>;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, vi };

export function translate(lang: Language, key: TranslationKey, params?: TranslationParams): string {
  const template = dictionaries[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

/**
 * Hook dịch dùng trong component. Đổi ngôn ngữ => mọi màn hình đang mở re-render ngay.
 * Lỗi validation được lưu dưới dạng KEY (không phải chuỗi đã dịch),
 * nên thông báo lỗi đang hiển thị cũng đổi ngôn ngữ theo.
 */
export function useT() {
  const lang = useLanguageStore((s) => s.language);
  return (key: TranslationKey, params?: TranslationParams) => translate(lang, key, params);
}
