import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { z } from 'zod';
import { dataTables, fitRow, rowSchemas, todayISO, type RowTypes } from '@nirman/shared';
import { clearAllData, ensureProjectRows, pruneBillPhotos, selectAll, writeRow } from './repo.ts';
import type { Db } from './sql.ts';
import { base64ToBytes, bytesToBase64 } from '../lib/base64.ts';

const APP_ID = 'nirmaan-auditor';
/**
 * 2 added vendor quotes, 3 hidden materials, 4 brand/model/spec/colour, 8 labour contracts, 9 items.photo_id,
 * 10 items.rates_excluded, 11 projects, 12 bill photos (a .zip: backup.json plus photos/*.jpg), 13 advance (kharcha) entries,
 * 14 items.read_as (what a matched line was read as);
 * older files still restore
 * (their lists go into projects by site address; .json files have no photos).
 */
const VERSION = 14;
/** Every version from 1 to this one restores. */
const isReadableVersion = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= VERSION;

/** A bill photo in the backup: its pages are files in the zip. */
const billPhotoSchema = z.object({ id: z.string().min(1).max(200), created_at: z.string().max(40), files: z.array(z.string().max(300)).max(100) });

const backupSchema = z.object({
  app: z.literal(APP_ID),
  version: z.number().refine(isReadableVersion),
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

/** Bill photos read from a backup: id → pages as JPEG bytes (made into text one bill at a time while restoring). */
export type BackupPhotos = Map<string, Uint8Array[]>;

/** A backup as read from a file: the data, and the bill photos. */
export interface BackupFile {
  backup: Backup;
  photos: BackupPhotos;
  /**
   * How many values in `backup` were shortened to fit (text longer than the app keeps, cut to its limit; numbers JSON
   * could not hold, set to 0): 0 when everything fit as it was.
   */
  shortened: number;
}

/**
 * The backup as one .zip: every bill photo as a JPEG (stored as is: they are compressed already), then backup.json.
 * It is handed to `write` piece by piece and only one bill's photos are read from the database at a time, so a phone
 * with many photos never holds the whole backup in memory. backup.json is read back as a restore would read it before
 * it is added: a backup that would not restore throws a BackupError naming the field, and the file is not finished.
 */
export async function writeBackupZip(db: Db, write: (chunk: Uint8Array) => void): Promise<{ photos: number }> {
  const backup = await exportBackup(db);
  let failed: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failed ??= err;
    else if (!failed) write(chunk);
  });
  const ids = await db.all<{ id: string; created_at: string }>('SELECT id, created_at FROM bill_photos ORDER BY created_at');
  backup.bill_photos = [];
  for (const { id, created_at } of ids) {
    const [row] = await db.all<{ images: string }>('SELECT images FROM bill_photos WHERE id = ?', [id]);
    if (!row) continue;
    const files = (JSON.parse(row.images) as string[]).map((data, i) => {
      const path = `photos/${id}-${i + 1}.jpg`;
      const file = new ZipPassThrough(path);
      zip.add(file);
      file.push(base64ToBytes(data), true);
      return path;
    });
    backup.bill_photos.push({ id, created_at, files });
    if (failed) throw failed;
  }
  const text = JSON.stringify(backup);
  // A safety net (saving fits every row, so this shouldn't fail): never hand out a backup that would not restore.
  const check = checkBackup(JSON.parse(text));
  if ('problem' in check) {
    throw new BackupError(`The backup was not saved: it would not restore (${check.problem}). Please report this problem from Settings.`);
  }
  const json = new ZipDeflate('backup.json');
  zip.add(json);
  json.push(strToU8(text), true);
  zip.end();
  if (failed) throw failed;
  return { photos: backup.bill_photos.length };
}

/** The whole backup .zip in memory (tests, and small data). */
export async function exportBackupZip(db: Db): Promise<{ bytes: Uint8Array; photos: number }> {
  const chunks: Uint8Array[] = [];
  const { photos } = await writeBackupZip(db, (c) => chunks.push(c));
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return { bytes, photos };
}

/** Read a backup file: a .zip (with bill photos) or an older .json. */
export function parseBackupFile(bytes: Uint8Array): BackupFile {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return { ...readBackup(strFromU8(bytes)), photos: new Map() };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError('The backup file is damaged (the zip could not be opened).');
  }
  if (!files['backup.json']) throw new BackupError('This file is not a Nirman backup (no backup.json inside).');
  const { backup, shortened } = readBackup(strFromU8(files['backup.json']));
  const photos: BackupPhotos = new Map();
  for (const p of backup.bill_photos) {
    const pages = p.files.filter((f) => files[f]).map((f) => files[f]);
    if (pages.length) photos.set(p.id, pages);
  }
  return { backup, photos, shortened };
}

export class BackupError extends Error {}

/**
 * Each table's rows fitted to their limits as saving fits them (fitRow), then the whole file checked against the
 * schema: the backup and how many values were fitted, or the first problem as "field: what is wrong".
 */
function checkBackup(raw: unknown): { backup: Backup; shortened: number } | { problem: string } {
  const fitted: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  let shortened = 0;
  for (const table of dataTables) {
    const rows = fitted[table];
    if (!Array.isArray(rows)) continue;
    fitted[table] = rows.map((row: unknown) => {
      if (!row || typeof row !== 'object') return row;
      const fit = fitRow(table, row);
      shortened += fit.shortened;
      return fit.row;
    });
  }
  const parsed = backupSchema.safeParse(fitted);
  if (parsed.success) return { backup: parsed.data, shortened };
  const issue = parsed.error.issues[0];
  return { problem: `${issue.path.join('.')}: ${issue.message}` };
}

/**
 * Parse and validate a backup file without touching the database. Text longer than the app keeps is cut to fit
 * rather than refusing the file (see BackupFile.shortened).
 */
export function parseBackup(text: string): Backup {
  return readBackup(text).backup;
}

function readBackup(text: string): { backup: Backup; shortened: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a Nirman backup (it is not valid JSON).');
  }
  if ((raw as { app?: unknown })?.app !== APP_ID) throw new BackupError('This file is not a Nirman backup.');
  if (!isReadableVersion((raw as { version?: unknown }).version)) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app and try again.');
  }
  const check = checkBackup(raw);
  if ('problem' in check) throw new BackupError(`The backup file is damaged (${check.problem}).`);
  return check;
}

/** Replace all data on the phone with the backup. All or nothing. */
export async function restoreBackup(db: Db, backup: Backup, photos: BackupPhotos = new Map()): Promise<void> {
  await db.transaction(async (tx) => {
    await clearAllData(tx, { seedDefaults: false });
    for (const table of dataTables) {
      for (const row of backup[table]) await writeRow(tx, table, row as RowTypes[typeof table]);
    }
    await ensureProjectRows(tx);
    // Bill photos come with a .zip backup; restoring an older .json keeps those of restored lines already on this phone.
    for (const p of backup.bill_photos) {
      const pages = photos.get(p.id);
      if (pages) await tx.run('INSERT OR REPLACE INTO bill_photos (id, created_at, images) VALUES (?, ?, ?)', [p.id, p.created_at, JSON.stringify(pages.map(bytesToBase64))]);
    }
    await pruneBillPhotos(tx);
  });
}

/** Named by the phone's local date (an IST backup at 1 AM is today's, not yesterday's UTC date). */
export const backupFilename = (date = new Date()) => `nirman-backup-${todayISO(date)}.zip`;
