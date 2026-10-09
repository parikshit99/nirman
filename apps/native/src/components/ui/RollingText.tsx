import { useEffect } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASE_OUT } from '../../lib/motion';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** One digit place: a strip of 0–9 behind a window one line high, rolled to the digit shown. */
function Digit({ digit, lineHeight, style }: { digit: number; lineHeight: number; style: TextStyle }) {
  const y = useSharedValue(-digit * lineHeight);
  useEffect(() => {
    y.value = withTiming(-digit * lineHeight, { duration: DURATION.screen, easing: EASE_OUT });
  }, [digit, lineHeight, y]);
  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={strip}>
        {DIGITS.map((d) => (
          <Text key={d} style={[style, { lineHeight, height: lineHeight }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Text whose digits roll to their new value when it changes, as Telegram's counters do (totals, prices). Places are
 * matched from the right, so ₹9,500 → ₹10,200 rolls the hundreds and adds a place. Use a monospace font so the width
 * doesn't jump.
 */
export function RollingText({ children, style, lineHeight }: { children: string; style: TextStyle; lineHeight: number }) {
  const chars = [...children];
  return (
    <View accessible accessibilityLabel={children} style={{ flexDirection: 'row' }}>
      {chars.map((ch, i) => {
        const place = chars.length - i;
        return /[0-9]/.test(ch) ? <Digit key={place} digit={Number(ch)} lineHeight={lineHeight} style={style} /> : <Text key={`${place}${ch}`} style={[style, { lineHeight }]}>{ch}</Text>;
      })}
    </View>
  );
}
