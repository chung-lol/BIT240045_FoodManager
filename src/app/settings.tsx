import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConfigWarning } from '@/components/ConfigWarning';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { Button, Chip, Section } from '@/components/ui';
import { isMockApiConfigured, MOCKAPI_BASE_URL, STUDENT_ID } from '@/config/appConfig';
import { TABLES } from '@/database/schema';
import { useT } from '@/i18n';
import { useLanguageStore } from '@/store/languageStore';
import { useSyncStore } from '@/store/syncStore';
import { requestSync } from '@/sync/syncScheduler';
import { space, type } from '@/theme/tokens';

/** MÀN HÌNH 5 — Cài đặt: chuyển ngôn ngữ + thông tin đồng bộ. */
export default function SettingsScreen() {
  const t = useT();
  const { language, setLanguage } = useLanguageStore();
  const { isOnline, isSyncing, lastSyncAt, lastError } = useSyncStore();
  const configured = isMockApiConfigured();

  const lastSyncText = lastSyncAt
    ? t('lastSyncAt', { time: new Date(lastSyncAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') })
    : t('neverSynced');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: t('settings') }} />
      <ConfigWarning />

      <Section title={t('language')}>
        <View style={styles.row}>
          <Chip label={t('english')} selected={language === 'en'} onPress={() => void setLanguage('en')} />
          <Chip label={t('vietnamese')} selected={language === 'vi'} onPress={() => void setLanguage('vi')} />
        </View>
      </Section>

      <Section title={t('syncSection')}>
        <SyncStatusBar />
        <Text style={type.small}>{t('autoSyncHint')}</Text>
        <Text style={type.small}>{lastSyncText}</Text>
        {lastError ? <Text style={[type.small, { color: '#B42318' }]}>{t('syncFailed', { message: lastError })}</Text> : null}
        <Button
          title={t('syncNow')}
          icon="sync"
          variant="secondary"
          disabled={!configured || !isOnline}
          loading={isSyncing}
          onPress={() => void requestSync('manual')}
        />
        <View style={styles.kv}>
          <Text style={type.label}>{t('mockApiUrl')}</Text>
          <Text style={type.small} selectable>
            {configured ? MOCKAPI_BASE_URL : '—'}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={type.label}>{t('studentId')}</Text>
          <Text style={type.small} selectable>
            {STUDENT_ID} · {Object.values(TABLES).join(', ')}
          </Text>
        </View>
      </Section>

      <Section title={t('databaseTitle')}>
        <Text style={type.small}>{t('databaseHint')}</Text>
        <Button
          title={t('openDatabaseInspector')}
          icon="server-outline"
          variant="secondary"
          onPress={() => router.push('/database')}
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: space.lg, gap: space.lg },
  row: { flexDirection: 'row', gap: space.sm },
  kv: { gap: 2 },
});
