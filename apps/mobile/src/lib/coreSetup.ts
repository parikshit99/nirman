import { configureCore, logError } from '@nirman/core';
import { isNative } from './platform.ts';
import { APP_VERSION } from './version.ts';

// Imported first by main.tsx, so core is set up before anything uses it.
configureCore({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
  // Android Keystore-backed on the phone, localStorage in the browser dev build.
  secureStorage: {
    async get(key) {
      if (!isNative) return localStorage.getItem(key);
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      const value = await SecureStorage.get(key, false);
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      if (!isNative) return localStorage.setItem(key, value);
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.set(key, value, false);
    },
  },
  randomUUID: () => crypto.randomUUID(),
  deviceInfo() {
    const ua = navigator.userAgent;
    return {
      app: APP_VERSION,
      android: /Android ([\d.]+)/.exec(ua)?.[1] ?? 'n/a',
      phone: /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*/, '') ?? 'n/a',
      webview: /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? 'n/a',
      screen: `${window.screen.width}×${window.screen.height}`,
    };
  },
});

/** Catch errors nothing else handled. */
export function installErrorHandlers() {
  window.addEventListener('error', (e) => logError(e.error ?? e.message, 'window'));
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'promise'));
}
