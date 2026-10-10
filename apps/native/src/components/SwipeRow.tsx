import { useRef, type ReactElement } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Swipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { haptic } from '../lib/haptics';
import { Icon, type IconName } from './ui/Icon';

export interface SwipeAction {
  icon: IconName;
  label: string;
  color: string;
  onPress(): void;
}

/**
 * A row that can be swiped to the right for one action (`left`, e.g. Delivered), as chats are in Telegram; the row
 * follows the finger and springs back. Deleting is a bin on the row (`TrashButton`), not a swipe.
 */
export function SwipeRow({ left, children }: { left: SwipeAction; children: ReactElement }) {
  const { width } = useWindowDimensions();
  const ref = useRef<SwipeableMethods>(null);
  const panel = (bg: string, icon: IconName, label: string) => (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, paddingHorizontal: 24, backgroundColor: bg }}>
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
      renderLeftActions={() => panel(left.color, left.icon, left.label)}
      onSwipeableOpen={(direction) => {
        if (direction !== SwipeDirection.RIGHT) return;
        haptic('confirm');
        left.onPress();
        ref.current?.close();
      }}
    >
      {children}
    </Swipeable>
  );
}
