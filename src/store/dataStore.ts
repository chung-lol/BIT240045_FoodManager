import { create } from 'zustand';

/**
 * "Phiên bản dữ liệu": tăng mỗi khi SQLite thay đổi (người dùng lưu, hoặc
 * Sync Engine kéo dữ liệu mới về). Màn hình theo dõi số này để tự tải lại.
 */
interface DataState {
  version: number;
  bump: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

export const notifyDataChanged = () => useDataStore.getState().bump();
