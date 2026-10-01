import { openSqlJs } from '../src/data/sql.ts';
import { migrateLocal } from '../src/data/schema.ts';
import { ensureDrafts } from '../src/data/repo.ts';

export async function freshDb() {
  const db = await openSqlJs();
  await migrateLocal(db);
  await ensureDrafts(db);
  return db;
}
