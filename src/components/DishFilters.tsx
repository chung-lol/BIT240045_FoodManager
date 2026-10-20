import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import type { DishCategory } from '@/models';
import type { ErrorMessage } from '@/services/validationService';
import { type SortOption, type StatusFilter, useFilterStore } from '@/store/filterStore';
import { colors, radius, space, type } from '@/theme/tokens';
import { Button, Chip, Input } from './ui';

const STATUS_OPTIONS: { value: StatusFilter; key: 'all' | 'available' | 'unavailable' }[] = [
  { value: 'all', key: 'all' },
  { value: 'available', key: 'available' },
  { value: 'unavailable', key: 'unavailable' },
];

const SORT_OPTIONS: { value: SortOption; key: 'sortNameAsc' | 'sortPriceAsc' | 'sortPriceDesc' | 'sortTimeAsc' }[] = [
  { value: 'nameAsc', key: 'sortNameAsc' },
  { value: 'priceAsc', key: 'sortPriceAsc' },
  { value: 'priceDesc', key: 'sortPriceDesc' },
  { value: 'timeAsc', key: 'sortTimeAsc' },
];

/** Panel lọc: mọi giá trị đọc/ghi trực tiếp vào filterStore (được giữ khi điều hướng). */
export function DishFilters({ categories, priceError }: { categories: DishCategory[]; priceError: ErrorMessage | null }) {
  const t = useT();
  const filters = useFilterStore((s) => s.filters);
  const setFilter = useFilterStore((s) => s.setFilter);
  const reset = useFilterStore((s) => s.reset);

  return (
    <View style={styles.panel}>
      <Text style={type.label}>{t('categoryFilter')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip label={t('all')} selected={filters.categoryId === null} onPress={() => setFilter('categoryId', null)} />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={filters.categoryId === c.id}
            onPress={() => setFilter('categoryId', c.id)}
          />
        ))}
      </ScrollView>

      <Text style={type.label}>{t('statusFilter')}</Text>
      <View style={styles.wrap}>
        {STATUS_OPTIONS.map((o) => (
          <Chip key={o.value} label={t(o.key)} selected={filters.status === o.value} onPress={() => setFilter('status', o.value)} />
        ))}
      </View>

      <Text style={type.label}>{t('priceRange')}</Text>
      <View style={styles.priceRow}>
        <Input
          style={styles.priceInput}
          value={filters.minPrice}
          onChangeText={(v) => setFilter('minPrice', v)}
          placeholder={t('minPrice')}
          keyboardType="numeric"
          invalid={!!priceError}
          accessibilityLabel={t('minPrice')}
        />
        <Text style={type.small}>–</Text>
        <Input
          style={styles.priceInput}
          value={filters.maxPrice}
          onChangeText={(v) => setFilter('maxPrice', v)}
          placeholder={t('maxPrice')}
          keyboardType="numeric"
          invalid={!!priceError}
          accessibilityLabel={t('maxPrice')}
        />
      </View>
      {priceError ? <Text style={styles.error}>{t(priceError.key, priceError.params)}</Text> : null}

      <Text style={type.label}>{t('sortBy')}</Text>
      <View style={styles.wrap}>
        {SORT_OPTIONS.map((o) => (
          <Chip key={o.value} label={t(o.key)} selected={filters.sort === o.value} onPress={() => setFilter('sort', o.value)} />
        ))}
      </View>

      <Button title={t('resetFilters')} icon="refresh" variant="secondary" onPress={reset} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  row: { gap: space.sm, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  priceInput: { flex: 1 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '500' },
});
