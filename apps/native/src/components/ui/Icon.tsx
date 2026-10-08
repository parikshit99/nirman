import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** One icon (Material, Android's own set). Colour is given by the caller: `useColors()`. */
export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  return <MaterialIcons name={name} size={size} color={color} />;
}
