import { Appearance, AppState } from 'react-native';
import { ACCENTS, normalizeHex } from '@nirman/shared';
import { prefs } from '@nirman/core';
import Nirman from '../../modules/nirman-native';

export type ThemeChoice = 'system' | 'light' | 'dark';
/** Where the accent colour comes from, and how dark mode looks: the chosen colour, the wallpaper's, or pure black. */
export type ThemeStyle = 'standard' | 'wallpaper' | 'black';

const KEY = 'nirmaan_theme';
const ACCENT_KEY = 'nirmaan_accent';
const STYLE_KEY = 'nirmaan_theme_style';

export const DEFAULT_ACCENT = ACCENTS[0].hex;

export const themeChoice = (): ThemeChoice => prefs.get<ThemeChoice>(KEY, 'system');

/** Light or dark for the whole app (`useColorScheme()`, and so `useColors()`, follow it); "system" follows the phone. */
function apply(choice: ThemeChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

export function setThemeChoice(choice: ThemeChoice) {
  prefs.set(KEY, choice);
  apply(choice);
}

// --- Colour -------------------------------------------------------------------------------------
// `useColors()` (src/theme.ts) reads `look()` and is told when it changes.

export interface Look {
  /** The chosen colour, `#rrggbb`. */
  accent: string;
  style: ThemeStyle;
  /** The phone's wallpaper colour (Android 12+), or null. */
  wallpaper: string | null;
}

let current: Look = { accent: DEFAULT_ACCENT, style: 'standard', wallpaper: null };
const listeners = new Set<() => void>();

export const look = (): Look => current;

export function onLookChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function update(next: Partial<Look>) {
  current = { ...current, ...next };
  listeners.forEach((l) => l());
}

/** The colour the app is drawn in now: the wallpaper's when chosen and the phone has one, else the chosen colour. */
export const seedOf = (l: Look): string => (l.style === 'wallpaper' && l.wallpaper) || l.accent;

export function setAccent(hex: string) {
  const accent = normalizeHex(hex) ?? DEFAULT_ACCENT;
  prefs.set(ACCENT_KEY, accent);
  update({ accent });
}

export function setThemeStyle(style: ThemeStyle) {
  prefs.set(STYLE_KEY, style);
  update({ style });
}

function readWallpaper(): string | null {
  try {
    return normalizeHex(Nirman.systemAccent() ?? '');
  } catch {
    return null;
  }
}

/** At start: apply the saved choices, and read the wallpaper colour again whenever the app comes back (it may have changed). */
export function installTheme() {
  apply(themeChoice());
  current = {
    accent: normalizeHex(prefs.get<string>(ACCENT_KEY, DEFAULT_ACCENT)) ?? DEFAULT_ACCENT,
    style: prefs.get<ThemeStyle>(STYLE_KEY, 'standard'),
    wallpaper: readWallpaper(),
  };
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    const wallpaper = readWallpaper();
    if (wallpaper !== current.wallpaper) update({ wallpaper });
  });
}
