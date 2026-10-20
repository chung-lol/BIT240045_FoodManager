import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { type ImageStyle, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useT } from '@/i18n';
import { colors } from '@/theme/tokens';

/**
 * Ảnh có cache đĩa (expo-image, cachePolicy 'memory-disk'): ảnh đã xem khi online
 * vẫn hiển thị khi offline. URL lỗi / chưa cache => khung dự phòng, không vỡ layout.
 */
export function SmartImage({
  uri,
  style,
  compact,
}: {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  compact?: boolean;
}) {
  const t = useT();
  // Ghi nhớ URL nào đã lỗi (thay vì cờ boolean + useEffect reset): đổi URL thì tự thử tải lại.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = !!uri && failedUri === uri;

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, style as StyleProp<ViewStyle>]}>
        <Ionicons name={uri ? 'image-outline' : 'restaurant-outline'} size={compact ? 22 : 34} color={colors.muted} />
        {!compact && uri ? <Text style={styles.fallbackText}>{t('imageLoadFailed')}</Text> : null}
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={uri}
      onError={() => setFailedUri(uri)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EDEA', gap: 4 },
  fallbackText: { fontSize: 12, color: colors.muted },
});
