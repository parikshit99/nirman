import { useState } from 'react';
import { Text, View } from 'react-native';
import { backupOverdue, describeLastBackup, snoozeBackupReminder } from '@nirman/core';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { Icon } from './ui/Icon';
import { Pressable } from './ui/Pressable';

/**
 * Under the header of every tab, once there is data and no backup for a week: when the last one was, *Back up*
 * (Settings, where *Save backup* is) and ✕ to be reminded again in 3 days. Checked again whenever the header is
 * drawn, e.g. after Settings closes.
 */
export function BackupReminder({ onBackUp }: { onBackUp(): void }) {
  const c = useColors();
  const { snapshot } = useAppState();
  const [, setSnoozed] = useState(0);
  const hasData = snapshot.items.length > 0 || snapshot.contracts.length > 0;
  if (!backupOverdue(hasData)) return null;
  return (
    <View
      accessibilityRole="summary"
      style={{ marginHorizontal: 16, marginBottom: 8, paddingLeft: 12, borderRadius: 8, backgroundColor: c.orange50, borderWidth: 1, borderColor: c.orange200, flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, color: c.orange800 }}>
        Last backup: <Text style={{ fontWeight: '700' }}>{describeLastBackup()}</Text>
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Back up now" onPress={onBackUp} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.orange700, textDecorationLine: 'underline' }}>Back up</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remind me later"
        onPress={() => {
          snoozeBackupReminder();
          setSnoozed((n) => n + 1);
        }}
        android_ripple={{ color: c.ripple, borderless: true, radius: 22 }}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="close" size={18} color={c.orange700} />
      </Pressable>
    </View>
  );
}
