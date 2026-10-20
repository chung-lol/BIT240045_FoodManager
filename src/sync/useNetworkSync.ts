import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SYNC_CONFIG } from '@/config/appConfig';
import { useSyncStore } from '@/store/syncStore';
import { refreshSyncStatus, requestSync } from './syncScheduler';

/** Có Internet thực sự: đã kết nối VÀ không bị xác định là "không ra được Internet". */
function isOnline(state: NetInfoState): boolean {
  return !!state.isConnected && state.isInternetReachable !== false;
}

/**
 * Gắn ở layout gốc. Các thời điểm tự kích hoạt đồng bộ (người dùng KHÔNG cần bấm nút):
 *  1. Mở app.
 *  2. Mạng chuyển từ mất -> có (NetInfo).
 *  3. App quay lại foreground.
 *  4. Định kỳ 15s nếu vẫn còn bản ghi Pending (retry có backoff).
 *  5. Ngay sau mỗi thay đổi local (scheduleSync trong service).
 */
export function useNetworkSync() {
  useEffect(() => {
    let wasOnline: boolean | null = null;

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = isOnline(state);
      useSyncStore.getState().set({ isOnline: online });
      if (online && wasOnline !== true) void requestSync(wasOnline === null ? 'startup' : 'reconnect');
      wasOnline = online;
    });

    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void requestSync('foreground');
    });

    const timer = setInterval(async () => {
      const pending = await refreshSyncStatus();
      if (pending > 0) void requestSync('retry');
    }, SYNC_CONFIG.retryTickMs);

    void refreshSyncStatus();

    return () => {
      unsubscribeNet();
      appStateSub.remove();
      clearInterval(timer);
    };
  }, []);
}
