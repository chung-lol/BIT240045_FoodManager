import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import type { DishCategory } from '@/models';
import { colors, radius, space, type } from '@/theme/tokens';

/** Dropdown chọn loại món — dữ liệu lấy từ SQLite, không cho nhập tự do. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  invalid,
}: {
  categories: DishCategory[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, invalid && styles.invalid]}
        accessibilityRole="button"
        accessibilityLabel={t('selectCategory')}
      >
        <Text style={[type.body, !selected && { color: '#98A39C' }]}>{selected ? selected.name : t('selectCategory')}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <Text style={[type.heading, styles.sheetTitle]}>{t('selectCategory')}</Text>
            <FlatList
              data={categories}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Text style={[type.body, item.id === value && { fontWeight: '700', color: colors.basilDark }]}>
                    {item.name}
                  </Text>
                  {item.id === value ? <Ionicons name="checkmark" size={20} color={colors.basil} /> : null}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invalid: { borderColor: colors.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,25,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '60%',
    paddingBottom: space.md,
  },
  sheetTitle: { padding: space.lg },
  option: {
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: space.lg },
});
