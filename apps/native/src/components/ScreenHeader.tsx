import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { StatusChip } from './StatusChip';
import { Icon } from './ui/Icon';
import { OverflowMenu, type MenuItem } from './ui/OverflowMenu';

/**
 * The top of every tab: the open project (everything below belongs to it), the status, and a ⋮ menu. `children` is a
 * second row, e.g. the total and Save.
 */
export function ScreenHeader({ onProject, onStatus, menu, children }: { onProject?(): void; onStatus?(): void; menu: MenuItem[]; children?: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { project } = useAppState();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.white, borderBottomWidth: 1, borderBottomColor: c.brandConcrete }}>
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Project: ${project?.name ?? ''}. Change project`} onPress={onProject} style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>Project</Text>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>
              {project?.name}
            </Text>
          </View>
          <Icon name="arrow-drop-down" size={22} color={c.gray500} />
        </Pressable>
        <StatusChip onPress={onStatus} />
        <OverflowMenu items={menu} />
      </View>
      {children ? <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>{children}</View> : null}
    </View>
  );
}
