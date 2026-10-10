import { forwardRef } from 'react';
import { Pressable as NativePressable, type PressableProps, type View } from 'react-native';
import { useColors } from '../../theme';

/**
 * React Native's Pressable with Android's ripple, drawn over the content. Use it for everything that can be tapped.
 * Pass `android_ripple` with `c.rippleOnPrimary` or `c.rippleOnDanger` on coloured backgrounds, or `null` for an
 * area that shouldn't ripple (a backdrop).
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable({ android_ripple, ...props }, ref) {
  const c = useColors();
  const ripple = android_ripple === undefined ? { color: c.ripple, foreground: true } : (android_ripple ?? undefined);
  return <NativePressable ref={ref} android_ripple={ripple} {...props} />;
});
