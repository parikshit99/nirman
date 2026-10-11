import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { getItemAsync, setItemAsync } from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { Dimensions, Platform } from 'react-native';
import { configureCore, logError } from '@nirman/core';

export const APP_VERSION: string = Constants.expoConfig?.version ?? 'dev';

// Imported first by index.ts, so core is set up before anything uses it.
configureCore({
  // Small preferences and the problem log (the Capacitor app kept these in the WebView, which this app can't read).
  storage: {
    getItem: (key) => Storage.getItemSync(key),
    setItem: (key, value) => Storage.setItemSync(key, value),
  },
  // Android Keystore-backed: the Gemini key.
  secureStorage: {
    get: (key) => getItemAsync(key),
    set: (key, value) => setItemAsync(key, value),
  },
  randomUUID: () => randomUUID(),
  deviceInfo() {
    const { width, height } = Dimensions.get('screen');
    const constants = Platform.constants as { Release?: string; Model?: string };
    return {
      app: APP_VERSION,
      android: constants.Release ?? String(Platform.Version),
      phone: constants.Model ?? 'n/a',
      screen: `${Math.round(width)}×${Math.round(height)}`,
    };
  },
});

/** Catch errors nothing else handled. */
export function installErrorHandlers() {
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(fn: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  const previous = utils?.getGlobalHandler();
  utils?.setGlobalHandler((error, fatal) => {
    logError(error, fatal ? 'fatal' : 'window');
    previous?.(error, fatal);
  });
}
