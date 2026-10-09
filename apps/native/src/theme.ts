import { useMemo, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import { ORANGE, accentShades, textOn, type AccentShades } from '@nirman/shared';
import { DEFAULT_ACCENT, look, onLookChange, seedOf, type Look } from './lib/theme';

// The colours of the 6.x app's index.css (Tailwind's palette and the brand), as hex: React Native has no oklch.
// Dark mode redefines the same names, as `:root.dark` does there; shades it doesn't list keep their light value.
// Generated once from those files; when a dark shade is added there, add it here too.

export const light = {
  ...ORANGE.light,
  /** Text and icons on brandPrimary and orange500 (buttons, the Add button, picked chips). */
  onPrimary: '#ffffff',
  white: '#ffffff',
  brandDark: '#121212',
  brandGray: '#f5f5f5',
  brandConcrete: '#e4e3e0',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5dc',
  gray400: '#99a1af',
  gray500: '#6a7282',
  gray600: '#4a5565',
  gray700: '#364153',
  gray800: '#1e2939',
  gray900: '#101828',
  red50: '#fef2f2',
  red100: '#ffe2e2',
  red200: '#ffc9c9',
  red300: '#ffa2a2',
  red400: '#ff6467',
  red500: '#fb2c36',
  red600: '#e7000b',
  red700: '#c10007',
  red800: '#9f0712',
  red900: '#82181a',
  green50: '#f0fdf4',
  green100: '#dcfce7',
  green200: '#b9f8cf',
  green300: '#7bf1a8',
  green400: '#05df72',
  green500: '#00c950',
  green600: '#00a63e',
  green700: '#008236',
  green800: '#016630',
  green900: '#0d542b',
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue200: '#bedbff',
  blue300: '#8ec5ff',
  blue400: '#51a2ff',
  blue500: '#2b7fff',
  blue600: '#155dfc',
  blue700: '#1447e6',
  blue800: '#193cb8',
  blue900: '#1c398e',
};

export type Colors = typeof light;

export const dark: Colors = {
  ...light,
  ...ORANGE.dark,
  onPrimary: '#16181c',
  white: '#16181c',
  brandGray: '#0c0d10',
  brandDark: '#eaebed',
  brandConcrete: '#313337',
  gray50: '#1f2227',
  gray100: '#26292e',
  gray200: '#35383e',
  gray300: '#494d55',
  gray400: '#757a85',
  gray500: '#999ea9',
  gray600: '#b4b7bf',
  gray700: '#caced4',
  gray800: '#dcdee2',
  gray900: '#edeef1',
  red50: '#3b1c1c',
  red100: '#4e2021',
  red200: '#7a3336',
  red700: '#ff8382',
  green50: '#122d1d',
  green100: '#123923',
  green200: '#185b37',
  green700: '#52cd7d',
  green800: '#8ce1a4',
  blue50: '#17273c',
  blue100: '#1d3451',
  blue600: '#76b4ff',
  blue700: '#98c7ff',
  blue800: '#aed4ff',
};

// The orange shades (and brandPrimary) are Nirman's orange, or are worked out from the colour chosen in Settings →
// Appearance (packages/shared/src/palette.ts). Pure black turns dark mode's backgrounds black (OLED screens).

const cache = new Map<string, Colors>();

/** The palette for light or dark mode in the chosen look. */
export function paletteFor(mode: 'light' | 'dark', l: Look): Colors {
  const seed = seedOf(l);
  const black = mode === 'dark' && l.style === 'black';
  const key = `${mode}|${seed}|${black}`;
  let colors = cache.get(key);
  if (!colors) {
    const base = mode === 'dark' ? dark : light;
    const shades: AccentShades = accentShades(seed, ORANGE[mode], base.white);
    colors = {
      ...base,
      ...shades,
      // Nirman's orange keeps its usual text colour; any other colour gets white or near-black, whichever reads.
      onPrimary: seed === DEFAULT_ACCENT ? base.onPrimary : textOn(shades),
      ...(black && { white: '#000000', brandGray: '#000000', gray50: '#101114' }),
    };
    cache.set(key, colors);
  }
  return colors;
}

/** The palette for the phone's (or the app's) light or dark setting, in the colour chosen in Settings. */
export function useColors(): Colors {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const l = useSyncExternalStore(onLookChange, look);
  return useMemo(() => paletteFor(mode, l), [mode, l]);
}
