import { z } from 'zod';
import { dataTables, rowSchemas, todayISO, type RowTypes } from '@nirman/shared';
import { clearAllData, ensureDraftRows, pruneBillPhotos, selectAll, writeRow } from './repo.ts';
import type { Db } from './sql.ts';

const APP_ID = 'nirmaan-auditor';
/** 2 added vendor quotes, 3 hidden materials, 4 brand/model/spec/colour, 8 labour contracts, 9 items.photo_id; older files still restore. */
const VERSION = 9;
const READABLE_VERSIONS: unknown[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const backupSchema = z.object({
  app: z.literal(APP_ID),
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
  exported_at: z.string().datetime({ offset: true }),
  lists: z.array(rowSchemas.lists),
  items: z.array(rowSchemas.items),
  indexed_rates: z.array(rowSchemas.indexed_rates),
  learned_terms: z.array(rowSchemas.learned_terms),
  categories: z.array(rowSchemas.categories),
  quotes: z.array(rowSchemas.quotes).default([]),
  quote_lines: z.array(rowSchemas.quote_lines).default([]),
  hidden_materials: z.array(rowSchemas.hidden_materials).default([]),
  contracts: z.array(rowSchemas.contracts).default([]),
  contract_entries: z.array(rowSchemas.contract_entries).default([]),
});
export type Backup = z.infer<typeof backupSchema>;

/**
 * Everything except queued AI entries (their photos can be large and they aren't
 * records yet), including quotes still waiting to be read.
 */
export async function exportBackup(db: Db): Promise<Backup> {
  return db.transaction(async (tx) => {
    const backup: Record<string, unknown> = { app: APP_ID, version: VERSION, exported_at: new Date().toISOString() };
    for (const table of dataTables) backup[table] = await tx.all(selectAll(table, 'rowid'));
    const unread = new Set((await tx.all<{ quote_id: string }>('SELECT quote_id FROM jobs WHERE quote_id IS NOT NULL')).map((j) => j.quote_id));
    backup.quotes = (backup.quotes as { id: string }[]).filter((q) => !unread.has(q.id));
    return backup as Backup;
  });
}

export class BackupError extends Error {}

/** Parse and validate a backup file without touching the database. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a Nirman backup (it is not valid JSON).');
  }
  if ((raw as { app?: unknown })?.app !== APP_ID) throw new BackupError('This file is not a Nirman backup.');
  if (!READABLE_VERSIONS.includes((raw as { version?: unknown }).version)) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app and try again.');
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BackupError(`The backup file is damaged (${issue.path.join('.')}: ${issue.message}).`);
  }
  return parsed.data;
}

/** Replace all data on the phone with the backup. All or nothing. */
export async function restoreBackup(db: Db, backup: Backup): Promise<void> {
  await db.transaction(async (tx) => {
    await clearAllData(tx, { seedDefaults: false });
    for (const table of dataTables) {
      for (const row of backup[table]) await writeRow(tx, table, row as RowTypes[typeof table]);
    }
    await ensureDraftRows(tx);
    // Bill photos aren't in backups; on this phone, those of restored lines still show.
    await pruneBillPhotos(tx);
  });
}

/** Named by the phone's local date (an IST backup at 1 AM is today's, not yesterday's UTC date). */
export const backupFilename = (date = new Date()) => `nirman-backup-${todayISO(date)}.json`;
