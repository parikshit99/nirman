import { describe, expect, it } from 'vitest';
import type { MaterialEntry } from '@nirman/shared';
import { sortMaterials } from '../src/lib/materialSort.ts';

const entry = (name: string, ...dates: string[]) =>
  ({ key: name, name, unit: 'piece', priceHistory: dates.map((date) => ({ date, timestamp: `${date}T10:00:00Z`, price: 10 })) }) as unknown as MaterialEntry;

describe('sortMaterials', () => {
  const list = [entry('cement', '2026-01-05', '2026-09-01'), entry('Angle valve', '2026-03-01'), entry('10 mm bar', '2026-06-01'), entry('2 mm wire', '2026-06-01')];
  const names = (s: Parameters<typeof sortMaterials>[1]) => sortMaterials(list, s).map((e) => e.name);

  it('sorts by the newest price of each material', () => {
    expect(names('newest')).toEqual(['cement', '2 mm wire', '10 mm bar', 'Angle valve']);
    expect(names('oldest')).toEqual(['Angle valve', '2 mm wire', '10 mm bar', 'cement']);
  });

  it('sorts by name ignoring case, with numbers in order', () => {
    expect(names('name')).toEqual(['2 mm wire', '10 mm bar', 'Angle valve', 'cement']);
    expect(names('nameDesc')).toEqual(['cement', 'Angle valve', '10 mm bar', '2 mm wire']);
  });
});
