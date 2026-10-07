import { DEFAULT_CONVERSIONS, type ConversionSettings } from '@nirman/shared';
import { prefs } from './prefs.ts';

const KEY = 'nirmaan_conversions';

/** Bars per bundle, bar length and tile / ACP sizes, as edited in Settings (defaults otherwise). */
export function loadConversions(): ConversionSettings {
  const saved = prefs.get<Partial<ConversionSettings>>(KEY, {});
  return {
    bundleBars: { ...DEFAULT_CONVERSIONS.bundleBars, ...saved.bundleBars },
    barLength: saved.barLength && saved.barLength > 0 ? saved.barLength : DEFAULT_CONVERSIONS.barLength,
    tileSizes: saved.tileSizes?.length ? saved.tileSizes : DEFAULT_CONVERSIONS.tileSizes,
    acpSizes: saved.acpSizes?.length ? saved.acpSizes : DEFAULT_CONVERSIONS.acpSizes,
  };
}

export const saveConversions = (settings: ConversionSettings) => prefs.set(KEY, settings);
export const resetConversions = () => prefs.set(KEY, {});
