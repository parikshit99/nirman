import { logError, logStep, migrateLocal, prefs, restoreBackup, type BackupFile, type Db, type Snapshot } from '@nirman/core';
import Nirman from '../../modules/nirman-native';
import { DATABASE_FILE, openNirmanDb } from './db';
import { startServices, type Services } from './services';

/** Set once the app has started with its data; until then each start is the first launch after installing or updating. */
const READY_PREF = 'nirmaan_native_ready';
/** Set on the first launch over 6.x: the Gemini key has to be pasted again (it was in the old app's storage). */
export const FROM_6X_PREF = 'nirmaan_from_6x';
/** A copy of 6.x's database, kept as it was before 7.x first opened it, for 6 weeks (forgetOldCopy). */
export const BEFORE_7_FILE = 'nirmaan-before-7.db';
/** When the copy was made (ms); 0 or missing for a copy made before this was recorded. */
const BEFORE_7_SINCE_PREF = 'nirmaan_before_7_since';
const KEEP_COPY_MS = 42 * 24 * 60 * 60 * 1000;

export type StartProblem =
  /** 6.x left its files on this phone but its database isn't there. */
  | { kind: 'missing' }
  /** Not enough room to keep a copy of the data before the update. */
  | { kind: 'no-space'; size: number; free: number }
  /** The data can't be opened or failed its check. */
  | { kind: 'damaged'; detail: string };

export type StartResult = { ok: true; services: Services; initial: Snapshot } | { ok: false; problem: StartProblem };

/**
 * Opens the data and starts the app. The first launch (after installing 7.0 over 6.x) finds 6.x's database where it
 * is, keeps a copy of it, checks it and then brings it up to date. Never starts empty silently: anything wrong comes
 * back as a problem, and the app offers Restore from backup.
 */
export async function startApp(opts: { withoutCopy?: boolean; allowEmpty?: boolean } = {}): Promise<StartResult> {
  try {
    return await start(opts);
  } catch (err) {
    // Anything unexpected (e.g. the files couldn't be checked) still ends on the screen with Restore from backup.
    logError(err, 'startup');
    return { ok: false, problem: { kind: 'damaged', detail: (err as Error).message } };
  }
}

async function start({ withoutCopy = false, allowEmpty = false }: { withoutCopy?: boolean; allowEmpty?: boolean }): Promise<StartResult> {
  const first = !prefs.get(READY_PREF, false);
  let check = false;
  if (first) {
    const info = Nirman.databaseInfo(DATABASE_FILE);
    logStep('first launch', { found: info.exists, size: info.size, free: info.freeBytes, oldAppFiles: info.otherAppFiles });
    if (!info.exists && info.otherAppFiles && !allowEmpty) return { ok: false, problem: { kind: 'missing' } };
    if (info.exists) {
      check = true;
      prefs.set(FROM_6X_PREF, true);
      if (!withoutCopy && !Nirman.databaseExists(BEFORE_7_FILE)) {
        if (info.freeBytes < 2 * info.size) return { ok: false, problem: { kind: 'no-space', size: info.size, free: info.freeBytes } };
        await Nirman.copyDatabase(DATABASE_FILE, BEFORE_7_FILE);
        prefs.set(BEFORE_7_SINCE_PREF, Date.now());
      }
    }
  }

  let db: Db | undefined;
  try {
    db = await openNirmanDb();
    if (check) {
      const rows = await db.all<Record<string, unknown>>('PRAGMA integrity_check');
      const result = rows.map((r) => String(Object.values(r)[0])).join('; ');
      if (result !== 'ok') {
        logStep('integrity check failed', { result });
        await db.close().catch(() => {});
        return { ok: false, problem: { kind: 'damaged', detail: result } };
      }
    }
    const started = await startServices(db);
    prefs.set(READY_PREF, true);
    forgetOldCopy();
    return { ok: true, ...started };
  } catch (err) {
    logError(err, 'startup');
    await db?.close().catch(() => {});
    return { ok: false, problem: { kind: 'damaged', detail: (err as Error).message } };
  }
}

/**
 * The copy from before 7.x is deleted 6 weeks after it was made, once the app has started with the data (the 6.x app
 * it could go back to is gone; anyone updating from 6.x later still gets their 6 weeks). A copy made before the date was
 * recorded starts its 6 weeks now. Never stops the app from starting.
 */
function forgetOldCopy() {
  try {
    if (!Nirman.databaseExists(BEFORE_7_FILE)) return;
    const since = prefs.get(BEFORE_7_SINCE_PREF, 0);
    if (!since) prefs.set(BEFORE_7_SINCE_PREF, Date.now());
    else if (Date.now() - since >= KEEP_COPY_MS) {
      Nirman.deleteDatabase(BEFORE_7_FILE);
      prefs.set(BEFORE_7_SINCE_PREF, 0);
      logStep('deleted the copy of the data from before 7.0', { keptDays: Math.round((Date.now() - since) / 86400000) });
    }
  } catch (err) {
    logError(err, 'startup');
  }
}

/** Opens the backup's data before anything else is open: the old database file is renamed and kept, never deleted. */
export async function restoreBeforeStart(file: BackupFile | null): Promise<void> {
  if (Nirman.databaseExists(DATABASE_FILE)) Nirman.setDatabaseAside(DATABASE_FILE, `nirmaan-set-aside-${Date.now()}.db`);
  if (!file) return;
  const db = await openNirmanDb();
  try {
    await migrateLocal(db);
    await restoreBackup(db, file.backup, file.photos);
  } finally {
    await db.close();
  }
}

