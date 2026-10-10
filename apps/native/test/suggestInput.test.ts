import { describe, expect, it } from 'vitest';
import { matchSuggestions } from '../src/components/ui/suggest';

describe('matchSuggestions', () => {
  const vendors = ['AOE HARDWARE', 'Local', 'OBEROI ELECTRICALS', 'Shyam Wadhwa', 'shyam wadhwa', 'Rama krishna'];

  it('lists names starting with the typed text before names containing it, once each', () => {
    expect(matchSuggestions(vendors, 'sh').map((s) => s.value)).toEqual(['Shyam Wadhwa', 'Rama krishna']);
    expect(matchSuggestions(vendors, 'ra').map((s) => s.value)).toEqual(['Rama krishna']);
  });

  it('shows the first few when nothing is typed, and nothing once the field holds the only match', () => {
    expect(matchSuggestions(vendors, '', 3).map((s) => s.value)).toEqual(['AOE HARDWARE', 'Local', 'OBEROI ELECTRICALS']);
    expect(matchSuggestions(vendors, 'local ')).toEqual([]);
    expect(matchSuggestions(vendors, 'xyz')).toEqual([]);
  });

  it('keeps hints', () => {
    expect(matchSuggestions([{ value: 'Angle Valve', hint: 'piece' }], 'ang')).toEqual([{ value: 'Angle Valve', hint: 'piece' }]);
  });
});
