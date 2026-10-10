import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASE_OUT } from '../../lib/motion';
import { haptic } from '../../lib/haptics';
import { useColors } from '../../theme';

/** A row of tabs or filter options, one selected. */
export function Tabs<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: string }[]; value: T; onChange(id: T): void; label: string }) {
  const c = useColors();
  // The white pill slides to the picked tab (as Telegram's tab indicators do) instead of jumping.
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const tabWidth = options.length ? width / options.length : 0;
  const x = useSharedValue(index * tabWidth);
  useEffect(() => {
    x.value = withTiming(index * tabWidth, { duration: DURATION.normal, easing: EASE_OUT });
  }, [index, tabWidth, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.bar, { backgroundColor: c.gray100, borderColor: c.gray200 }]}>
      <View pointerEvents="none" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.track}>
        {width > 0 && <Animated.View style={[styles.pill, { width: tabWidth, backgroundColor: c.white }, pill]} />}
      </View>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) haptic('tick');
              onChange(o.id);
            }}
            style={styles.tab}
          >
            <Text numberOfLines={1} style={[styles.text, { color: on ? c.brandDark : c.gray500 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', padding: 4, borderRadius: 8, borderWidth: 1 },
  track: { position: 'absolute', top: 4, right: 4, bottom: 4, left: 4 },
  pill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6 },
  tab: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14, fontWeight: '600' },
});
