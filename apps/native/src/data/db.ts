import { openDatabaseAsync } from 'expo-sqlite';
import { wrapDriver, type Db } from '@nirman/core';
import Nirman from '../../modules/nirman-native';

/**
 * The Capacitor app's database file, opened where it is. @capacitor-community/sqlite appends
 * "SQLite.db" to the name and keeps it in Android's databases folder (`context.getDatabasePath`):
 * /data/data/com.nirmaan.auditor/databases/nirmaanSQLite.db, a plain SQLite file (no encryption).
 */
export const DATABASE_FILE = 'nirmaanSQLite.db';

/** `Db` (from core) on expo-sqlite. */
export async function openNirmanDb(): Promise<Db> {
  const path = Nirman.databasePath(DATABASE_FILE);
  const db = await openDatabaseAsync(DATABASE_FILE, {}, path.slice(0, path.lastIndexOf('/')));
  return wrapDriver({
    all: (sql, params) => db.getAllAsync<Record<string, unknown>>(sql, params),
    async run(sql, params) {
      await db.runAsync(sql, params);
    },
    exec: (script) => db.execAsync(script),
    begin: () => db.execAsync('BEGIN'),
    commit: () => db.execAsync('COMMIT'),
    rollback: () => db.execAsync('ROLLBACK'),
    close: () => db.closeAsync(),
  });
}
