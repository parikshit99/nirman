import type { MaterialEntry } from '@nirman/shared';
import { prefs } from './prefs.ts';

export type MaterialSort = 'newest' | 'oldest' | 'name' | 'nameDesc';

export const MATERIAL_SORTS: { id: MaterialSort; label: string; short: string; about: string }[] = [
  { id: 'newest', label: 'Newest price first', short: 'Newest', about: 'Materials with the most recent price at the top' },
  { id: 'oldest', label: 'Oldest price first', short: 'Oldest', about: 'Materials not bought for the longest time at the top' },
  { id: 'name', label: 'Name A–Z', short: 'A–Z', about: 'Alphabetical' },
  { id: 'nameDesc', label: 'Name Z–A', short: 'Z–A', about: 'Alphabetical, from the end' },
];

const SORT_KEY = 'nirmaan_rates_sort';
export const savedMaterialSort = (): MaterialSort => {
  const s = prefs.get<string>(SORT_KEY, 'newest');
  return MATERIAL_SORTS.some((o) => o.id === s) ? (s as MaterialSort) : 'newest';
};
export const saveMaterialSort = (s: MaterialSort) => prefs.set(SORT_KEY, s);

/** When the newest price of a material was recorded (0 with none). */
function lastPriceTime(e: MaterialEntry): number {
  const p = e.priceHistory.at(-1);
  if (!p) return 0;
  return new Date(p.date).getTime() || new Date(p.timestamp).getTime() || 0;
}

export function sortMaterials(entries: readonly MaterialEntry[], sort: MaterialSort): MaterialEntry[] {
  const byName = (a: MaterialEntry, b: MaterialEntry) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }) || a.unit.localeCompare(b.unit);
  const list = [...entries];
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => lastPriceTime(b) - lastPriceTime(a) || byName(a, b));
    case 'oldest':
      return list.sort((a, b) => lastPriceTime(a) - lastPriceTime(b) || byName(a, b));
    case 'name':
      return list.sort(byName);
    case 'nameDesc':
      return list.sort((a, b) => byName(b, a));
  }
}
