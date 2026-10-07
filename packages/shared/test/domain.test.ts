import { describe, expect, it } from 'vitest';
import {
  buildItemDatabase,
  buildSiteReport,
  filterMaterials,
  financialYear,
  siteHasDeliveries,
  materialFilterOptions,
  guessCategory,
  materialDatabaseToCSV,
  materialKey,
  parseAmount,
  parseExtractionOutput,
  similarMaterials,
  unusedHiddenMaterials,
  variantDifferences,
  variantKey,
  variantLabel,
  type ItemRow,
  type ListRow,
  type IndexedRateRow,
} from '../src/index.ts';

const ts = (d: string) => `${d}T10:00:00.000Z`;

function list(id: string, over: Partial<ListRow> = {}): ListRow {
  return {
    id, kind: 'audit', status: 'saved', project_id: 'p1', title: 't', address: 'Site A', category: 'Civil',
    site_date: '2026-01-01', notes: '', created_at: ts('2026-01-01'), updated_at: ts('2026-01-01'), ...over,
  };
}
function item(id: string, list_id: string, over: Partial<ItemRow> = {}): ItemRow {
  return {
    id, list_id, item_name: 'Cement', original_term: 'bori', quantity: 10, unit: 'Bag', unit_price: 400,
    total_amount: 4000, vendor: 'Sharma', date: '2026-01-01', brand: '', model: '', spec: '', color: '', delivered_at: '', ordered_as: '', photo_id: '', rates_excluded: 0, created_at: ts('2026-01-01'),
    updated_at: ts('2026-01-01'), ...over,
  };
}

describe('guessCategory', () => {
  it('votes by keyword', () => {
    expect(guessCategory([{ item_name: 'Copper wire 2.5mm' }, { item_name: 'MCB 32A' }])).toBe('Electrical');
    expect(guessCategory([{ item_name: 'Something' }])).toBe('Civil');
  });
});

describe('materialKey', () => {
  it('is case-insensitive and safe with underscores', () => {
    expect(materialKey(' Cement ', 'BAG')).toBe(materialKey('cement', 'bag'));
    expect(materialKey('a_b', 'c')).not.toBe(materialKey('a', 'b_c'));
  });
});

