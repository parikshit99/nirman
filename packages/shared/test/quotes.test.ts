import { describe, expect, it } from 'vitest';
import {
  buildItemDatabase,
  buildQuoteInstruction,
  compareQuotes,
  parseQuoteOutput,
  type IndexedRateRow,
  type ItemRow,
  type QuoteLineRow,
  type QuoteRow,
} from '../src/index.ts';

const ts = (d: string) => `${d}T10:00:00.000Z`;

function boqItem(id: string, item_name: string, quantity: number, unit: string): ItemRow {
  return {
    id, list_id: 'boq', item_name, original_term: '', quantity, unit, unit_price: 0, total_amount: 0,
    vendor: '', date: '', created_at: ts('2026-10-01'), updated_at: ts('2026-10-01'),
  };
}
const quote = (id: string, vendor: string, quote_date = '2026-10-03'): QuoteRow => ({
  id, boq_id: 'boq', vendor, quote_date, status: 'confirmed', created_at: ts(quote_date), updated_at: ts(quote_date),
});
let pos = 0;
const line = (quote_id: string, boq_item_id: string | null, unit_price: number, over: Partial<QuoteLineRow> = {}): QuoteLineRow => ({
  id: `l${pos}`, quote_id, position: pos++, boq_item_id, original_term: '', item_name: 'x', quantity: 0, unit: 'Bag',
  unit_price, total_amount: 0, note: '', ...over,
});
const rate = (item_name: string, unit: string, price: number, date: string, vendor: string): IndexedRateRow => ({
  id: `${item_name}${date}${vendor}`, item_name, unit, price, date, vendor, indexed_at: ts(date),
});

describe('parseQuoteOutput', () => {
  it('keeps vendor lines, drops empty ones and Sr. numbers outside the BOQ', () => {
    const out = parseQuoteOutput(
      'Here you go: [{"boq_sr": 2, "original_term": "ACC bori", "item_name": "Cement", "quantity": "15", "unit": "Bag", "unit_price": "380"},' +
        '{"boq_sr": 9, "original_term": "taar", "item_name": "", "unit_price": 90},' +
        '{"boq_sr": null, "item_name": "  "}]',
      3,
    );
    expect(out).toEqual([
      { boq_sr: 2, original_term: 'ACC bori', item_name: 'Cement', quantity: 15, unit: 'Bag', unit_price: 380, total_amount: 5700, note: '' },
      { boq_sr: null, original_term: 'taar', item_name: 'taar', quantity: 0, unit: 'unit', unit_price: 90, total_amount: 0, note: '' },
    ]);
    expect(parseQuoteOutput('nonsense', 3)).toEqual([]);
  });

  it('lists the BOQ with Sr. numbers in the instructions', () => {
    const text = buildQuoteInstruction({ boq: [{ sr: 1, item_name: 'Cement', quantity: 50, unit: 'Bag' }], learning: { bori: { item_name: 'Cement', unit: 'Bag' } } });
    expect(text).toContain('1. Cement | qty 50 Bag');
    expect(text).toContain('"bori"');
  });
});

describe('compareQuotes', () => {
  const cement = boqItem('c', 'Cement', 50, 'Bag');
  const sand = boqItem('s', 'Sand', 10, 'MT');
  const steel = boqItem('t', 'TMT Bar 12mm', 2, 'MT');
  const boq = [cement, sand, steel];

  // Past prices, plus the confirmed quotes themselves (as confirming indexes them).
  const rates = [
    rate('Cement', 'Bag', 350, '2026-08-12', 'Sharma'),
    rate('Cement', 'Bag', 360, '2026-09-01', 'Sharma'),
    rate('Sand', 'MT', 1500, '2026-09-01', 'Verma'),
    rate('Cement', 'Bag', 380, '2026-10-03', 'Gupta'),
    rate('Cement', 'Bag', 370, '2026-10-03', 'Ali'),
  ];
  const database = buildItemDatabase([], [], rates, {});
  const gupta = quote('q1', 'Gupta');
  const ali = quote('q2', 'Ali');
  const lines = [
    line('q1', 'c', 380, { quantity: 50 }),
    line('q1', 's', 1400, { unit: 'MT', quantity: 8 }),
    line('q1', null, 90, { item_name: 'Binding wire', unit: 'kg' }),
    line('q2', 'c', 370),
    line('q2', 't', 62, { unit: 'kg' }),
  ];
  const result = compareQuotes(boq, [gupta, ali], lines, database, {});

  it('lines up each BOQ item with every vendor and marks the cheapest', () => {
    const [cRow, sRow, tRow] = result.rows;
    expect(cRow.sr).toBe(1);
    expect(cRow.cells.q1).toMatchObject({ price: 380, cheapest: false });
    expect(cRow.cells.q2).toMatchObject({ price: 370, cheapest: true });
    expect(sRow.cells.q1).toMatchObject({ price: 1400, qtyDiffers: true });
    expect(sRow.cells.q2).toBeUndefined();
    expect(tRow.cells.q2).toMatchObject({ unitDiffers: true, vsLast: null, cheapest: false });
  });

  it('measures quotes against the last price before them, not against the quotes themselves', () => {
    const cRow = result.rows[0];
    expect(cRow.history.last).toMatchObject({ price: 360, vendor: 'Sharma' });
    expect(cRow.history).toMatchObject({ min: 350, max: 360 });
    expect(cRow.cells.q1!.vsLast).toBeCloseTo(20 / 360);
    expect(result.rows[1].cells.q1!.vsLast).toBeCloseTo(-100 / 1500);
    expect(result.rows[2].history.last).toBeNull();
  });

  it('totals each vendor and lists what is missing or extra', () => {
    const [g, a] = result.vendors;
    expect(g.total).toBe(50 * 380 + 10 * 1400);
    expect(g.quoted).toBe(2);
    expect(g.missing.map((i) => i.item_name)).toEqual(['TMT Bar 12mm']);
    expect(g.extras.map((l) => l.item_name)).toEqual(['Binding wire']);
    expect(g.lastTotal).toBe(50 * 360 + 10 * 1500);
    expect(g.vsLast).toBeCloseTo((50 * 380 + 10 * 1400 - (50 * 360 + 10 * 1500)) / (50 * 360 + 10 * 1500));
    expect(a.total).toBe(50 * 370);
    expect(a.unitIssues).toBe(1);
    expect(a.missing.map((i) => i.item_name)).toEqual(['Sand']);
  });

  it('totals only the items every vendor priced for a like-for-like figure', () => {
    // Cement is the only item both priced in the BOQ unit.
    expect(result.commonItems).toBe(1);
    expect(result.vendors.map((v) => v.commonTotal)).toEqual([50 * 380, 50 * 370]);
  });
});
