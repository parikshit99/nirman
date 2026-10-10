import { useRef, type ReactElement } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Swipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { haptic } from '../lib/haptics';
import { useColors } from '../theme';
import { Icon, type IconName } from './ui/Icon';

export interface SwipeAction {
  icon: IconName;
  label: string;
  color: string;
  onPress(): void;
}

/**
 * A row that can be swiped, as chats are in Telegram: to the left, past a third of its width (or a quick flick), deletes
 * it (the caller shows the Undo strip); to the right, `left` if given (e.g. Delivered), and the row springs back. The
 * row follows the finger one to one, as in Gmail.
 */
export function SwipeRow({ onDelete, left, children }: { onDelete(): void; left?: SwipeAction; children: ReactElement }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const ref = useRef<SwipeableMethods>(null);
  const panel = (bg: string, icon: IconName, label: string, side: 'left' | 'right') => (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', justifyContent: side === 'left' ? 'flex-start' : 'flex-end', gap: 8, paddingHorizontal: 24, backgroundColor: bg }}>
      <Icon name={icon} size={22} color="#fff" />
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{label}</Text>
    </View>
  );
  return (
    <Swipeable
      ref={ref}
      friction={1}
      overshootFriction={8}
      leftThreshold={96}
      rightThreshold={width / 3}
      renderLeftActions={left ? () => panel(left.color, left.icon, left.label, 'left') : undefined}
      renderRightActions={() => panel(c.red600, 'delete-outline', 'Delete', 'right')}
      onSwipeableOpen={(direction) => {
        haptic('confirm');
        if (direction === SwipeDirection.RIGHT) {
          left?.onPress();
          ref.current?.close();
        } else {
          onDelete();
        }
      }}
    >
      {children}
    </Swipeable>
  );
}
