import type { Db } from '@/database/database';
import { PREFIX, q, TABLES } from '@/database/schema';

/**
 * Đọc schema THẬT đang nằm trong file SQLite trên thiết bị (sqlite_master + PRAGMA),
 * không đọc lại hằng số trong code. Dùng để chứng minh trong video rằng mọi bảng,
 * cột và index đều có tiền tố {MSSV}_.
 */
export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  hasPrefix: boolean;
}

export interface TableInfo {
  name: string;
  hasPrefix: boolean;
  rowCount: number;
  columns: ColumnInfo[];
  indexes: string[];
  foreignKeys: string[];
}

export interface SchemaReport {
  tables: TableInfo[];
  allPrefixed: boolean;
  foreignKeysEnabled: boolean;
  userVersion: number;
}

type Row = Record<string, unknown>;

export async function inspectSchema(db: Db): Promise<SchemaReport> {
  const tableRows = await db.getAllAsync<Row>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%'
     ORDER BY name`,
  );

  const tables: TableInfo[] = [];
  for (const tr of tableRows) {
    const name = String(tr.name);
    const cols = await db.getAllAsync<Row>(`PRAGMA table_info(${q(name)})`);
    const idx = await db.getAllAsync<Row>(`PRAGMA index_list(${q(name)})`);
    const fks = await db.getAllAsync<Row>(`PRAGMA foreign_key_list(${q(name)})`);
    const count = await db.getFirstAsync<Row>(`SELECT COUNT(*) AS n FROM ${q(name)}`);
    tables.push({
      name,
      hasPrefix: name.startsWith(PREFIX),
      rowCount: Number(count?.n ?? 0),
      columns: cols.map((c) => ({
        name: String(c.name),
        type: String(c.type),
        notNull: Number(c.notnull) === 1,
        primaryKey: Number(c.pk) > 0,
        hasPrefix: String(c.name).startsWith(PREFIX),
      })),
      // Bỏ index tự sinh của SQLite (sqlite_autoindex_...) vì tên do SQLite đặt
      indexes: idx.map((i) => String(i.name)).filter((n) => !n.startsWith('sqlite_autoindex')),
      foreignKeys: fks.map((f) => `${String(f.from)} → ${String(f.table)}.${String(f.to)} (ON DELETE ${String(f.on_delete)})`),
    });
  }

  const fk = await db.getFirstAsync<Row>('PRAGMA foreign_keys');
  const uv = await db.getFirstAsync<Row>('PRAGMA user_version');
  const appTables = tables.filter((t) => Object.values(TABLES).includes(t.name as never));
  const allPrefixed =
    tables.every((t) => t.hasPrefix) &&
    tables.every((t) => t.columns.every((c) => c.hasPrefix)) &&
    tables.every((t) => t.indexes.every((i) => i.startsWith(PREFIX))) &&
    appTables.length === Object.values(TABLES).length;

  return {
    tables,
    allPrefixed,
    foreignKeysEnabled: Number(fk?.foreign_keys) === 1,
    userVersion: Number(uv?.user_version ?? 0),
  };
}
