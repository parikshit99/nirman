import { isNative } from './platform.ts';
import { prefs } from '@nirman/core';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'nirmaan_theme';
const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

export const themeChoice = (): ThemeChoice => prefs.get<ThemeChoice>(KEY, 'system');

/** Puts `dark` on <html> (index.css redefines the colours) and matches the Android status bar icons. */
function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  if (isNative) {
    void import('@capacitor/core')
      .then(({ SystemBars, SystemBarsStyle }) => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }))
      .catch(() => {});
  }
}

export function setThemeChoice(choice: ThemeChoice) {
  prefs.set(KEY, choice);
  apply(choice);
}

/** At start: apply the saved choice, and follow the phone's setting when it is "system". */
export function installTheme() {
  apply(themeChoice());
  if (typeof matchMedia === 'undefined') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeChoice() === 'system') apply('system');
  });
}
