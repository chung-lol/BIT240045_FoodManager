import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import type { DishListItem } from '@/models';
import { speedLabel } from '@/services/dishQuery';
import { useLanguageStore } from '@/store/languageStore';
import { colors, radius, space, type } from '@/theme/tokens';
import { formatMoney } from '@/utils/text';
import { SmartImage } from './SmartImage';
import { Badge } from './ui';

function DishCardBase({ dish, onPress }: { dish: DishListItem; onPress: () => void }) {
  const t = useT();
  const lang = useLanguageStore((s) => s.language);
  const speed = speedLabel(dish.preparationTime);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={dish.name}
    >
      <SmartImage uri={dish.thumbnailUrl} style={styles.thumb} compact />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[type.heading, styles.name]} numberOfLines={1}>
            {dish.name}
          </Text>
          {dish.syncStatus === 'pending' ? (
            <Ionicons name="cloud-upload-outline" size={16} color={colors.saffron} accessibilityLabel={t('pendingLabel')} />
          ) : null}
        </View>
        <Text style={type.small} numberOfLines={1}>
          {dish.categoryName}
        </Text>
        <View style={styles.metaRow}>
          <Text style={type.price}>{formatMoney(dish.price, lang)}</Text>
          <Text style={type.small}>{t('minutesShort', { count: dish.preparationTime })}</Text>
        </View>
        <View style={styles.badges}>
          <Badge label={dish.isAvailable ? t('available') : t('unavailable')} tone={dish.isAvailable ? 'green' : 'red'} />
          <Badge label={t(speed)} tone={speed === 'quick' ? 'saffron' : 'slate'} />
        </View>
      </View>
    </Pressable>
  );
}

export const DishCard = memo(DishCardBase);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    minHeight: 122,
    shadowColor: '#173D2B',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardPressed: { opacity: 0.86, transform: [{ scale: 0.995 }] },
  thumb: { width: 104, height: 104, borderRadius: radius.md, overflow: 'hidden' },
  body: { flex: 1, gap: 3, paddingVertical: 2, paddingRight: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
});
