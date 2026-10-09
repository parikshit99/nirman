import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { haptic } from '../lib/haptics';
import { useColors } from '../theme';
import { Icon, type IconName } from './ui/Icon';

export interface FabAction {
  icon: IconName;
  label: string;
  onPress(): void;
  /** `primary`: the accent colour (Save); `danger`: red (Clear). */
  tone?: 'primary' | 'danger';
}

/**
 * The bottom-right buttons of a list, as in Telegram: the main one (Add) and, stacked above it, a small one that pops
 * up the list's other actions (Save, Share, Preview, Clear) one after another. Both slide away while the list is
 * scrolled down and come back when it is scrolled up (`hidden`).
 */
export function ActionFab({ label, icon = 'add', onPress, showMain = true, actions, actionsLabel, hidden }: { label: string; icon?: IconName; onPress(): void; showMain?: boolean; actions: FabAction[]; actionsLabel: string; hidden: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const items = useRef<Animated.Value[]>([]).current;
  while (items.length < actions.length) items.push(new Animated.Value(0));

  // Away while scrolling down; never while the actions are open.
  useEffect(() => {
    Animated.timing(slide, { toValue: hidden && !open ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [hidden, open, slide]);

  useEffect(() => {
    const shown = items.slice(0, actions.length);
    if (open) {
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: 180, useNativeDriver: true }),
        // The nearest action first, the rest following just behind, each with a little spring.
        Animated.stagger(
          45,
          [...shown].reverse().map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true })),
        ),
      ]).start();
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        setOpen(false);
        return true;
      });
      return () => back.remove();
    }
    Animated.parallel([Animated.timing(scrim, { toValue: 0, duration: 150, useNativeDriver: true }), ...shown.map((v) => Animated.timing(v, { toValue: 0, duration: 120, useNativeDriver: true }))]).start();
  }, [open, actions.length, items, scrim]);

  // Nothing to offer any more (the list was cleared): close.
  useEffect(() => {
    if (actions.length === 0) setOpen(false);
  }, [actions.length]);

  const away = { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 160] }) }], opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const run = (action: FabAction) => {
    setOpen(false);
    action.onPress();
  };

  return (
    <>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: scrim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={() => setOpen(false)} />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', right: 16, bottom: 16, alignItems: 'flex-end', gap: 12 }, away]}>
        {actions.map((action, i) => {
          const v = items[i];
          const fg = action.tone === 'primary' ? c.onPrimary : action.tone === 'danger' ? '#fff' : c.gray800;
          const bg = action.tone === 'primary' ? c.brandPrimary : action.tone === 'danger' ? c.red600 : c.white;
          return (
            <Animated.View
              key={action.label}
              pointerEvents={open ? 'auto' : 'none'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 4, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}
            >
              <Text style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden', fontSize: 14, fontWeight: '700', color: c.brandDark, backgroundColor: c.white, elevation: 3 }}>{action.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => run(action)}
                style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: pressed ? 0.8 : 1, elevation: 4 })}
              >
                <Icon name={action.icon} size={22} color={fg} />
              </Pressable>
            </Animated.View>
          );
        })}
        {actions.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? 'Close' : actionsLabel}
            accessibilityState={{ expanded: open }}
            onPress={() => {
              haptic('tick');
              setOpen((o) => !o);
            }}
            style={({ pressed }) => ({ width: 48, height: 48, marginRight: 4, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.gray100 : c.white, elevation: 4 })}
          >
            <Animated.View style={{ transform: [{ rotate: scrim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>
              <Icon name={open ? 'close' : 'ios-share'} size={22} color={c.gray700} />
            </Animated.View>
          </Pressable>
        )}
        {showMain && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => {
              haptic('tap');
              setOpen(false);
              onPress();
            }}
            style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.orange600 : c.brandPrimary, elevation: 6 })}
          >
            <Icon name={icon} size={26} color={c.onPrimary} />
          </Pressable>
        )}
      </Animated.View>
    </>
  );
}

/** The bottom-right buttons (ActionFab) slide away while a list is scrolled down, and come back on the way up. */
export function useHideOnScroll(): [boolean, (y: number) => void] {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const onScroll = useCallback((y: number) => {
    const dy = y - lastY.current;
    if (Math.abs(dy) < 8) return;
    lastY.current = y;
    setHidden(dy > 0 && y > 48);
  }, []);
  return [hidden, onScroll];
}
