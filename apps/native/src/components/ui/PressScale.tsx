import { forwardRef } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SPRING } from '../../lib/motion';

// Where a pressable sits in its parent (kept on the outer, scaling view); everything else styles the pressable.
const LAYOUT_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'position', 'top', 'right', 'bottom', 'left', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginHorizontal', 'marginVertical', 'width', 'maxWidth', 'minWidth', 'zIndex'] as const;

function split(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = { ...flat };
  for (const key of LAYOUT_KEYS) {
    if (key in inner) {
      outer[key] = inner[key];
      delete inner[key];
    }
  }
  // A width set on the outer view is filled by the pressable.
  if ('width' in outer || 'flex' in outer || 'flexGrow' in outer || outer.alignSelf === 'stretch') inner.alignSelf = 'stretch';
  return [outer as ViewStyle, inner as ViewStyle];
}

/**
 * A Pressable that shrinks a little while held and springs back when let go, as buttons do in Telegram. Takes the
 * same props as Pressable; `scaleTo` is how small it gets (0.96 for buttons, 0.98 for wide cards).
 */
export const PressScale = forwardRef<View, PressableProps & { scaleTo?: number; style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>) }>(function PressScale(
  { scaleTo = 0.96, style, onPressIn, onPressOut, disabled, ...props },
  ref,
) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // The outer view takes the layout of the unpressed style; a pressed style may only change colours.
  const [outer] = split(typeof style === 'function' ? style({ pressed: false } as PressableStateCallbackType) : style);
  return (
    <Animated.View style={[outer, anim]}>
      <Pressable
        ref={ref}
        disabled={disabled}
        onPressIn={(e) => {
          scale.value = withSpring(scaleTo, SPRING);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, SPRING);
          onPressOut?.(e);
        }}
        style={(state) => split(typeof style === 'function' ? style(state) : style)[1]}
        {...props}
      />
    </Animated.View>
  );
});
