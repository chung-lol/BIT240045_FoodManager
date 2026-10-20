import type { Db } from '@/database/database';
import { SQL } from '@/database/schema';

const { T, c } = SQL;

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<Record<string, string | null>>(
    `SELECT ${c.value} AS v FROM ${T.setting} WHERE ${c.key} = ?`,
    [key],
  );
  return row ? (row.v as string | null) : null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO ${T.setting} (${c.key}, ${c.value}) VALUES (?, ?)
     ON CONFLICT(${c.key}) DO UPDATE SET ${c.value} = excluded.${c.value}`,
    [key, value],
  );
}
