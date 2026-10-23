import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfigWarning } from '@/components/ConfigWarning';
import { DishCard } from '@/components/DishCard';
import { DishFilters } from '@/components/DishFilters';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { Button, EmptyState, IconButton, Input } from '@/components/ui';
import { useT } from '@/i18n';
import type { DishCategory, DishListItem } from '@/models';
import { getCategories } from '@/services/categoryService';
import { applyDishFilters, countActiveFilters } from '@/services/dishQuery';
import { getAllDishes } from '@/services/dishService';
import { useDataStore } from '@/store/dataStore';
import { useFilterStore } from '@/store/filterStore';
import { toast } from '@/store/toastStore';
import { colors, radius, space, type } from '@/theme/tokens';

/**
 * MÀN HÌNH 1 — Danh sách món ăn.
 * Đọc từ SQLite (hoạt động cả khi offline) -> lọc/sắp xếp bằng hàm thuần applyDishFilters
 * -> hiển thị. Bộ lọc nằm trong filterStore nên được giữ khi mở Chi tiết/Sửa rồi quay lại.
 */
export default function DishListScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const columns = isDesktop ? 2 : 1;
  const version = useDataStore((s) => s.version);
  const filters = useFilterStore((s) => s.filters);
  const setFilter = useFilterStore((s) => s.setFilter);
  const panelOpen = useFilterStore((s) => s.panelOpen);
  const setPanelOpen = useFilterStore((s) => s.setPanelOpen);

  const [dishes, setDishes] = useState<DishListItem[]>([]);
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Tải lại mỗi khi dữ liệu SQLite thay đổi (người dùng lưu hoặc Sync kéo dữ liệu mới về)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [d, c] = await Promise.all([getAllDishes(), getCategories()]);
        if (!active) return;
        setDishes(d);
        setCategories(c);
        // Danh mục đang lọc vừa bị xoá => bỏ điều kiện đó thay vì trả về danh sách rỗng khó hiểu
        const current = useFilterStore.getState().filters.categoryId;
        if (current && !c.some((x) => x.id === current)) setFilter('categoryId', null);
      } catch (e) {
        toast('genericError', 'error', { message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [version, setFilter]);

  const { items, priceError } = useMemo(() => applyDishFilters(dishes, filters), [dishes, filters]);
  const activeCount = countActiveFilters(filters);

  const header = (
    <View style={styles.header}>
      {isDesktop ? (
        <View style={styles.desktopTitleRow}>
          <View style={styles.desktopTitleCopy}>
            <Text style={styles.desktopTitle}>{t('dishes')}</Text>
            <Text style={type.small}>{t('resultsCount', { count: items.length, total: dishes.length })}</Text>
          </View>
          <Button title={t('addDish')} icon="add" onPress={() => router.push('/dish/new')} />
        </View>
      ) : null}
      <ConfigWarning />
      <SyncStatusBar />
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
          <Input
            style={styles.searchInput}
            value={filters.search}
            onChangeText={(v) => setFilter('search', v)}
            placeholder={t('searchPlaceholder')}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('searchPlaceholder')}
          />
          {filters.search ? (
            <Pressable onPress={() => setFilter('search', '')} hitSlop={10} style={styles.clearIcon}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setPanelOpen(!panelOpen)}
          style={[styles.filterButton, (panelOpen || activeCount > 0) && styles.filterButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={t('filters')}
        >
          <Ionicons name="options-outline" size={20} color={panelOpen || activeCount > 0 ? '#FFFFFF' : colors.basilDark} />
          {activeCount > 0 ? <Text style={styles.filterCount}>{activeCount}</Text> : null}
        </Pressable>
      </View>
      {panelOpen ? <DishFilters categories={categories} priceError={priceError} /> : null}
      {!panelOpen && priceError ? <Text style={styles.inlineError}>{t(priceError.key, priceError.params)}</Text> : null}
      {!isDesktop ? <Text style={type.small}>{t('resultsCount', { count: items.length, total: dishes.length })}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: t('appTitle'),
          headerRight: () => (
            <View style={styles.headerActions}>
              {isDesktop ? (
                <>
                  <Button
                    title={t('categories')}
                    icon="pricetags-outline"
                    variant="ghost"
                    style={styles.desktopNavButton}
                    onPress={() => router.push('/categories')}
                  />
                  <Button
                    title={t('settings')}
                    icon="settings-outline"
                    variant="ghost"
                    style={styles.desktopNavButton}
                    onPress={() => router.push('/settings')}
                  />
                </>
              ) : (
                <>
                  <IconButton icon="pricetags-outline" label={t('categories')} onPress={() => router.push('/categories')} />
                  <IconButton icon="settings-outline" label={t('settings')} onPress={() => router.push('/settings')} />
                </>
              )}
            </View>
          ),
        }}
      />
      <FlatList
        key={`dish-grid-${columns}`}
        data={items}
        numColumns={columns}
        columnWrapperStyle={isDesktop ? styles.gridRow : undefined}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <View style={[styles.cardCell, isDesktop && styles.cardCellDesktop]}>
            <DishCard dish={item} onPress={() => router.push(`/dish/${item.id}`)} />
          </View>
        )}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          loading ? undefined : (
            <EmptyState
              icon={dishes.length === 0 ? 'restaurant-outline' : 'funnel-outline'}
              message={dishes.length === 0 ? t('noDishes') : t('noResults')}
              action={
                dishes.length > 0 ? (
                  <Button title={t('resetFilters')} variant="secondary" onPress={useFilterStore.getState().reset} />
                ) : undefined
              }
            />
          )
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
      />
      {!isDesktop ? (
        <Pressable
          onPress={() => router.push('/dish/new')}
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t('addDish')}
          testID="add-dish"
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.fabText}>{t('addDish')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  header: { gap: space.md, marginBottom: space.lg },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  desktopNavButton: { minHeight: 36, paddingHorizontal: space.md },
  desktopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingBottom: space.xs,
  },
  desktopTitleCopy: { gap: space.xs },
  desktopTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  gridRow: { gap: space.md },
  cardCell: { marginBottom: space.md },
  cardCellDesktop: { flex: 1, minWidth: 0 },
  searchRow: { flexDirection: 'row', gap: space.sm },
  searchBox: { flex: 1, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  searchInput: { paddingLeft: 38, paddingRight: 36 },
  clearIcon: { position: 'absolute', right: 12 },
  filterButton: {
    width: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: { backgroundColor: colors.basil, borderColor: colors.basil },
  filterCount: { position: 'absolute', top: 4, right: 6, color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  inlineError: { color: colors.danger, fontSize: 13 },
  fab: {
    position: 'absolute',
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.basil,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    borderRadius: radius.pill,
    elevation: 4,
    shadowColor: '#1E4A36',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
