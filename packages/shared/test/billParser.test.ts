import { describe, expect, it } from 'vitest';
import { boxesToRows, findDate, parseBill, parseRow } from '../src/index.ts';

describe('reading bills on the phone', () => {
  it('puts recognised text back into rows', () => {
    const box = (text: string, left: number, top: number) => ({ text, left, top, right: left + 50, bottom: top + 20 });
    expect(boxesToRows([box('380', 300, 102), box('Cement', 10, 100), box('50 Bag', 150, 98), box('Sand', 10, 140), box('2 MT', 150, 141)])).toEqual([
      'Cement  50 Bag  380',
      'Sand  2 MT',
    ]);
  });

  it('reads a printed bill: quantity × rate = amount, vendor, date and total', () => {
    const rows = [
      'SHARMA BUILDING MATERIAL',
      'Sector 44, Gurgaon  Mob 9000000001',
      'Bill No 231   Date: 03/10/2026',
      'Sr  Item  HSN  Qty  Rate  Amount',
      '1  OPC Cement 53 Grade  252329  50 Bags  380.00  19,000.00',
      '2  River Sand  2 MT  1500  3000',
      '3. TMT Bar 12mm  250 kg  62  15500',
      'Total  37,500.00',
    ];
    const r = parseBill(rows);
    expect(r.vendor).toBe('SHARMA BUILDING MATERIAL');
    expect(r.date).toBe('2026-10-03');
    expect(r.billTotal).toBe(37500);
    expect(r.lines.map((l) => [l.item.item_name, l.item.quantity, l.item.unit, l.item.unit_price, l.item.total_amount])).toEqual([
      ['OPC Cement 53 Grade', 50, 'Bag', 380, 19000],
      ['River Sand', 2, 'MT', 1500, 3000],
      ['TMT Bar 12mm', 250, 'kg', 62, 15500],
    ]);
    expect(r.lines.every((l) => l.item.vendor === 'SHARMA BUILDING MATERIAL' && l.item.date === '2026-10-03')).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('reads typed lists and uses learned names', () => {
    const r = parseBill(['bori 50 380', 'reti 2 mt 1500'], { learning: { bori: { item_name: 'OPC Cement', unit: 'Bag' } }, captureDate: '2026-10-05' });
    expect(r.lines.map((l) => [l.item.item_name, l.item.quantity, l.item.unit, l.item.unit_price])).toEqual([
      ['OPC Cement', 50, 'Bag', 380],
      ['Reti', 2, 'MT', 1500],
    ]);
    expect(r.date).toBe('2026-10-05');
    expect(r.confidence).toBeLessThan(0.75);
  });

  it('is unsure about rows it cannot make sense of', () => {
    expect(parseRow('GSTIN 06ABCDE1234F1Z5')).toBeNull();
    expect(parseRow('Thank you, visit again')).toBeNull();
    expect(parseBill(['scribble', 'xx yy']).confidence).toBe(0);
    // Lines adding up to far more than the printed total are doubtful.
    expect(parseBill(['Cement 50 380 19000', 'Total 1900']).confidence).toBeLessThan(0.75);
  });

  it('finds dates in common Indian formats', () => {
    expect(findDate(['Dt. 5-9-26'])).toBe('2026-09-05');
    expect(findDate(['13.09.2026'])).toBe('2026-09-13');
    expect(findDate(['no date'])).toBe('');
  });
});
