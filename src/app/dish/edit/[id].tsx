import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { DishForm } from '@/components/DishForm';
import { NotFound } from '@/components/NotFound';
import { useT } from '@/i18n';
import type { DishCategory, DishDetail } from '@/models';
import { getCategories } from '@/services/categoryService';
import { getDish, updateDish } from '@/services/dishService';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/tokens';

/** MÀN HÌNH 3b — Sửa món: nạp dữ liệu hiện có vào DishForm. */
export default function EditDishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const [data, setData] = useState<{ dish: DishDetail | null; categories: DishCategory[] } | null>(null);

  useEffect(() => {
    Promise.all([getDish(String(id)), getCategories()]).then(([dish, categories]) => setData({ dish, categories }));
  }, [id]);

  if (!data) return <ActivityIndicator style={{ marginTop: 48 }} color={colors.basil} />;
  if (!data.dish) {
    return (
      <>
        <Stack.Screen options={{ title: t('editDish') }} />
        <NotFound />
      </>
    );
  }
  const dish = data.dish;

  return (
    <>
      <Stack.Screen options={{ title: t('editDish') }} />
      <DishForm
        categories={data.categories}
        submitLabel={t('save')}
        initial={{
          name: dish.name,
          description: dish.description,
          price: String(dish.price),
          preparationTime: String(dish.preparationTime),
          isAvailable: dish.isAvailable,
          dishCategoryId: dish.dishCategoryId,
          images: dish.images.map((i) => ({ id: i.id, imageUrl: i.imageUrl, isThumbnail: i.isThumbnail })),
        }}
        onSubmit={async (input) => {
          await updateDish(dish.id, input);
          toast('dishUpdated');
          router.back(); // quay về Chi tiết; Danh sách phía dưới vẫn giữ nguyên bộ lọc
        }}
      />
    </>
  );
}
