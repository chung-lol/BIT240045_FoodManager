import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { useToastStore } from '@/store/toastStore';
import { colors, radius, space } from '@/theme/tokens';

export function Toast() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { message, hide } = useToastStore();
  if (!message) return null;
  const error = message.tone === 'error';
  return (
    <Pressable
      onPress={hide}
      style={[styles.toast, { bottom: insets.bottom + 24, backgroundColor: error ? colors.danger : colors.ink }]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={error ? 'alert-circle' : 'checkmark-circle'} size={18} color="#FFFFFF" />
      <Text style={styles.text}>{t(message.key, message.params)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1 },
});
