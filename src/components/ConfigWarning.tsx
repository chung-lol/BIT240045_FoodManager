import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { isStudentIdPlaceholder } from '@/config/appConfig';
import { useT } from '@/i18n';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Nhắc nhở khi STUDENT_ID vẫn là giá trị mẫu "MSSV".
 * Quên đổi MSSV => bảng/cột không mang MSSV thật => có thể bị trừ 1–3 điểm.
 * Banner tự biến mất khi đã cấu hình đúng.
 */
export function ConfigWarning() {
  const t = useT();
  if (!isStudentIdPlaceholder()) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Ionicons name="warning-outline" size={18} color={colors.danger} />
      <Text style={styles.text}>{t('studentIdPlaceholderWarning')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerTint,
    borderRadius: radius.md,
    padding: space.md,
  },
  text: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
