import { openSqlJs } from '../src/data/sql.ts';
import { migrateLocal } from '../src/data/schema.ts';
import { ensureProjects } from '../src/data/repo.ts';

/** The drafts of a phone that had them before projects; ensureProjects puts them in "My site". */
export const DRAFT_IDS = { audit: 'draft-audit', boq: 'draft-boq' } as const;

export async function freshDb() {
  const db = await openSqlJs();
  await migrateLocal(db);
  for (const kind of ['audit', 'boq'] as const) {
    await db.run(`INSERT INTO lists (id, kind, status, created_at, updated_at) VALUES (?, ?, 'draft', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`, [DRAFT_IDS[kind], kind]);
  }
  await ensureProjects(db);
  return db;
}

/** The project the drafts are in. */
export async function projectOf(db: Awaited<ReturnType<typeof freshDb>>) {
  const [row] = await db.all<{ project_id: string }>('SELECT project_id FROM lists WHERE id = ?', [DRAFT_IDS.audit]);
  return row.project_id;
}
