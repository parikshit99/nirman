import { beforeEach, describe, expect, it } from 'vitest';
import { backupOverdue, describeLastBackup, recordBackup, snoozeBackupReminder } from '../src/lib/backupReminder.ts';
import { backupFilename } from '../src/data/backup.ts';
import { configureCore } from '../src/platform.ts';

const store = new Map<string, string>();
configureCore({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });
const day = (d: string) => new Date(`${d}T10:00:00`);

describe('backup reminder', () => {
  beforeEach(() => store.clear());

  it('reminds when there is data and no backup yet', () => {
    expect(backupOverdue(false, day('2026-10-04'))).toBe(false);
    expect(backupOverdue(true, day('2026-10-04'))).toBe(true);
    expect(describeLastBackup(day('2026-10-04'))).toBe('never');
  });

  it('stays quiet for a week after a backup, then reminds', () => {
    recordBackup(day('2026-10-01'));
    expect(backupOverdue(true, day('2026-10-07'))).toBe(false);
    expect(backupOverdue(true, day('2026-10-08'))).toBe(true);
    expect(describeLastBackup(day('2026-10-10'))).toMatch(/9 days ago/);
  });

  it('"Later" snoozes the reminder for three days', () => {
    snoozeBackupReminder(day('2026-10-04'));
    expect(backupOverdue(true, day('2026-10-06'))).toBe(false);
    expect(backupOverdue(true, day('2026-10-08'))).toBe(true);
  });

  it('names backup files by the local date', () => {
    // 1 AM local on 4 Oct must not become 3 Oct (the UTC date in India).
    expect(backupFilename(new Date(2026, 9, 4, 1, 0))).toBe('nirman-backup-2026-10-04.zip');
  });
});
