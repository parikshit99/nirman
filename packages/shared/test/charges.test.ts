import { describe, expect, it } from 'vitest';
import {
  buildItemDatabase,
  buildSiteReport,
  buildSystemInstruction,
  chargeKind,
  chargeName,
  cleanUnit,
  namesForReading,
  parseBill,
  parseRow,
  standardizeLine,
  unusedHiddenMaterials,
  type IndexedRateRow,
  type ItemRow,
  type ListRow,
} from '../src/index.ts';

const ts = (d: string) => `${d}T10:00:00.000Z`;
const list = (id: string, over: Partial<ListRow> = {}): ListRow => ({
  id, kind: 'audit', status: 'saved', project_id: 'p1', title: 't', address: 'Site A', category: 'Civil',
  site_date: '2026-10-01', notes: '', created_at: ts('2026-10-01'), updated_at: ts('2026-10-01'), ...over,
});
const item = (id: string, list_id: string, over: Partial<ItemRow> = {}): ItemRow => ({
  id, list_id, item_name: 'Cement', original_term: '', quantity: 50, unit: 'Bag', unit_price: 380,
  total_amount: 19000, vendor: 'Sharma', date: '2026-10-01', brand: '', model: '', spec: '', color: '', delivered_at: '', ordered_as: '', photo_id: '', rates_excluded: 0, read_as: '', created_at: ts('2026-10-01'),
  updated_at: ts('2026-10-01'), ...over,
});
const line = (item_name: string, unit = 'unit') => ({ item_name, original_term: '', quantity: 1, unit, unit_price: 1500 });