describe('buildItemDatabase', () => {
  it('counts a price on the open purchase list straight away, and leaves out lines marked to stay out of Rates', () => {
    const lists = [list('l1'), list('draft', { status: 'draft', title: '', created_at: ts('2026-01-01') })];
    const items = [
      item('i1', 'l1'),
      item('d1', 'draft', { unit_price: 430, date: '2026-05-01', created_at: ts('2026-05-01') }),
      item('d2', 'draft', { unit_price: 900, date: '2026-05-02', rates_excluded: 1 }),
      item('x1', 'l1', { unit_price: 2000, rates_excluded: 1 }),
    ];
    const [cement] = buildItemDatabase(lists, items, [], {});
    expect(cement.priceHistory.map((p) => [p.price, p.itemId, p.draft ?? false, p.listTitle ?? null])).toEqual([
      [400, 'i1', false, 't'],
      [430, 'd1', true, null],
    ]);
    expect(cement.latestPrice).toBe(430);
    // Once saved, the open list's line and its saved copy are one price.
    const saved = list('s2', { title: 'May order', created_at: ts('2026-05-03') });
    const copy = item('c1', 's2', { unit_price: 430, date: '2026-05-01' });
    const after = buildItemDatabase([...lists, saved], [...items, copy], [], {})[0];
    expect(after.priceHistory.map((p) => [p.price, p.itemId])).toEqual([
      [400, 'i1'],
      [430, 'c1'],
    ]);
    // Deleted from Rates after it was added: left out, like a saved line.
    expect(buildItemDatabase(lists, items, [], {}, { [cement.key]: ts('2026-06-01') })).toEqual([]);
  });

  it('aggregates saved lists, the open purchase list and added rates, but not a BOQ draft', () => {
    const lists = [list('l1'), list('l2', { status: 'draft', kind: 'boq' }), list('l3', { created_at: ts('2026-02-01'), address: 'Site B' })];
    const items = [
      item('i1', 'l1'),
      item('i2', 'l2', { unit_price: 999 }),
      item('i3', 'l3', { unit_price: 420, date: '2026-02-01', vendor: 'Gupta' }),
    ];
    const rates: IndexedRateRow[] = [{
      id: 'r1', item_name: 'cement', unit: 'bag', date: '2026-03-01', price: 450, vendor: 'Manual', brand: '', model: '', spec: '', color: '', category: '', address: '', project_id: '',
      indexed_at: ts('2026-03-01'),
    }];
    const db = buildItemDatabase(lists, items, rates, {});
    expect(db).toHaveLength(1);
    const [cement] = db;
    expect(cement.priceHistory.map((p) => p.price)).toEqual([400, 420, 450]);
    expect(cement.minPrice).toBe(400);
    expect(cement.latestPrice).toBe(450);
    expect(cement.addresses.sort()).toEqual(['Site A', 'Site B']);
    expect(cement.vendors.sort()).toEqual(['Gupta', 'Manual', 'Sharma']);
    // Each price says where it came from; only single added rates carry an id to remove them by.
    expect(cement.priceHistory.map((p) => [p.listTitle ?? null, p.rateId ?? null])).toEqual([
      [lists[0].title, null],
      [lists[2].title, null],
      [null, 'r1'],
    ]);
  });

  it('merges items through learned corrections', () => {
    const db = buildItemDatabase([list('l1')], [item('i1', 'l1', { item_name: 'Cemnt', original_term: 'Bori' })], [], {
      bori: { item_name: 'OPC Cement', unit: 'Bag' },
    });
    expect(db[0].name).toBe('OPC Cement');
  });

  it('exports CSV with escaped quotes', () => {
    const db = buildItemDatabase([list('l1')], [item('i1', 'l1', { item_name: 'Pipe 1" CPVC' })], [], {});
    expect(materialDatabaseToCSV(db).split('\n')[1]).toContain('"Pipe 1"" CPVC"');
  });
});

describe('parseExtractionOutput', () => {
  it('parses clean JSON and fills defaults', () => {
    const out = parseExtractionOutput('[{"item_name":"Sand","original_term":"Reti","quantity":"2","unit":"MT","unit_price":1500}]');
    expect(out).toEqual([{ item_name: 'Sand', original_term: 'Reti', quantity: 2, unit: 'MT', unit_price: 1500, total_amount: 3000, vendor: '', date: '', brand: '', model: '', spec: '', color: '', ordered_as: '' }]);
  });
  it('recovers an array wrapped in prose and drops junk', () => {
    const out = parseExtractionOutput('Here you go:\n[{"item_name":"Bricks","quantity":500,"unit":"piece"}, {"foo":1}]\nThanks');
    expect(out.map((i) => i.item_name)).toEqual(['Bricks']);
  });
  it('returns [] for garbage', () => {
    expect(parseExtractionOutput('nope')).toEqual([]);
  });
});

