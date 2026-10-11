import { describe, expect, it } from 'vitest';
import { formatQty, formatRupees } from '../src/format.ts';

describe('formatRupees and formatQty', () => {
  it('formats money the Indian way, in whole rupees or up to 2 decimals', () => {
    expect(formatRupees(123456.789)).toBe('₹1,23,456.79');
    expect(formatRupees(123456.5, { whole: true })).toBe('₹1,23,457');
    expect(formatRupees(Number.NaN)).toBe('₹0');
    expect(formatRupees(1500, { symbol: 'Rs. ' })).toBe('Rs. 1,500');
  });

  it('keeps up to 3 decimals in quantities', () => {
    expect(formatQty(1250.12549)).toBe('1,250.125');
    expect(formatQty(2)).toBe('2');
  });
});
