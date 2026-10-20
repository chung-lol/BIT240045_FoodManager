import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, Field, IconButton, Input } from '@/components/ui';
import { useT } from '@/i18n';
import type { CategoryWithCount } from '@/models';
import { CategoryInUseError, deleteCategory, getCategoriesWithCount, saveCategory } from '@/services/categoryService';
import { type CategoryField, type ErrorMessage, ValidationError } from '@/services/validationService';
import { useDataStore } from '@/store/dataStore';
import { toast } from '@/store/toastStore';
import { colors, radius, space, type } from '@/theme/tokens';

/** MÀN HÌNH 4 — Loại món: thêm/sửa, và minh hoạ ràng buộc "không xoá loại đang có món". */
export default function CategoriesScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const version = useDataStore((s) => s.version);
  const [items, setItems] = useState<CategoryWithCount[]>([]);
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<CategoryField, ErrorMessage>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategoriesWithCount().then(setItems);
  }, [version]);

  const onDelete = (cat: CategoryWithCount) => {
    Alert.alert(t('deleteCategory'), t('deleteCategoryConfirm', { name: cat.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCategory(cat.id);
            toast('categoryDeleted');
          } catch (e) {
            if (e instanceof CategoryInUseError) {
              Alert.alert(t('deleteCategory'), t('categoryInUse', { name: e.categoryName, count: e.dishCount }));
            } else {
              toast('genericError', 'error', { message: e instanceof Error ? e.message : String(e) });
            }
          }
        },
      },
    ]);
  };

  const onSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await saveCategory({ name: editing.name, description: editing.description }, editing.id);
      toast('categorySaved');
      setEditing(null);
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields as Partial<Record<CategoryField, ErrorMessage>>);
      else toast('genericError', 'error', { message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const open = (cat?: CategoryWithCount) => {
    setErrors({});
    setEditing(cat ? { id: cat.id, name: cat.name, description: cat.description } : { name: '', description: '' });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t('categories'),
          headerRight: () => <IconButton icon="add-circle-outline" label={t('addCategory')} onPress={() => open()} />,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={<EmptyState icon="pricetags-outline" message={t('noCategories')} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => open(item)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={type.heading}>{item.name}</Text>
                {item.syncStatus === 'pending' ? (
                  <Ionicons name="cloud-upload-outline" size={15} color={colors.saffron} />
                ) : null}
              </View>
              {item.description ? <Text style={type.small}>{item.description}</Text> : null}
              <Text style={[type.small, { color: colors.basilDark }]}>{t('dishCount', { count: item.dishCount })}</Text>
            </Pressable>
            <IconButton icon="create-outline" label={t('editCategory')} onPress={() => open(item)} />
            <IconButton icon="trash-outline" label={t('deleteCategory')} color={colors.danger} onPress={() => onDelete(item)} />
          </View>
        )}
      />

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <Text style={type.heading}>{editing?.id ? t('editCategory') : t('addCategory')}</Text>
            <Field label={t('name')} error={errors.name ? t(errors.name.key, errors.name.params) : null}>
              <Input
                value={editing?.name ?? ''}
                onChangeText={(v) => {
                  setEditing((e) => (e ? { ...e, name: v } : e));
                  setErrors((er) => ({ ...er, name: undefined }));
                }}
                placeholder={t('categoryNamePlaceholder')}
                invalid={!!errors.name}
                autoFocus
              />
            </Field>
            <Field
              label={t('description')}
              error={errors.description ? t(errors.description.key, errors.description.params) : null}
            >
              <Input
                value={editing?.description ?? ''}
                onChangeText={(v) => setEditing((e) => (e ? { ...e, description: v } : e))}
                multiline
              />
            </Field>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button title={t('cancel')} variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
              <Button title={t('save')} onPress={onSave} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,30,25,0.35)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.lg,
  },
});
