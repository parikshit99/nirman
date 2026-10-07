import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import { dataTables, rowSchemas, todayISO, type RowTypes } from '@nirman/shared';
import { clearAllData, ensureProjectRows, pruneBillPhotos, selectAll, writeRow } from './repo.ts';
import type { Db } from './sql.ts';
import { base64ToBytes, bytesToBase64 } from '../lib/base64.ts';

const APP_ID = 'nirmaan-auditor';
/**
 * 2 added vendor quotes, 3 hidden materials, 4 brand/model/spec/colour, 8 labour contracts, 9 items.photo_id,
 * 10 items.rates_excluded, 11 projects, 12 bill photos (a .zip: backup.json plus photos/*.jpg); older files still restore
 * (their lists go into projects by site address; .json files have no photos).
 */
const VERSION = 12;
const READABLE_VERSIONS: unknown[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** A bill photo in the backup: its pages are files in the zip. */
const billPhotoSchema = z.object({ id: z.string().min(1).max(200), created_at: z.string().max(40), files: z.array(z.string().max(300)).max(100) });

const backupSchema = z.object({
  app: z.literal(APP_ID),
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
  exported_at: z.string().datetime({ offset: true }),
  projects: z.array(rowSchemas.projects).default([]),
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
  bill_photos: z.array(billPhotoSchema).default([]),
});
export type Backup = z.infer<typeof backupSchema>;

/**
 * Everything except queued AI entries (their photos can be large and they aren't
 * records yet), including quotes still waiting to be read.
 */
export async function exportBackup(db: Db): Promise<Backup> {
  return db.transaction(async (tx) => {
    const backup: Record<string, unknown> = { app: APP_ID, version: VERSION, exported_at: new Date().toISOString(), bill_photos: [] };
    for (const table of dataTables) backup[table] = await tx.all(selectAll(table, 'rowid'));
    const unread = new Set((await tx.all<{ quote_id: string }>('SELECT quote_id FROM jobs WHERE quote_id IS NOT NULL')).map((j) => j.quote_id));
    backup.quotes = (backup.quotes as { id: string }[]).filter((q) => !unread.has(q.id));
    return backup as Backup;
  });
}

/** A backup as read from a file: the data, and the bill photos (id → pages as base64 JPEG). */
export interface BackupFile {
  backup: Backup;
  photos: Map<string, string[]>;
}

/** The backup as one .zip: backup.json and every bill photo as a JPEG (stored as is: they are compressed already). */
export async function exportBackupZip(db: Db): Promise<{ bytes: Uint8Array; photos: number }> {
  const backup = await exportBackup(db);
  const zip: Zippable = {};
  const rows = await db.all<{ id: string; created_at: string; images: string }>('SELECT id, created_at, images FROM bill_photos ORDER BY created_at');
  backup.bill_photos = rows.map((row) => {
    const files = (JSON.parse(row.images) as string[]).map((data, i) => {
      const path = `photos/${row.id}-${i + 1}.jpg`;
      zip[path] = [base64ToBytes(data), { level: 0 }];
      return path;
    });
    return { id: row.id, created_at: row.created_at, files };
  });
  zip['backup.json'] = strToU8(JSON.stringify(backup));
  return { bytes: zipSync(zip), photos: rows.length };
}

/** Read a backup file: a .zip (with bill photos) or an older .json. */
export function parseBackupFile(bytes: Uint8Array): BackupFile {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return { backup: parseBackup(strFromU8(bytes)), photos: new Map() };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError('The backup file is damaged (the zip could not be opened).');
  }
  if (!files['backup.json']) throw new BackupError('This file is not a Nirman backup (no backup.json inside).');
  const backup = parseBackup(strFromU8(files['backup.json']));
  const photos = new Map<string, string[]>();
  for (const p of backup.bill_photos) {
    const pages = p.files.filter((f) => files[f]).map((f) => bytesToBase64(files[f]));
    if (pages.length) photos.set(p.id, pages);
  }
  return { backup, photos };
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
export async function restoreBackup(db: Db, backup: Backup, photos: Map<string, string[]> = new Map()): Promise<void> {
  await db.transaction(async (tx) => {
    await clearAllData(tx, { seedDefaults: false });
    for (const table of dataTables) {
      for (const row of backup[table]) await writeRow(tx, table, row as RowTypes[typeof table]);
    }
    await ensureProjectRows(tx);
    // Bill photos come with a .zip backup; restoring an older .json keeps those of restored lines already on this phone.
    for (const p of backup.bill_photos) {
      const pages = photos.get(p.id);
      if (pages) await tx.run('INSERT OR REPLACE INTO bill_photos (id, created_at, images) VALUES (?, ?, ?)', [p.id, p.created_at, JSON.stringify(pages)]);
    }
    await pruneBillPhotos(tx);
  });
}

/** Named by the phone's local date (an IST backup at 1 AM is today's, not yesterday's UTC date). */
export const backupFilename = (date = new Date()) => `nirman-backup-${todayISO(date)}.zip`;
