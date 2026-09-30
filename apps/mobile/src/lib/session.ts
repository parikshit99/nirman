import { isNative } from './platform.ts';

export interface Session {
  server_url: string;
  user: { id: string; email: string };
  access_token: string;
  refresh_token: string;
}

const KEY = 'nirmaan_session';

/**
 * Tokens live in the Android Keystore-backed secure storage on the phone and
 * in localStorage in the browser dev build.
 */
export const sessionStore = {
  async get(): Promise<Session | null> {
    try {
      if (isNative) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        const raw = await SecureStorage.get(KEY, false);
        return typeof raw === 'string' ? (JSON.parse(raw) as Session) : null;
      }
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  async set(session: Session): Promise<void> {
    const raw = JSON.stringify(session);
    if (isNative) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.set(KEY, raw, false);
    } else {
      localStorage.setItem(KEY, raw);
    }
  },
  async clear(): Promise<void> {
    if (isNative) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.remove(KEY);
    } else {
      localStorage.removeItem(KEY);
    }
  },
};

export const DEFAULT_SERVER_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8080';
