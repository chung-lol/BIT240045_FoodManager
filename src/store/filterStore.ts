import { create } from 'zustand';

export type StatusFilter = 'all' | 'available' | 'unavailable';
export type SortOption = 'nameAsc' | 'priceAsc' | 'priceDesc' | 'timeAsc';

export interface DishFilters {
  search: string;
  categoryId: string | null; // null = tất cả
  status: StatusFilter;
  minPrice: string; // giữ dạng chuỗi để không "nuốt" ký tự người dùng đang gõ
  maxPrice: string;
  sort: SortOption;
}

export const DEFAULT_FILTERS: DishFilters = {
  search: '',
  categoryId: null,
  status: 'all',
  minPrice: '',
  maxPrice: '',
  sort: 'nameAsc',
};

interface FilterState {
  filters: DishFilters;
  panelOpen: boolean;
  setFilter: <K extends keyof DishFilters>(key: K, value: DishFilters[K]) => void;
  reset: () => void;
  setPanelOpen: (open: boolean) => void;
}

/**
 * Bộ lọc nằm trong store toàn cục (không nằm trong state của màn hình),
 * nên đi sang Chi tiết / Sửa rồi quay lại, mọi điều kiện vẫn được giữ nguyên.
 */
export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  panelOpen: false,
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  reset: () => set({ filters: DEFAULT_FILTERS }),
  setPanelOpen: (open) => set({ panelOpen: open }),
}));
