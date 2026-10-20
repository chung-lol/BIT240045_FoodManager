import { create } from 'zustand';
import type { TranslationKey, TranslationParams } from '@/i18n';

interface ToastState {
  message: { key: TranslationKey; params?: TranslationParams; tone: 'success' | 'error' } | null;
  show: (key: TranslationKey, tone?: 'success' | 'error', params?: TranslationParams) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (key, tone = 'success', params) => {
    if (timer) clearTimeout(timer);
    set({ message: { key, params, tone } });
    timer = setTimeout(() => set({ message: null }), 2600);
  },
  hide: () => set({ message: null }),
}));

export const toast = (key: TranslationKey, tone?: 'success' | 'error', params?: TranslationParams) =>
  useToastStore.getState().show(key, tone, params);
