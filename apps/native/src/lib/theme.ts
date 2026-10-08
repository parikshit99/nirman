import { Appearance } from 'react-native';
import { prefs } from '@nirman/core';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'nirmaan_theme';

export const themeChoice = (): ThemeChoice => prefs.get<ThemeChoice>(KEY, 'system');

/** Light or dark for the whole app (`useColorScheme()`, and so `useColors()`, follow it); "system" follows the phone. */
function apply(choice: ThemeChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

export function setThemeChoice(choice: ThemeChoice) {
  prefs.set(KEY, choice);
  apply(choice);
}

/** At start: apply the saved choice. */
export const installTheme = () => apply(themeChoice());
