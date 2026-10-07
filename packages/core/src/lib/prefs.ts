import { platform } from '../platform.ts';

/** Small per-device UI preferences. Storage can be unavailable, so never rely on it. */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = platform.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      platform.storage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  },
};
