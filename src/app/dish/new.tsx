import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { DishForm } from '@/components/DishForm';
import { useT } from '@/i18n';
import type { DishCategory } from '@/models';
import { getCategories } from '@/services/categoryService';
import { createDish } from '@/services/dishService';
import { useFilterStore } from '@/store/filterStore';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/tokens';

/** MÀN HÌNH 3a — Thêm món (dùng chung DishForm với màn Sửa). */
export default function NewDishScreen() {
  const t = useT();
  const [categories, setCategories] = useState<DishCategory[] | null>(null);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  if (!categories) return <ActivityIndicator style={{ marginTop: 48 }} color={colors.basil} />;

  // Gợi ý sẵn danh mục đang lọc (nếu có) cho thao tác nhanh
  const preset = useFilterStore.getState().filters.categoryId ?? '';

  return (
    <>
      <Stack.Screen options={{ title: t('addDish') }} />
      <DishForm
        categories={categories}
        submitLabel={t('saveDish')}
        initial={{
          name: '',
          description: '',
          price: '',
          preparationTime: '',
          isAvailable: true,
          dishCategoryId: categories.some((c) => c.id === preset) ? preset : '',
          images: [],
        }}
        onSubmit={async (input) => {
          await createDish(input);
          toast('dishCreated');
          router.back();
        }}
      />
    </>
  );
}
