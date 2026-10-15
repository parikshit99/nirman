import { describe, expect, it } from 'vitest';
import { contractRowSchema, dataTables, fieldLimits, fitRow, materialKey, normalizeTerm, rowSchemas, type ContractRow } from '../src/index.ts';

const ts = '2026-10-14T10:00:00.000Z';
const contract = (over: Partial<ContractRow> = {}): ContractRow => ({
  id: 'c1', project_id: 'p1', contractor: 'Ramesh', phone: '98100', address: 'Sector 44', category: 'Civil', work: 'Plaster', kind: 'rate',
  rate: 18, unit: 'sqft', est_quantity: 0, amount: 0, retention_pct: 5, start_date: '2026-09-01', status: 'active', retention_released_at: '', notes: '',
  created_at: ts, updated_at: ts, ...over,
});

describe('field limits', () => {
  it('reads each text column’s limit from the row schemas, through default and nullable', () => {
    expect(fieldLimits('contracts').phone).toBe(100);
    expect(fieldLimits('items')).toMatchObject({ vendor: 200, date: 20, item_name: 500, brand: 200, ordered_as: 300, read_as: 2000 });
    expect(fieldLimits('contract_entries').note).toBe(500);
    expect(fieldLimits('quote_lines').boq_item_id).toBe(200);
    // Numbers, dates and timestamps have no text limit.
    for (const column of ['quantity', 'created_at']) expect(fieldLimits('items')).not.toHaveProperty(column);
    expect(fieldLimits('lists')).not.toHaveProperty('site_date');
  });

  it('gives keys room for anything the app makes from text', () => {
    const term = normalizeTerm('İ'.repeat(fieldLimits('items').original_term));
    expect(term.length).toBeLessThanOrEqual(fieldLimits('learned_terms').id);
    const worstName = '\u0001'.repeat(fieldLimits('items').item_name);
    expect(materialKey(worstName, '"'.repeat(fieldLimits('items').unit)).length).toBeLessThanOrEqual(fieldLimits('hidden_materials').id);
    expect('İ'.repeat(fieldLimits('categories').name).toLowerCase().length).toBeLessThanOrEqual(fieldLimits('categories').id);
    expect(`draft-audit-${'0b6c8f7e-2f5d-4c1a-9a8e-1d2c3b4a5f60'}`.length).toBeLessThanOrEqual(fieldLimits('lists').id);
  });
});

describe('fitRow', () => {
  it('cuts text longer than its column to the limit, counting each value', () => {
    const long = contract({ phone: '98765 43210, 91234 56789 (site supervisor) '.repeat(4), notes: 'x'.repeat(6000) });
    const { row, shortened } = fitRow('contracts', long);
    expect(shortened).toBe(2);
    expect(row.phone).toBe(long.phone.slice(0, 100));
    expect(row.notes).toHaveLength(5000);
    expect(contractRowSchema.parse(row)).toBeTruthy();
    // Two numbers and a name now fit as they are.
    expect(fitRow('contracts', contract({ phone: '98765 43210, 91234 56789 (site supervisor)' })).shortened).toBe(0);
  });

  it('leaves a row that fits as it is', () => {
    const row = contract();
    expect(fitRow('contracts', row)).toEqual({ row, shortened: 0 });
  });

  it('never cuts an id or a reference', () => {
    const longId = 'k'.repeat(300);
    const { row, shortened } = fitRow('items', { id: longId, list_id: longId, photo_id: longId, vendor: 'v'.repeat(250) });
    expect([row.id, row.list_id, row.photo_id, row.vendor.length, shortened]).toEqual([longId, longId, longId, 200, 1]);
    expect(fitRow('learned_terms', { id: longId.repeat(5) }).row.id).toHaveLength(1500);
  });

  it('turns numbers JSON can’t hold into 0, and leaves other values for the schema to judge', () => {
    const { row, shortened } = fitRow('items', { quantity: NaN, unit_price: Infinity, total_amount: null, rates_excluded: -Infinity, vendor: 'Sharma' });
    expect(row).toEqual({ quantity: 0, unit_price: 0, total_amount: 0, rates_excluded: 0, vendor: 'Sharma' });
    expect(shortened).toBe(4);
    expect(fitRow('items', { quantity: 'lots', item_name: 5 }).shortened).toBe(0);
  });

  it('blanks JSON over its limit rather than cut it (a matched line then just can’t be undone)', () => {
    const readAs = JSON.stringify({ item_name: 'Cement '.repeat(400), unit: 'Bag' });
    expect(fitRow('items', { read_as: readAs })).toEqual({ row: { read_as: '' }, shortened: 1 });
    const fits = JSON.stringify({ item_name: 'Cemnt', unit: 'Bag' });
    expect(fitRow('items', { read_as: fits }).row.read_as).toBe(fits);
  });

  it('does not split an emoji at the limit', () => {
    const vendor = `${'a'.repeat(199)}🙂`;
    expect(fitRow('items', { vendor }).row.vendor).toBe('a'.repeat(199));
  });

  it('makes every table’s over-long row valid', () => {
    for (const table of dataTables) {
      const shape = rowSchemas[table].shape as Record<string, unknown>;
      const row = Object.fromEntries(Object.keys(shape).map((c) => [c, c in fieldLimits(table) ? 'z'.repeat(fieldLimits(table)[c] + 10) : undefined]));
      const fitted = fitRow(table, row).row as Record<string, unknown>;
      for (const [c, max] of Object.entries(fieldLimits(table))) {
        const isKey = c === 'id' || c.endsWith('_id');
        const isJson = table === 'items' && c === 'read_as';
        expect((fitted[c] as string).length).toBe(isKey ? max + 10 : isJson ? 0 : max);
      }
    }
  });
});
