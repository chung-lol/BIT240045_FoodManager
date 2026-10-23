import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BUSINESS_RULES } from '@/config/appConfig';
import { useT } from '@/i18n';
import type { DishCategory, DishFormInput } from '@/models';
import { type DishField, type ErrorMessage, ValidationError } from '@/services/validationService';
import { toast } from '@/store/toastStore';
import { colors, radius, space, type } from '@/theme/tokens';
import { isHttpUrl } from '@/utils/text';
import { CategoryPicker } from './CategoryPicker';
import { SmartImage } from './SmartImage';
import { Button, Field, Input } from './ui';

type Errors = Partial<Record<DishField, ErrorMessage>>;

/**
 * Form DÙNG CHUNG cho Thêm và Sửa: chỉ khác dữ liệu khởi tạo và hàm onSubmit.
 * Lỗi lưu dạng key => đổi ngôn ngữ thì thông báo lỗi đổi theo.
 */
export function DishForm({
  initial,
  categories,
  submitLabel,
  onSubmit,
}: {
  initial: DishFormInput;
  categories: DishCategory[];
  submitLabel: string;
  onSubmit: (input: DishFormInput) => Promise<void>;
}) {
  const t = useT();
  const [form, setForm] = useState<DishFormInput>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState<ErrorMessage | null>(null);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof DishFormInput>(key: K, value: DishFormInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const msg = (e?: ErrorMessage | null) => (e ? t(e.key, e.params) : null);

  // ---------------- Quản lý nhiều ảnh ----------------
  const addImage = () => {
    const url = newUrl.trim();
    if (!isHttpUrl(url)) return setUrlError({ key: 'imageUrlInvalid' });
    if (form.images.some((i) => i.imageUrl.toLowerCase() === url.toLowerCase()))
      return setUrlError({ key: 'imageUrlDuplicate' });
    if (form.images.length >= BUSINESS_RULES.maxImagesPerDish)
      return setUrlError({ key: 'tooManyImages', params: { max: BUSINESS_RULES.maxImagesPerDish } });
    // Ảnh đầu tiên tự động làm thumbnail
    update('images', [...form.images, { imageUrl: url, isThumbnail: form.images.length === 0 }]);
    setNewUrl('');
    setUrlError(null);
  };

  const removeImage = (index: number) => {
    const next = form.images.filter((_, i) => i !== index);
    // Xoá đúng ảnh đại diện => ảnh còn lại đầu tiên lên thay, không để món "mất" thumbnail
    if (form.images[index]?.isThumbnail && next.length > 0) next[0] = { ...next[0], isThumbnail: true };
    update('images', next);
  };

  const chooseThumbnail = (index: number) =>
    update(
      'images',
      form.images.map((img, i) => ({ ...img, isThumbnail: i === index })), // bỏ cờ ảnh cũ + bật ảnh mới
    );

  // ---------------- Lưu ----------------
  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (e) {
      if (e instanceof ValidationError) {
        setErrors(e.fields as Errors);
        toast('fixErrors', 'error');
      } else {
        toast('genericError', 'error', { message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Field label={t('name')} error={msg(errors.name)}>
          <Input
            value={form.name}
            onChangeText={(v) => update('name', v)}
            placeholder={t('namePlaceholder')}
            invalid={!!errors.name}
            maxLength={BUSINESS_RULES.nameMaxLength + 20}
            accessibilityLabel={t('name')}
          />
        </Field>

        <Field label={t('category')} error={msg(errors.dishCategoryId)}>
          <CategoryPicker
            categories={categories}
            value={form.dishCategoryId}
            onChange={(id) => update('dishCategoryId', id)}
            invalid={!!errors.dishCategoryId}
          />
        </Field>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label={`${t('price')} (₫)`} error={msg(errors.price)}>
              <Input
                value={form.price}
                onChangeText={(v) => update('price', v)}
                keyboardType="numeric"
                placeholder="45000"
                invalid={!!errors.price}
                accessibilityLabel={t('price')}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t('preparationTime')} (${t('minutesUnit')})`} error={msg(errors.preparationTime)}>
              <Input
                value={form.preparationTime}
                onChangeText={(v) => update('preparationTime', v)}
                keyboardType="number-pad"
                placeholder="15"
                invalid={!!errors.preparationTime}
                accessibilityLabel={t('preparationTime')}
              />
            </Field>
          </View>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>{t('status')}</Text>
            <Text style={type.small}>{form.isAvailable ? t('available') : t('unavailable')}</Text>
          </View>
          <Switch
            value={form.isAvailable}
            onValueChange={(v) => update('isAvailable', v)}
            trackColor={{ true: colors.basil, false: colors.line }}
            thumbColor="#FFFFFF"
            accessibilityLabel={t('status')}
          />
        </View>

        <Field label={t('description')} error={msg(errors.description)}>
          <Input
            value={form.description}
            onChangeText={(v) => update('description', v)}
            placeholder={t('descriptionPlaceholder')}
            multiline
            invalid={!!errors.description}
            accessibilityLabel={t('description')}
          />
        </Field>

        <Field label={`${t('images')} (${form.images.length}/${BUSINESS_RULES.maxImagesPerDish})`} error={msg(errors.images)}>
          {form.images.map((img, index) => (
            <View key={`${img.imageUrl}-${index}`} style={styles.imageRow}>
              <SmartImage uri={img.imageUrl} style={styles.imagePreview} compact />
              <Pressable
                style={styles.thumbChoice}
                onPress={() => chooseThumbnail(index)}
                accessibilityRole="radio"
                accessibilityState={{ checked: img.isThumbnail }}
                accessibilityLabel={t('setAsThumbnail')}
              >
                <Ionicons
                  name={img.isThumbnail ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={img.isThumbnail ? colors.basil : colors.muted}
                />
                <Text style={[type.small, img.isThumbnail && { color: colors.basilDark, fontWeight: '700' }]}>
                  {img.isThumbnail ? t('thumbnail') : t('setAsThumbnail')}
                </Text>
              </Pressable>
              <Pressable onPress={() => removeImage(index)} hitSlop={10} accessibilityLabel={t('removeImage')}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addRow}>
            <Input
              style={{ flex: 1 }}
              value={newUrl}
              onChangeText={(v) => {
                setNewUrl(v);
                setUrlError(null);
              }}
              placeholder={t('imageUrlPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              invalid={!!urlError}
              onSubmitEditing={addImage}
              accessibilityLabel={t('addImage')}
            />
            <Button title={t('add')} icon="add" variant="secondary" onPress={addImage} />
          </View>
          {urlError ? <Text style={styles.error}>{msg(urlError)}</Text> : null}
        </Field>

        <Button title={submitLabel} icon="checkmark" onPress={submit} loading={saving} testID="save-dish" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: space.lg, gap: space.lg, paddingBottom: 48 },
  twoCol: { flexDirection: 'row', gap: space.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.sm,
  },
  imagePreview: { width: 56, height: 56, borderRadius: radius.sm, overflow: 'hidden' },
  thumbChoice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '500' },
});