describe('parseAmount', () => {
  it('reads numbers as typed in India', () => {
    expect(parseAmount('1,500')).toBe(1500);
    expect(parseAmount('₹ 1,50,000')).toBe(150000);
    expect(parseAmount('Rs. 380')).toBe(380);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount(' 7 ')).toBe(7);
    expect(parseAmount(42)).toBe(42);
  });
  it('returns null instead of guessing', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe('variants', () => {
  it('labels, keys and compares brand / model / spec / colour', () => {
    expect(variantLabel({ brand: 'Jaquar', model: ' CNS-101 ', color: 'White' })).toBe('Jaquar · CNS-101 · White');
    expect(variantLabel({})).toBe('');
    expect(variantKey({ brand: 'JAQUAR ' })).toBe(variantKey({ brand: 'jaquar', model: '' }));
    expect(variantDifferences({ brand: 'Jaquar', color: 'White' }, { brand: 'Hindware', color: '' })).toEqual(['brand']);
  });

  it('groups prices per variant under one material', () => {
    const db = buildItemDatabase([list('l1')], [
      item('a', 'l1', { item_name: 'Switch', unit: 'piece', unit_price: 120, brand: 'Legrand', color: 'White' }),
      item('b', 'l1', { item_name: 'Switch', unit: 'piece', unit_price: 95, brand: 'Anchor' }),
      item('c', 'l1', { item_name: 'Switch', unit: 'piece', unit_price: 125, brand: 'legrand', color: 'white' }),
    ], [], {});
    expect(db).toHaveLength(1);
    expect(db[0].variants.map((v) => [v.label, v.priceHistory.length, v.latestPrice])).toEqual([
      ['Anchor', 1, 95],
      ['Legrand · White', 2, 125],
    ]);
    expect(materialDatabaseToCSV(db).split('\n')).toHaveLength(3);
  });
});

describe('similarMaterials', () => {
  const entry = (name: string, unit = 'piece') => buildItemDatabase([list('l1')], [item(name + unit, 'l1', { item_name: name, unit, original_term: '' })], [], {})[0];

  it('does not offer different products that share words', () => {
    const basin = entry('Wash Basin');
    const others = ['Wash Basin Diverter Spout', 'Wash Basin JDS White 101', 'Wash Basin JDS White 102', 'Center Hole Basin Mixer'].map((n) => entry(n));
    expect(similarMaterials(basin, others)).toEqual([]);
    expect(similarMaterials(others[1], others)).toEqual([]);
  });

  it('offers reworded names and misspellings, same unit first', () => {
    const opc = entry('Cement OPC 53', 'Bag');
    const grade = entry('OPC Cement 53 grade', 'Bag');
    expect(similarMaterials(opc, [grade]).map((e) => e.name)).toEqual(['OPC Cement 53 grade']);
    const typo = entry('Cemnt', 'Bag');
    const kg = entry('Cement', 'kg');
    const bag = entry('Cement', 'Bag');
    expect(similarMaterials(typo, [kg, bag]).map((e) => `${e.name}/${e.unit}`)).toEqual(['Cement/Bag', 'Cement/kg']);
  });
});

describe('deleting a material from the database', () => {
  it('leaves out what was recorded up to the deletion, and shows later purchases again', () => {
    const lists = [list('old', { created_at: ts('2026-02-01') }), list('new', { created_at: ts('2026-04-01') })];
    const items = [item('a', 'old', { unit_price: 400 }), item('b', 'new', { unit_price: 420 })];
    const rates: IndexedRateRow[] = [{
      id: 'r', item_name: 'Cement', unit: 'Bag', date: '2026-02-02', price: 410, vendor: 'X', brand: '', model: '', spec: '', color: '', category: '', address: '', project_id: '',
      indexed_at: ts('2026-02-02'),
    }];
    const key = materialKey('Cement', 'Bag');
    expect(buildItemDatabase(lists, items, rates, {}, { [key]: ts('2026-05-01') })).toEqual([]);
    const [cement] = buildItemDatabase(lists, items, rates, {}, { [key]: ts('2026-03-01') });
    expect(cement.priceHistory.map((p) => p.price)).toEqual([420]);
  });
});

describe('filtering the price database (#28)', () => {
  const rate = (over: Partial<IndexedRateRow>): IndexedRateRow => ({
    id: 'r', item_name: 'Switch', unit: 'piece', date: '2026-03-01', price: 100, vendor: 'Gupta', brand: '', model: '', spec: '', color: '',
    category: '', address: '', project_id: '', indexed_at: ts('2026-03-01'), ...over,
  });

  it('files quote rates under their BOQ category and site, and guesses one for rates added on their own', () => {
    const db = buildItemDatabase([], [], [
      rate({ id: 'a', category: 'Electrical', address: 'Site B' }),
      rate({ id: 'b', item_name: 'Copper wire', unit: 'coil' }),
    ], {});
    expect(db.map((e) => [e.name, e.categories, e.addresses])).toEqual([
      ['Copper wire', ['Electrical'], []],
      ['Switch', ['Electrical'], ['Site B']],
    ]);
  });

  it('narrows to a vendor, brand, size or colour, keeping only matching prices', () => {
    const db = buildItemDatabase([list('l1')], [
      item('a', 'l1', { item_name: 'Switch', unit: 'piece', unit_price: 120, brand: 'Legrand', color: 'White', vendor: 'Sharma' }),
      item('b', 'l1', { item_name: 'Switch', unit: 'piece', unit_price: 95, brand: 'Anchor', vendor: 'Gupta' }),
      item('c', 'l1', { item_name: 'Wire', unit: 'coil', unit_price: 1500, brand: 'Polycab', spec: '2.5 sq mm', vendor: 'Gupta' }),
    ], [], {});
    expect(materialFilterOptions(db)).toEqual({
      vendor: ['Gupta', 'Sharma'], brand: ['Anchor', 'Legrand', 'Polycab'], spec: ['2.5 sq mm'], color: ['White'],
    });
    const legrand = filterMaterials(db, { brand: 'legrand' });
    expect(legrand.map((e) => [e.name, e.variants.map((v) => v.label), e.latestPrice])).toEqual([['Switch', ['Legrand · White'], 120]]);
    const gupta = filterMaterials(db, { vendor: 'Gupta' });
    expect(gupta.map((e) => [e.name, e.priceHistory.map((p) => p.price)])).toEqual([['Switch', [95]], ['Wire', [1500]]]);
    expect(filterMaterials(db, { vendor: 'Sharma', brand: 'Anchor' })).toEqual([]);
    expect(filterMaterials(db, {})).toBe(db);
  });
});

describe('site report (#38)', () => {
  const lists = [
    list('a1', { address: 'Sector 44', category: 'Civil', title: 'Cement order', created_at: ts('2026-04-10') }),
    list('a2', { address: 'Sector 44', category: 'Electrical', title: 'Wiring', created_at: ts('2026-06-01') }),
    list('a3', { address: 'Sector 44', category: 'Civil', title: 'Old', created_at: ts('2025-12-01') }),
    list('b1', { address: 'Site B', category: 'Civil' }),
    list('q1', { address: 'Sector 44', kind: 'boq' }),
    list('d1', { address: 'Sector 44', status: 'draft' }),
  ];
  const items = [
    item('c1', 'a1', { item_name: 'Cemnt', original_term: 'bori', quantity: 10, unit_price: 400, total_amount: 4000, date: '2026-04-10', delivered_at: '2026-04-12' }),
    item('c2', 'a3', { item_name: 'OPC Cement', original_term: '', quantity: 5, unit_price: 380, total_amount: 1900, date: '2025-12-01', vendor: 'Gupta' }),
    item('w1', 'a2', { item_name: 'Copper wire', original_term: '', unit: 'coil', quantity: 2, unit_price: 1500, total_amount: 3000, date: '2026-06-01' }),
    item('b', 'b1', { quantity: 99, total_amount: 9999 }),
    item('q', 'q1', { quantity: 50 }),
    item('d', 'd1', { quantity: 50 }),
  ];
  const learning = { bori: { item_name: 'OPC Cement', unit: 'Bag' } };

  it('covers the whole history of one site by default, grouped by category with learned names merged', () => {
    const r = buildSiteReport(lists, items, learning, { address: 'Sector 44', deliveredOnly: false });
    expect(r.categories.map((c) => [c.name, c.amount, c.materials.map((m) => [m.name, m.quantity, m.amount, m.bills, m.vendors])])).toEqual([
      ['Civil', 5900, [['OPC Cement', 15, 5900, 2, ['Gupta', 'Sharma']]]],
      ['Electrical', 3000, [['Copper wire', 2, 3000, 1, ['Sharma']]]],
    ]);
    expect(r.total).toBe(8900);
    expect(r.lineCount).toBe(3);
    expect(r.categories[0].materials[0].avgRate).toBeCloseTo(5900 / 15);
    // Lines are dated by delivery when ticked.
    expect(r.categories[0].materials[0].lines.map((l) => l.date)).toEqual(['2025-12-01', '2026-04-12']);
  });

  it('filters by dates, categories and delivery', () => {
    const fy = financialYear('2026-10-05');
    expect(fy).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYear('2026-02-01', true)).toEqual({ from: '2024-04-01', to: '2025-03-31' });
    expect(buildSiteReport(lists, items, learning, { address: 'Sector 44', ...fy, deliveredOnly: false }).total).toBe(7000);
    expect(buildSiteReport(lists, items, learning, { address: 'Sector 44', categories: ['electrical'], deliveredOnly: false }).total).toBe(3000);
    const delivered = buildSiteReport(lists, items, learning, { address: 'Sector 44', deliveredOnly: true });
    expect([delivered.total, delivered.lineCount]).toEqual([4000, 1]);
    expect(siteHasDeliveries(lists, items, 'Sector 44')).toBe(true);
    expect(siteHasDeliveries(lists, items, 'Site B')).toBe(false);
  });
});

describe('price counted once (bug)', () => {
  it('ignores an indexed rate that a saved line already records', () => {
    const lists = [list('l1')];
    const items = [item('i1', 'l1', { unit_price: 380, vendor: 'Sharma', date: '2026-10-05' })];
    const rate = (over: Partial<IndexedRateRow>): IndexedRateRow => ({
      id: 'r', item_name: 'Cement', unit: 'Bag', date: '2026-10-05', price: 380, vendor: 'Sharma', brand: '', model: '', spec: '', color: '',
      category: '', address: '', project_id: '', indexed_at: ts('2026-10-05'), ...over,
    });
    expect(buildItemDatabase(lists, items, [rate({})], {})[0].priceHistory).toHaveLength(1);
    // A different price, date or vendor is a separate price.
    expect(buildItemDatabase(lists, items, [rate({ price: 390 }), rate({ id: 'r2', date: '2026-10-06' }), rate({ id: 'r3', vendor: 'Gupta' })], {})[0].priceHistory).toHaveLength(4);
  });
});

describe('unusedHiddenMaterials', () => {
  const key = materialKey('Cement', 'Bag');
  const rate = (over: Partial<IndexedRateRow> = {}): IndexedRateRow => ({
    id: 'r1', item_name: 'Cement', unit: 'Bag', date: '2026-01-01', price: 400, vendor: '', brand: '', model: '', spec: '', color: '',
    category: '', address: '', project_id: '', indexed_at: ts('2026-01-01'), ...over,
  });

  it('keeps a deletion that still hides saved lines or rates', () => {
    const hidden = [{ id: key, hidden_at: ts('2026-02-01') }];
    expect(unusedHiddenMaterials(hidden, [list('l1')], [item('i1', 'l1')], [], {})).toEqual([]);
    expect(unusedHiddenMaterials(hidden, [], [], [rate()], {})).toEqual([]);
  });

  it('drops one whose lines were all deleted, or only recorded after it', () => {
    const hidden = [{ id: key, hidden_at: ts('2026-02-01') }];
    expect(unusedHiddenMaterials(hidden, [], [], [], {})).toEqual([key]);
    expect(unusedHiddenMaterials(hidden, [list('l1', { created_at: ts('2026-03-01') })], [item('i1', 'l1')], [], {})).toEqual([key]);
    // A BOQ draft line is not a recorded price; a line on the open purchase list is, from when it was added.
    expect(unusedHiddenMaterials(hidden, [list('l1', { status: 'draft', kind: 'boq' })], [item('i1', 'l1')], [], {})).toEqual([key]);
    expect(unusedHiddenMaterials(hidden, [list('l1', { status: 'draft' })], [item('i1', 'l1')], [], {})).toEqual([]);
    expect(unusedHiddenMaterials(hidden, [list('l1', { status: 'draft' })], [item('i1', 'l1', { created_at: ts('2026-03-01') })], [], {})).toEqual([key]);
  });

  it('follows learned names', () => {
    const hidden = [{ id: key, hidden_at: ts('2026-02-01') }];
    const learning = { bori: { item_name: 'Cement', unit: 'Bag' } };
    expect(unusedHiddenMaterials(hidden, [list('l1')], [item('i1', 'l1', { item_name: 'Bori', unit: 'nos' })], [], learning)).toEqual([]);
  });
});
