import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { requestSync } from '@/sync/syncScheduler';
import { useSyncStore } from '@/store/syncStore';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Dải trạng thái nhỏ: Online/Offline · số bản ghi chờ đồng bộ · đang đồng bộ.
 * Là minh chứng trực quan khi quay video (tắt mạng -> "Mất mạng · 1 chờ đồng bộ",
 * bật mạng -> tự chuyển "Đã đồng bộ hết" mà không bấm gì).
 */
export function SyncStatusBar() {
  const t = useT();
  const { configured, isOnline, isSyncing, pendingCount, lastError } = useSyncStore();

  let tone: 'ok' | 'warn' | 'off' = 'ok';
  let text: string;
  if (!configured) {
    tone = 'off';
    text = t('syncNotConfigured');
  } else if (!isOnline) {
    tone = 'off';
    text = `${t('offline')} · ${pendingCount > 0 ? t('pendingCount', { count: pendingCount }) : t('allSynced')}`;
  } else if (isSyncing) {
    text = t('syncing');
  } else if (pendingCount > 0) {
    tone = 'warn';
    text = `${t('online')} · ${t('pendingCount', { count: pendingCount })}`;
  } else {
    text = `${t('online')} · ${t('allSynced')}`;
  }

  const palette = {
    ok: { bg: colors.basilTint, fg: colors.basilDark, icon: 'cloud-done-outline' as const },
    warn: { bg: colors.saffronTint, fg: colors.saffron, icon: 'cloud-upload-outline' as const },
    off: { bg: colors.slateTint, fg: colors.slate, icon: 'cloud-offline-outline' as const },
  }[tone];

  return (
    <Pressable
      onPress={() => void requestSync('manual')}
      disabled={!configured || !isOnline || isSyncing}
      style={[styles.bar, { backgroundColor: palette.bg }]}
      accessibilityRole="button"
      accessibilityLabel={text}
    >
      {isSyncing ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <Ionicons name={palette.icon} size={16} color={palette.fg} />
      )}
      <Text style={[styles.text, { color: palette.fg }]} numberOfLines={1}>
        {text}
      </Text>
      {lastError && configured && isOnline && !isSyncing ? (
        <View style={styles.errorDot} accessibilityLabel={t('syncFailed', { message: lastError })} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  text: { fontSize: 13, fontWeight: '600', flex: 1 },
  errorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
});
