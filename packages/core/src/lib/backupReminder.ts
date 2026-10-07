import { prefs } from './prefs.ts';

/** Remind after this many days without a backup (or right away if there never was one). */
export const BACKUP_REMIND_DAYS = 7;
const SNOOZE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_KEY = 'nirmaan_last_backup';
const SNOOZE_KEY = 'nirmaan_backup_snooze_until';

export const lastBackupAt = (): Date | null => {
  const iso = prefs.get<string | null>(LAST_KEY, null);
  return iso ? new Date(iso) : null;
};

export const recordBackup = (now = new Date()) => prefs.set(LAST_KEY, now.toISOString());

export const snoozeBackupReminder = (now = new Date()) => prefs.set(SNOOZE_KEY, now.getTime() + SNOOZE_DAYS * DAY_MS);

export const daysSince = (date: Date, now = new Date()) => Math.floor((now.getTime() - date.getTime()) / DAY_MS);

/** Whether to nudge: there is data to lose, no recent backup, and the reminder isn't snoozed. */
export function backupOverdue(hasData: boolean, now = new Date()): boolean {
  if (!hasData || now.getTime() < prefs.get(SNOOZE_KEY, 0)) return false;
  const last = lastBackupAt();
  return !last || daysSince(last, now) >= BACKUP_REMIND_DAYS;
}

/** "today", "yesterday", "9 days ago", or "never". */
export function describeLastBackup(now = new Date()): string {
  const last = lastBackupAt();
  if (!last) return 'never';
  const days = daysSince(last, now);
  const date = last.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} (${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`})`;
}
