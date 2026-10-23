import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Field, Input, Section } from '@/components/ui';
import { DATABASE_NAME, STUDENT_ID } from '@/config/appConfig';
import { getDb } from '@/database/database';
import { PREFIX } from '@/database/schema';
import { useT } from '@/i18n';
import { inspectSchema, type SchemaReport } from '@/repositories/schemaInspector';
import { useDataStore } from '@/store/dataStore';
import { colors, radius, space, type } from '@/theme/tokens';

/**
 * MÀN HÌNH 6 — Kiểm tra cơ sở dữ liệu (phục vụ Video 2 và kiểm thử).
 *  - Đọc schema thật từ SQLite: bảng, cột, index, khoá ngoại, số dòng.
 *  - Tự kiểm tra mọi tên đều có tiền tố {MSSV}_.
 *  - Ô "Mở món theo ID" để minh hoạ màn hình Not Found với ID không tồn tại.
 */
export default function DatabaseScreen() {
  const t = useT();
  const version = useDataStore((s) => s.version);
  const [report, setReport] = useState<SchemaReport | null>(null);
  const [dishId, setDishId] = useState('');

  useEffect(() => {
    let active = true;
    getDb()
      .then(inspectSchema)
      .then((r) => active && setReport(r));
    return () => {
      active = false;
    };
  }, [version]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: t('databaseTitle') }} />

      <Section title={t('openDishById')}>
        <Field label="ID" hint={t('openDishByIdHint')}>
          <Input
            value={dishId}
            onChangeText={setDishId}
            placeholder="does-not-exist-123"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
        <Button
          title={t('open')}
          icon="open-outline"
          variant="secondary"
          disabled={!dishId.trim()}
          onPress={() => router.push(`/dish/${encodeURIComponent(dishId.trim())}`)}
        />
      </Section>

      {!report ? (
        <ActivityIndicator color={colors.basil} />
      ) : (
        <>
          <Section title={t('schemaSummary')}>
            <Text style={type.body} selectable>
              {t('studentId')}: {STUDENT_ID}
              {'\n'}
              {t('prefix')}: {PREFIX}
              {'\n'}
              {t('databaseFile')}: {DATABASE_NAME}
              {'\n'}
              PRAGMA user_version = {report.userVersion}
            </Text>
            <View style={styles.badges}>
              <Badge
                label={report.allPrefixed ? t('allNamesPrefixed') : t('someNamesNotPrefixed')}
                tone={report.allPrefixed ? 'green' : 'red'}
              />
              <Badge
                label={report.foreignKeysEnabled ? 'PRAGMA foreign_keys = ON' : 'PRAGMA foreign_keys = OFF'}
                tone={report.foreignKeysEnabled ? 'green' : 'red'}
              />
            </View>
          </Section>

          {report.tables.map((table) => (
            <View key={table.name} style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[type.heading, !table.hasPrefix && styles.bad]} selectable>
                  {table.name}
                </Text>
                <Text style={type.small}>{t('rowCount', { count: table.rowCount })}</Text>
              </View>
              {table.columns.map((col) => (
                <View key={col.name} style={styles.colRow}>
                  <Text style={[styles.mono, !col.hasPrefix && styles.bad]} selectable>
                    {col.primaryKey ? '🔑 ' : ''}
                    {col.name}
                  </Text>
                  <Text style={styles.colType}>
                    {col.type}
                    {col.notNull ? ' NOT NULL' : ''}
                  </Text>
                </View>
              ))}
              {table.indexes.length > 0 ? (
                <Text style={[type.small, styles.meta]} selectable>
                  {t('indexes')}: {table.indexes.join(', ')}
                </Text>
              ) : null}
              {table.foreignKeys.length > 0 ? (
                <Text style={[type.small, styles.meta]} selectable>
                  {t('foreignKeys')}: {table.foreignKeys.join('; ')}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 960, alignSelf: 'center', padding: space.lg, gap: space.lg, paddingBottom: 48 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.md,
    gap: 4,
  },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  colRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  mono: { fontFamily: 'monospace', fontSize: 12.5, color: colors.ink, flexShrink: 1 },
  colType: { fontSize: 12, color: colors.muted },
  meta: { marginTop: 6 },
  bad: { color: colors.danger },
});
