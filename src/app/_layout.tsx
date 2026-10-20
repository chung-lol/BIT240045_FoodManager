import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toast } from '@/components/Toast';
import { Button } from '@/components/ui';
import { getDb } from '@/database/database';
import { seedIfNeeded } from '@/database/seed';
import { useT } from '@/i18n';
import { useLanguageStore } from '@/store/languageStore';
import { useNetworkSync } from '@/sync/useNetworkSync';
import { colors } from '@/theme/tokens';

/** Khởi động: mở SQLite + migrate -> seed (1 lần) -> nạp ngôn ngữ đã lưu -> bật auto-sync. */
function useBootstrap() {
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({ ready: false, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb();
        await seedIfNeeded();
        await useLanguageStore.getState().loadLanguage();
        if (!cancelled) setState({ ready: true, error: null });
      } catch (e) {
        if (!cancelled) setState({ ready: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

function SyncRunner() {
  useNetworkSync();
  return null;
}

export default function RootLayout() {
  const { ready, error, retry } = useBootstrap();
  const t = useT();

  if (!ready) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.error}>{t('genericError', { message: error })}</Text>
            <Button title="Retry" onPress={retry} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.basil} />
        )}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SyncRunner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.basilDark,
          headerTitleStyle: { color: colors.ink, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      <Toast />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colors.bg },
  error: { color: colors.danger, textAlign: 'center' },
});
