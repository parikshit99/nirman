import { describe, expect, it } from 'vitest';
import { matchQuoteLines, type ExtractedMaterial } from '../src/index.ts';

const read = (item_name: string, unit_price: number, over: Partial<ExtractedMaterial> = {}): ExtractedMaterial => ({
  item_name, original_term: item_name, quantity: 0, unit: 'Bag', unit_price, total_amount: 0, vendor: '', date: '', brand: '', model: '', spec: '', color: '', ordered_as: '', ...over,
});

describe('matchQuoteLines (on the phone)', () => {
  const boq = [
    { sr: 1, item_name: 'OPC Cement 53 grade' },
    { sr: 2, item_name: 'TMT bar 12 mm', original_term: 'sariya 12mm' },
    { sr: 3, item_name: 'TMT bar 16 mm' },
    { sr: 4, item_name: 'River sand' },
  ];

  it('pairs each line with the BOQ item it names, sizes included, and leaves the rest for review', () => {
    const { lines, matched } = matchQuoteLines(
      boq,
      [read('Cement OPC 53 grade', 380), read('TMT Bar 16mm', 62, { unit: 'kg' }), read('Sariya 12mm', 64, { unit: 'kg' }), read('Bricks', 9, { unit: 'nos' })],
      {},
    );
    expect(lines.map((l) => [l.original_term, l.boq_sr, l.unit_price])).toEqual([
      ['Cement OPC 53 grade', 1, 380],
      ['TMT Bar 16mm', 3, 62],
      ['Sariya 12mm', 2, 64],
      ['Bricks', null, 9],
    ]);
    expect(matched).toBe(3);
  });

  it('gives each BOQ item at most one line, the closer one', () => {
    const { lines } = matchQuoteLines(boq, [read('Sand', 50), read('River sand', 55)], {});
    expect(lines.map((l) => l.boq_sr)).toEqual([null, 4]);
  });

  it('uses the names it has learned', () => {
    const { lines } = matchQuoteLines(boq, [read('Bori', 380)], { bori: { item_name: 'OPC Cement 53 grade', unit: 'Bag' } });
    expect(lines[0]).toMatchObject({ boq_sr: 1, item_name: 'OPC Cement 53 grade', original_term: 'Bori' });
  });
});
