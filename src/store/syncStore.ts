import { create } from 'zustand';

export interface SyncState {
  configured: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
  set: (patch: Partial<Omit<SyncState, 'set'>>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  configured: false,
  isOnline: false,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  set: (patch) => set(patch),
}));
