import { platform } from '../platform.ts';

/**
 * How bills are read: `auto` reads on the phone first and asks Gemini only
 * when unsure (or not at all without a key); `phone` never uses Gemini;
 * `gemini` always does.
 */
export type ReadingMode = 'auto' | 'phone' | 'gemini';

export interface Settings {
  geminiApiKey: string;
  geminiModel: string;
  readingMode: ReadingMode;
  /** Keep bill photos with their final lines, to train an on-phone model later. */
  collectTraining: boolean;
}

export const DEFAULT_MODEL = 'gemini-3-flash-preview';
export const DEFAULT_SETTINGS: Settings = { geminiApiKey: '', geminiModel: DEFAULT_MODEL, readingMode: 'auto', collectTraining: false };

const KEY = 'nirmaan_settings';

/**
 * Settings (including the Gemini API key) live in the app's secure storage
 * (Android Keystore-backed on the phone).
 */
export const settingsStore = {
  async load(): Promise<Settings> {
    try {
      const raw = await platform.secureStorage.get(KEY);
      return typeof raw === 'string' ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  async save(settings: Settings): Promise<void> {
    await platform.secureStorage.set(KEY, JSON.stringify(settings));
  },
};
