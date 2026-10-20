import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NotFound } from '@/components/NotFound';
import { SmartImage } from '@/components/SmartImage';
import { Badge, Button, Section } from '@/components/ui';
import { useT } from '@/i18n';
import type { DishDetail } from '@/models';
import { speedLabel } from '@/services/dishQuery';
import { changeThumbnail, deleteDish, getDish } from '@/services/dishService';
import { useDataStore } from '@/store/dataStore';
import { useLanguageStore } from '@/store/languageStore';
import { toast } from '@/store/toastStore';
import { colors, radius, space, type } from '@/theme/tokens';
import { formatMoney } from '@/utils/text';

/** MÀN HÌNH 2 — Chi tiết món: nhiều ảnh, đổi thumbnail, Quick/Regular, Sửa/Xoá. */
export default function DishDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const lang = useLanguageStore((s) => s.language);
  const version = useDataStore((s) => s.version);
  const [dish, setDish] = useState<DishDetail | null | undefined>(undefined); // undefined = đang tải
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let active = true;
    getDish(String(id))
      .then((d) => active && setDish(d))
      .catch(() => active && setDish(null));
    return () => {
      active = false;
    };
  }, [id, version]);

  if (dish === undefined) {
    return <ActivityIndicator style={{ marginTop: 48 }} color={colors.basil} />;
  }
  if (dish === null) {
    return (
      <>
        <Stack.Screen options={{ title: t('dishDetail') }} />
        <NotFound />
      </>
    );
  }

  const images = dish.images;
  const shown = images[Math.min(selectedIndex, Math.max(images.length - 1, 0))];
  const speed = speedLabel(dish.preparationTime);

  const confirmDelete = () => {
    // Hộp thoại xác nhận: Huỷ => không làm gì; Xoá => xoá rồi quay lại danh sách
    Alert.alert(t('deleteDish'), t('deleteDishConfirm', { name: dish.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDish(dish.id);
            toast('dishDeleted');
            router.back();
          } catch (e) {
            toast('genericError', 'error', { message: e instanceof Error ? e.message : String(e) });
          }
        },
      },
    ]);
  };

  const makeThumbnail = async (imageId: string) => {
    try {
      await changeThumbnail(dish.id, imageId);
      toast('thumbnailChanged');
    } catch (e) {
      toast('genericError', 'error', { message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: t('dishDetail') }} />

      <SmartImage uri={shown?.imageUrl} style={styles.hero} />
      {images.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {images.map((img, i) => (
            <Pressable
              key={img.id}
              onPress={() => setSelectedIndex(i)}
              style={[styles.stripItem, i === selectedIndex && styles.stripItemActive]}
              accessibilityRole="imagebutton"
            >
              <SmartImage uri={img.imageUrl} style={styles.stripImage} compact />
              {img.isThumbnail ? (
                <View style={styles.star}>
                  <Ionicons name="star" size={12} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={type.small}>{t('noImages')}</Text>
      )}
      {shown && !shown.isThumbnail ? (
        <Button title={t('setAsThumbnail')} icon="star-outline" variant="secondary" onPress={() => makeThumbnail(shown.id)} />
      ) : shown ? (
        <Text style={[type.small, { textAlign: 'center' }]}>★ {t('thumbnail')}</Text>
      ) : null}

      <View style={styles.titleBlock}>
        <Text style={type.title}>{dish.name}</Text>
        <Text style={type.small}>{dish.categoryName}</Text>
        <View style={styles.badges}>
          <Badge label={dish.isAvailable ? t('available') : t('unavailable')} tone={dish.isAvailable ? 'green' : 'red'} />
          <Badge label={t(speed)} tone={speed === 'quick' ? 'saffron' : 'slate'} />
          <Badge
            label={dish.syncStatus === 'synced' ? t('syncedLabel') : t('pendingLabel')}
            tone={dish.syncStatus === 'synced' ? 'sky' : 'saffron'}
          />
        </View>
      </View>

      <Section title={t('dishDetail')}>
        <InfoRow label={t('price')} value={formatMoney(dish.price, lang)} strong />
        <InfoRow label={t('preparationTime')} value={t('minutesShort', { count: dish.preparationTime })} />
        <InfoRow label={t('category')} value={dish.categoryName} />
        <InfoRow label={t('status')} value={dish.isAvailable ? t('available') : t('unavailable')} />
        <InfoRow label={t('images')} value={t('imageCount', { count: images.length })} />
        {dish.description ? (
          <View style={{ gap: 4 }}>
            <Text style={type.label}>{t('description')}</Text>
            <Text style={type.body}>{dish.description}</Text>
          </View>
        ) : null}
      </Section>

      <View style={styles.actions}>
        <Button title={t('edit')} icon="create-outline" onPress={() => router.push(`/dish/edit/${dish.id}`)} style={{ flex: 1 }} />
        <Button title={t('delete')} icon="trash-outline" variant="danger" onPress={confirmDelete} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={type.small}>{label}</Text>
      <Text style={strong ? type.price : type.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, paddingBottom: 48 },
  hero: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: 'hidden' },
  strip: { gap: space.sm },
  stripItem: { borderRadius: radius.sm, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  stripItemActive: { borderColor: colors.basil },
  stripImage: { width: 64, height: 64 },
  star: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: colors.saffron,
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { gap: 4, marginTop: space.sm },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  actions: { flexDirection: 'row', gap: space.md },
});
