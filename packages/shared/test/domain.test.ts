import { describe, expect, it } from 'vitest';
import {
  buildItemDatabase,
  guessCategory,
  materialDatabaseToCSV,
  materialKey,
  parseExtractionOutput,
  shouldReplace,
  type ItemRow,
  type ListRow,
  type IndexedRateRow,
} from '../src/index.ts';

const ts = (d: string) => `${d}T10:00:00.000Z`;

function list(id: string, over: Partial<ListRow> = {}): ListRow {
  return {
    id, kind: 'audit', status: 'saved', title: 't', address: 'Site A', category: 'Civil',
    site_date: '2026-01-01', notes: '', created_at: ts('2026-01-01'), updated_at: ts('2026-01-01'), deleted_at: null, ...over,
  };
}
function item(id: string, list_id: string, over: Partial<ItemRow> = {}): ItemRow {
  return {
    id, list_id, item_name: 'Cement', original_term: 'bori', quantity: 10, unit: 'Bag', unit_price: 400,
    total_amount: 4000, vendor: 'Sharma', date: '2026-01-01', created_at: ts('2026-01-01'),
    updated_at: ts('2026-01-01'), deleted_at: null, ...over,
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
  it('aggregates saved lists and indexed rates, ignoring drafts and deletions', () => {
    const lists = [list('l1'), list('l2', { status: 'draft' }), list('l3', { created_at: ts('2026-02-01'), address: 'Site B' })];
    const items = [
      item('i1', 'l1'),
      item('i2', 'l2', { unit_price: 999 }),
      item('i3', 'l3', { unit_price: 420, date: '2026-02-01', vendor: 'Gupta' }),
      item('i4', 'l3', { unit_price: 1, deleted_at: ts('2026-02-02') }),
    ];
    const rates: IndexedRateRow[] = [{
      id: 'r1', item_name: 'cement', unit: 'bag', date: '2026-03-01', price: 450, vendor: 'Manual',
      indexed_at: ts('2026-03-01'), updated_at: ts('2026-03-01'), deleted_at: null,
    }];
    const db = buildItemDatabase(lists, items, rates, {});
    expect(db).toHaveLength(1);
    const [cement] = db;
    expect(cement.priceHistory.map((p) => p.price)).toEqual([400, 420, 450]);
    expect(cement.minPrice).toBe(400);
    expect(cement.latestPrice).toBe(450);
    expect(cement.addresses.sort()).toEqual(['Site A', 'Site B']);
    expect(cement.vendors.sort()).toEqual(['Gupta', 'Manual', 'Sharma']);
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
    expect(out).toEqual([{ item_name: 'Sand', original_term: 'Reti', quantity: 2, unit: 'MT', unit_price: 1500, total_amount: 3000, vendor: '', date: '' }]);
  });
  it('recovers an array wrapped in prose and drops junk', () => {
    const out = parseExtractionOutput('Here you go:\n[{"item_name":"Bricks","quantity":500,"unit":"piece"}, {"foo":1}]\nThanks');
    expect(out.map((i) => i.item_name)).toEqual(['Bricks']);
  });
  it('returns [] for garbage', () => {
    expect(parseExtractionOutput('nope')).toEqual([]);
  });
});

describe('shouldReplace', () => {
  const row = (u: string, d: string | null = null) => ({ updated_at: u, deleted_at: d });
  it('prefers newer rows and deletions on ties', () => {
    expect(shouldReplace(row(ts('2026-01-02')), row(ts('2026-01-01')))).toBe(true);
    expect(shouldReplace(row(ts('2026-01-01')), row(ts('2026-01-02')))).toBe(false);
    expect(shouldReplace(row(ts('2026-01-01'), ts('2026-01-01')), row(ts('2026-01-01')))).toBe(true);
    expect(shouldReplace(row(ts('2026-01-01')), null)).toBe(true);
  });
});
