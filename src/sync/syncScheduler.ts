import { isMockApiConfigured, SYNC_CONFIG } from '@/config/appConfig';
import { getDb } from '@/database/database';
import { SETTING_KEYS } from '@/database/schema';
import { Image } from 'expo-image';
import { countPending, listAllImageUrls } from '@/repositories/dishRepository';
import { getSetting } from '@/repositories/settingRepository';
import { notifyDataChanged } from '@/store/dataStore';
import { useSyncStore } from '@/store/syncStore';
import { runSyncOnce } from './syncEngine';

/**
 * Bộ điều phối đồng bộ:
 *  - SINGLE-FLIGHT: tối đa 1 lượt sync chạy cùng lúc. Có yêu cầu mới trong lúc đang chạy
 *    => chỉ bật cờ rerun, chạy thêm đúng 1 lượt sau khi lượt hiện tại xong.
 *    (Nhiều lượt song song là nguyên nhân kinh điển gây POST trùng.)
 *  - DEBOUNCE: người dùng lưu liên tục => gom lại, sync 1 lần.
 *  - BACKOFF: lỗi liên tiếp => giãn thời gian thử lại 5s, 10s, 20s... tối đa 2 phút.
 */

export type SyncReason = 'startup' | 'reconnect' | 'foreground' | 'local-change' | 'retry' | 'manual';

let running: Promise<void> | null = null;
let rerunRequested = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let failureCount = 0;
let nextAllowedAt = 0;

export async function refreshSyncStatus(): Promise<number> {
  const db = await getDb();
  const pending = await countPending(db);
  const last = await getSetting(db, SETTING_KEYS.lastSyncAt);
  useSyncStore.getState().set({
    pendingCount: pending,
    lastSyncAt: last ? Number(last) : null,
    configured: isMockApiConfigured(),
  });
  return pending;
}

/** Hẹn đồng bộ sau một khoảng ngắn (gom nhiều thay đổi liên tiếp). */
export function scheduleSync(reason: SyncReason, delayMs: number = SYNC_CONFIG.debounceMs) {
  void refreshSyncStatus(); // badge "N chờ đồng bộ" cập nhật ngay, kể cả khi offline
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void requestSync(reason);
  }, delayMs);
}

export function requestSync(reason: SyncReason): Promise<void> {
  const store = useSyncStore.getState();
  if (!isMockApiConfigured() || !store.isOnline) {
    void refreshSyncStatus();
    return Promise.resolve();
  }
  const force = reason === 'manual' || reason === 'reconnect';
  if (!force && Date.now() < nextAllowedAt) return Promise.resolve();

  if (running) {
    rerunRequested = true;
    return running;
  }

  running = (async () => {
    do {
      rerunRequested = false;
      useSyncStore.getState().set({ isSyncing: true });
      try {
        const report = await runSyncOnce();
        failureCount = 0;
        nextAllowedAt = 0;
        useSyncStore.getState().set({
          lastError: report.errors.length > 0 ? report.errors[0] : null,
        });
        if (__DEV__) console.log(`[sync:${reason}]`, JSON.stringify(report));
        void prefetchImages();
      } catch (e) {
        failureCount += 1;
        const delay = Math.min(SYNC_CONFIG.backoffBaseMs * 2 ** (failureCount - 1), SYNC_CONFIG.backoffMaxMs);
        nextAllowedAt = Date.now() + delay;
        rerunRequested = false;
        useSyncStore.getState().set({ lastError: e instanceof Error ? e.message : String(e) });
        if (__DEV__) console.warn(`[sync:${reason}] failed, retry in ${delay}ms`, e);
      } finally {
        useSyncStore.getState().set({ isSyncing: false });
        await refreshSyncStatus();
        notifyDataChanged(); // badge Pending/Synced + dữ liệu kéo về từ server
      }
    } while (rerunRequested && useSyncStore.getState().isOnline);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Tải trước ảnh vào cache đĩa khi đang có mạng => xem lại được khi offline. */
async function prefetchImages() {
  try {
    const urls = await listAllImageUrls(await getDb());
    if (urls.length > 0) await Image.prefetch(urls, 'disk');
  } catch {
    // Không quan trọng: ảnh vẫn tải bình thường khi hiển thị.
  }
}
