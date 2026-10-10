import { ActivityIndicator, Text } from 'react-native';
import { Pressable } from './ui/Pressable';
import { NO_KEY_MESSAGE } from '@nirman/core';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { Icon, type IconName } from './ui/Icon';

/** Connection and reading status; tapping it opens Settings. */
export function StatusChip({ onPress }: { onPress?(): void }) {
  const c = useColors();
  const { status, settings, snapshot } = useAppState();
  const queued = snapshot.jobs.filter((j) => j.status !== 'failed').length;

  let icon: IconName = 'check-circle';
  let tint = c.green500;
  let label = 'Online';
  let busy = false;
  if (!status.online) {
    icon = 'cloud-off';
    tint = c.gray500;
    label = queued ? `Offline · ${queued} queued` : 'Offline';
  } else if (status.processing) {
    busy = true;
    tint = c.orange500;
    label = 'Reading…';
  } else if (queued && !settings.geminiApiKey && status.lastError === NO_KEY_MESSAGE) {
    icon = 'vpn-key';
    tint = c.orange500;
    label = 'Add API key';
  } else if (status.lastError) {
    icon = 'warning';
    tint = c.red500;
    label = queued ? `${queued} queued` : 'Reading problem';
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Status: ${label}`} onPress={onPress} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 20, borderColor: c.brandConcrete, backgroundColor: c.white }}>
      {busy ? <ActivityIndicator size={12} color={tint} /> : <Icon name={icon} size={14} color={tint} />}
      <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray500 }}>
        {label}
      </Text>
    </Pressable>
  );
}
