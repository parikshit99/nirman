import { isNative } from './platform.ts';

export interface Settings {
  geminiApiKey: string;
  geminiModel: string;
}

export const DEFAULT_MODEL = 'gemini-3-flash-preview';
export const DEFAULT_SETTINGS: Settings = { geminiApiKey: '', geminiModel: DEFAULT_MODEL };

const KEY = 'nirmaan_settings';

/**
 * Settings (including the Gemini API key) live in Android Keystore-backed
 * secure storage on the phone, and in localStorage in the browser dev build.
 */
export const settingsStore = {
  async load(): Promise<Settings> {
    try {
      let raw: unknown;
      if (isNative) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        raw = await SecureStorage.get(KEY, false);
      } else {
        raw = localStorage.getItem(KEY);
      }
      return typeof raw === 'string' ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  async save(settings: Settings): Promise<void> {
    const raw = JSON.stringify(settings);
    if (isNative) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.set(KEY, raw, false);
    } else {
      localStorage.setItem(KEY, raw);
    }
  },
};
