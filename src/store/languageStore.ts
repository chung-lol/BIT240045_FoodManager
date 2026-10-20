import { create } from 'zustand';
import { getDb } from '@/database/database';
import { SETTING_KEYS } from '@/database/schema';
import { getSetting, setSetting } from '@/repositories/settingRepository';

export type Language = 'en' | 'vi';

interface LanguageState {
  /** Mặc định tiếng Anh theo yêu cầu đề. */
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  loadLanguage: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'en',
  setLanguage: async (lang) => {
    set({ language: lang });
    const db = await getDb();
    await setSetting(db, SETTING_KEYS.language, lang); // nhớ lựa chọn sau khi mở lại app
  },
  loadLanguage: async () => {
    const db = await getDb();
    const saved = await getSetting(db, SETTING_KEYS.language);
    if (saved === 'en' || saved === 'vi') set({ language: saved });
  },
}));
