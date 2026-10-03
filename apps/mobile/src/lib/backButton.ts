import { useEffect, useRef } from 'react';
import { isNative } from './platform.ts';

/**
 * Android's back button closes whatever is on top (a dialog, a sheet, a
 * full-screen view) instead of leaving the app. Open things register a handler
 * while they're shown; the most recently registered one runs.
 */
const handlers: (() => void)[] = [];

export function useBackHandler(onBack: () => void, active = true) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    const handler = () => latest.current();
    handlers.push(handler);
    return () => {
      const i = handlers.lastIndexOf(handler);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}

/** Returns true when an open view handled the press. */
export function handleBack(): boolean {
  const top = handlers.at(-1);
  if (!top) return false;
  top();
  return true;
}

/** With nothing open, back sends the app to the background (keeping its state) rather than closing it. */
export async function installBackButton() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (!handleBack()) void App.minimizeApp();
  });
}
