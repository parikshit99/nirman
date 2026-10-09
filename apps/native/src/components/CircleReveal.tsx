import { useCallback, useState } from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASE_OUT } from '../lib/motion';

interface Reveal {
  x: number;
  y: number;
  color: string;
  apply(): void;
}

/**
 * Telegram's switch between light and dark: a circle of the new background spreads from the finger to cover the
 * screen, the theme changes under it, and it fades away. `start(x, y, color, apply)` with the touch's page position,
 * the new mode's background colour, and what changes the theme. Render `overlay` once, anywhere.
 */
export function useCircleReveal() {
  const { width, height } = useWindowDimensions();
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const grow = useSharedValue(0);
  const fade = useSharedValue(1);

  const finish = useCallback(() => setReveal(null), []);
  const swapped = useCallback(
    (r: Reveal) => {
      r.apply();
      // Let the app redraw in the new colours under the circle, then lift it.
      setTimeout(() => {
        fade.value = withTiming(0, { duration: DURATION.normal }, (done) => {
          if (done) runOnJS(finish)();
        });
      }, 60);
    },
    [fade, finish],
  );

  const start = useCallback(
    (x: number, y: number, color: string, apply: () => void) => {
      const r = { x, y, color, apply };
      grow.value = 0;
      fade.value = 1;
      setReveal(r);
      grow.value = withTiming(1, { duration: 420, easing: EASE_OUT }, (done) => {
        if (done) runOnJS(swapped)(r);
      });
    },
    [grow, fade, swapped],
  );

  // Big enough to reach the farthest corner from the finger.
  const radius = reveal ? Math.max(Math.hypot(reveal.x, reveal.y), Math.hypot(width - reveal.x, reveal.y), Math.hypot(reveal.x, height - reveal.y), Math.hypot(width - reveal.x, height - reveal.y)) : 0;
  const circle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: Math.max(0.01, grow.value) }] }));

  const overlay = (
    <Modal visible={!!reveal} transparent animationType="none" statusBarTranslucent navigationBarTranslucent>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {reveal && <Animated.View style={[{ position: 'absolute', left: reveal.x - radius, top: reveal.y - radius, width: radius * 2, height: radius * 2, borderRadius: radius, backgroundColor: reveal.color }, circle]} />}
      </View>
    </Modal>
  );
  return { overlay, start };
}