describe('transport and loading charges', () => {
  it('names each charge from the words bills use, as whole words', () => {
    for (const w of ['Transport', 'Transportation charges', 'Freight', 'Cartage', 'Bhada', 'bhaada', 'Bhara', 'Gaadi bhada', 'Truck bhada', 'Tractor charges', 'Tempo bhada', 'Delivery charges']) {
      expect(chargeName(w), w).toBe('Transport');
    }
    for (const w of ['Loading', 'Unloading', 'Loading/Unloading', 'Loading & unloading', 'Hamali', 'Hammali', 'Palledari', 'Chadhai', 'Utrai']) {
      expect(chargeName(w), w).toBe('Loading and unloading');
    }
    // Tractor, tempo and truck alone are how sand comes, not a charge; nor is a word inside another word, or a rate with transport included.
    for (const w of ['1 tractor sand', 'Tempo', 'Truck', 'Sand incl. transport', 'Sand with transport', 'Bharai', 'Delivery', 'Overloading']) expect(chargeName(w), w).toBeNull();
    expect(chargeKind('Transport')).toBe('transport');
    expect(chargeKind('loading and unloading')).toBe('loading');
    expect(chargeKind('Freight')).toBeNull();
  });

  it('reads a bill with freight as its own line: one trip at the amount, sure', () => {
    const r = parseBill(['Cement 50 bag 380 19000', 'Freight 1500', 'Total 20500']);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].item).toMatchObject({ item_name: 'Cement', quantity: 50, unit: 'Bag', unit_price: 380, total_amount: 19000 });
    expect(r.lines[1].item).toMatchObject({ item_name: 'Transport', original_term: 'Freight', quantity: 1, unit: 'trip', unit_price: 1500, total_amount: 1500 });
    expect(r.lines[1].confidence).toBe(1);
    expect(r.billTotal).toBe(20500);
    expect(r.confidence).toBe(1);
    expect(parseRow('Hamali 2 trips 300 600')?.item).toMatchObject({ item_name: 'Loading and unloading', quantity: 2, unit: 'trip', unit_price: 300, total_amount: 600 });
    expect(cleanUnit('Trips')).toBe('trip');
  });

  it('gives charges their standard names when matched, and leaves "1 tractor sand" as Sand', () => {
    expect(standardizeLine(line('Cartage'), []).line).toMatchObject({ item_name: 'Transport', original_term: 'Cartage', unit: 'trip', unit_price: 1500 });
    expect(standardizeLine(line('Gaadi bhada'), []).line.item_name).toBe('Transport');
    const hamali = standardizeLine(line('Hamali', 'bags'), []);
    expect(hamali.line).toMatchObject({ item_name: 'Loading and unloading', unit: 'Bag' });
    expect(hamali.readAs?.item_name).toBe('Hamali');
    // Never matched to a material in Rates, however alike the names.
    expect(standardizeLine(line('Transport'), [{ name: 'Transport pipe', unit: 'nos', uses: 9 }]).line.item_name).toBe('Transport');
    expect(standardizeLine(line('1 tractor sand', 'tractor'), []).line).toMatchObject({ item_name: 'Sand' });
    expect(parseRow('Sand 1 tractor 4500')?.item).toMatchObject({ item_name: 'Sand', unit: 'trolley' });
  });

  it('keeps charges out of Rates, deleted-material cleanup and the names sent to Gemini', () => {
    const lists = [list('l1')];
    const items = [item('c', 'l1'), item('t', 'l1', { item_name: 'Transport', original_term: 'Freight', quantity: 1, unit: 'trip', unit_price: 1500, total_amount: 1500 })];
    const rates: IndexedRateRow[] = [{ id: 'r', item_name: 'Loading and unloading', unit: 'trip', price: 300, vendor: '', date: '2026-10-01', category: '', address: '', project_id: '', indexed_at: ts('2026-10-01'), brand: '', model: '', spec: '', color: '' }];
    expect(buildItemDatabase(lists, items, rates, {}).map((e) => e.name)).toEqual(['Cement']);
    // A learned name that is a charge is a charge too.
    expect(buildItemDatabase(lists, [item('f', 'l1', { item_name: 'Freight', original_term: 'freight' })], [], { freight: { item_name: 'Transport', unit: 'trip' } })).toEqual([]);
    expect(unusedHiddenMaterials([{ id: '["transport","trip"]', hidden_at: ts('2026-12-01') }], lists, items, rates, {})).toEqual(['["transport","trip"]']);
    expect(namesForReading([{ name: 'Transport', unit: 'trip', uses: 50 }, { name: 'Cement', unit: 'Bag', uses: 1 }]).map((n) => n.name)).not.toContain('Transport');
  });

  it('asks Gemini to return each charge as its own line (rule 8)', () => {
    const prompt = buildSystemInstruction({ captureDate: '2026-10-15', materials: [{ name: 'Transport', unit: 'trip' }] });
    expect(prompt).toContain('8. Transport, freight, cartage, bhada, loading, unloading, hamali or palledari charged on the bill');
    expect(prompt).toContain('item_name exactly "Transport" or "Loading and unloading"');
    expect(prompt).toContain("Never add these charges into another item's price.");
  });

  it('lists charges after the materials of their work type in the site report, totals them, and leaves them out of "Only delivered"', () => {
    const lists = [list('l1'), list('l2', { category: 'Electrical' })];
    const items = [
      item('c', 'l1', { delivered_at: '2026-10-02' }),
      item('t', 'l1', { item_name: 'Transport', quantity: 2, unit: 'trip', unit_price: 2500, total_amount: 5000, delivered_at: '2026-10-02' }),
      item('h', 'l1', { item_name: 'Hamali', original_term: 'hamali', quantity: 1, unit: 'trip', unit_price: 500, total_amount: 500 }),
      item('w', 'l2', { item_name: 'Copper wire', unit: 'coil', quantity: 1, unit_price: 300, total_amount: 300 }),
      item('l', 'l2', { item_name: 'Loading and unloading', quantity: 1, unit: 'trip', unit_price: 1000, total_amount: 1000 }),
    ];
    const learning = { hamali: { item_name: 'Loading and unloading', unit: 'trip' } };
    const r = buildSiteReport(lists, items, learning, { address: 'Site A', deliveredOnly: false });
    expect(r.categories.map((c) => [c.name, c.amount, c.materials.map((m) => [m.name, m.amount, m.charge ?? ''])])).toEqual([
      ['Civil', 24500, [['Cement', 19000, ''], ['Transport', 5000, 'transport'], ['Loading and unloading', 500, 'loading']]],
      ['Electrical', 1300, [['Copper wire', 300, ''], ['Loading and unloading', 1000, 'loading']]],
    ]);
    expect([r.total, r.charges, r.lineCount]).toEqual([25800, 6500, 5]);
    // A charge is never delivered, even one ticked before this version.
    const delivered = buildSiteReport(lists, items, learning, { address: 'Site A', deliveredOnly: true });
    expect([delivered.total, delivered.charges, delivered.lineCount]).toEqual([19000, 0, 1]);
  });
});
