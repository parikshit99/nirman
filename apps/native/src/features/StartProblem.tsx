import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackupError, backupFilename, writeBackupZip, logError, parseBackupFile, recordBackup, type BackupFile } from '@nirman/core';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { openNirmanDb } from '../data/db';
import type { StartProblem as Problem } from '../data/startup';
import { pickBackupFile } from '../lib/backupFile';
import { shareBackupZip } from '../lib/files';
import { plural } from '../lib/format';
import { useColors } from '../theme';

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1048576))} MB`;

const TEXT: Record<Problem['kind'], { title: string; body: (p: Problem) => string }> = {
  missing: {
    title: 'Your data was not found',
    body: () =>
      'The app was updated, but the purchase lists from before the update could not be found on this phone. Nothing has been changed. Restore your latest backup to carry on with your data.',
  },
  'no-space': {
    title: 'Save a backup first',
    body: (p) =>
      p.kind === 'no-space'
        ? `Before the update opens your data, it keeps a copy of it on the phone, in case anything goes wrong. There isn't enough free space for that copy (it needs ${mb(p.size * 2)}, ${mb(p.free)} free). Save a backup to Google Drive or WhatsApp first, or free some space and open the app again.`
        : '',
  },
  damaged: {
    title: "Your data couldn't be opened",
    body: (p) =>
      `The data on this phone failed its check${p.kind === 'damaged' && p.detail ? ` (${p.detail.slice(0, 200)})` : ''}. Nothing has been deleted. Restore your latest backup to carry on; the data as it was is kept on the phone.`,
  },
};

/**
 * Shown instead of the app when the data can't be opened on start: say so, and offer Restore from backup, so the app
 * never starts empty without the user knowing.
 */
export function StartProblem({ problem, onRestore, onContinue }: { problem: Problem; onRestore(file: BackupFile | null): Promise<void>; onContinue(opts: { withoutCopy?: boolean; allowEmpty?: boolean }): void }) {
  const c = useColors();
  const dialogs = useDialogs();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const text = TEXT[problem.kind];

  const restore = async () => {
    try {
      const bytes = await pickBackupFile();
      if (!bytes) return;
      const file = parseBackupFile(bytes);
      const saved = file.backup.lists.filter((l) => l.status === 'saved').length;
      const ok = await dialogs.confirm('Restore this backup?', {
        message: `The backup from ${new Date(file.backup.exported_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}: ${plural(saved, 'saved list')}, ${plural(file.backup.items.length, 'item')}.`,
        confirmLabel: 'Restore',
      });
      if (!ok) return;
      setBusy(true);
      await onRestore(file);
    } catch (err) {
      logError(err, 'restore on start');
      setBusy(false);
      await dialogs.alert('Could not restore', err instanceof BackupError ? err.message : (err as Error).message);
    }
  };

  const saveBackup = async () => {
    setBusy(true);
    try {
      const db = await openNirmanDb();
      try {
        await shareBackupZip(backupFilename(), (write) => writeBackupZip(db, write));
        recordBackup();
      } finally {
        await db.close();
      }
      const go = await dialogs.confirm('Backup saved?', { message: 'Open the app once the backup is saved to Google Drive, WhatsApp or email.', confirmLabel: 'Open the app', cancelLabel: 'Not yet' });
      if (go) onContinue({ withoutCopy: true });
      else setBusy(false);
    } catch (err) {
      logError(err, 'backup on start');
      setBusy(false);
      await dialogs.alert('Backup failed', (err as Error).message);
    }
  };

  const startEmpty = async () => {
    const ok = await dialogs.confirm('Start with no data?', {
      message:
        problem.kind === 'missing'
          ? 'Only if you had nothing in the app before the update. You can still restore a backup later from Settings.'
          : 'The data on this phone is set aside (not deleted) and the app starts empty. You can still restore a backup later from Settings.',
      confirmLabel: 'Start with no data',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onRestore(null);
    } catch (err) {
      setBusy(false);
      await dialogs.alert('Could not start', (err as Error).message);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.brandGray }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Icon name={problem.kind === 'no-space' ? 'sd-card-alert' : 'warning'} size={40} color={problem.kind === 'no-space' ? c.orange500 : c.red600} />
        <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: c.brandDark, textAlign: 'center' }}>
          {text.title}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.gray600, textAlign: 'center' }}>{text.body(problem)}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={c.brandPrimary} />
      ) : problem.kind === 'no-space' ? (
        <View style={{ gap: 12 }}>
          <Button variant="primary" icon="backup" block onPress={saveBackup}>
            Save backup
          </Button>
          <Button
            variant="ghost"
            block
            onPress={async () => {
              const ok = await dialogs.confirm('Open without a copy?', { message: 'Your data is opened and updated without a copy kept on the phone.', confirmLabel: 'Open the app' });
              if (ok) onContinue({ withoutCopy: true });
            }}
          >
            Open without a copy
          </Button>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Button variant="primary" icon="restore" block onPress={restore}>
            Restore from backup
          </Button>
          <Button variant="ghost" block onPress={startEmpty}>
            Start with no data
          </Button>
        </View>
      )}
    </ScrollView>
  );
}
