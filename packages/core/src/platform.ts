/**
 * What core needs from the app it runs in. The app calls `configureCore` once,
 * before anything else; the defaults keep everything in memory (tests).
 */

/** Small values read and written at once (preferences, the problem log). Like `localStorage`. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Values kept encrypted on the phone (settings with the Gemini key). */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface CorePlatform {
  storage: KeyValueStore;
  secureStorage: SecureStore;
  randomUUID: () => string;
  /** App version, Android version, phone model…, shown in problem reports. */
  deviceInfo: () => Record<string, string>;
}

export function memoryStore(): KeyValueStore & SecureStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
  };
}

export const platform: CorePlatform = {
  storage: memoryStore(),
  secureStorage: memoryStore(),
  randomUUID: () => globalThis.crypto.randomUUID(),
  deviceInfo: () => ({ app: 'dev' }),
};

export function configureCore(options: Partial<CorePlatform>) {
  Object.assign(platform, options);
}
