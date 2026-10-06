import { describe, expect, it } from 'vitest';
import type { ItemRow } from '@nirman/shared';
import { listSheet } from '../src/lib/exports.ts';

const item = (over: Partial<ItemRow>): ItemRow => ({
  id: 'i', list_id: 'l', item_name: 'Cement', original_term: '', quantity: 10, unit: 'Bag', unit_price: 380, total_amount: 3800,
  vendor: 'Sharma', date: '2026-10-05', brand: 'UltraTech', model: '', spec: '53 grade', color: '', delivered_at: '', ordered_as: '', photo_id: '', created_at: '', updated_at: '', ...over,
});
const values = (rows: ReturnType<typeof listSheet>) =>
  rows.map((r) => r.map((c) => (c && typeof c === 'object' && 'value' in c ? c.value : c)));

describe('Excel export', () => {
  it('puts brand and size in their own columns, keeps numbers as numbers and adds a total', () => {
    const rows = values(listSheet('audit', [item({}), item({ item_name: 'Sand', brand: '', spec: '', unit: 'MT', quantity: 2, unit_price: 1500, total_amount: 3000 })], ''));
    expect(rows[3]).toEqual(['Sr.', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as', 'Rate', 'Total', 'Vendor', 'Date']);
    expect(rows[4]).toEqual([1, 'Cement', 'UltraTech', '', '53 grade', '', 10, 'Bag', '', 380, 3800, 'Sharma', '2026-10-05']);
    expect(rows.at(-1)).toEqual([null, 'TOTAL', null, null, null, null, null, null, null, null, 6800]);
  });

  it('leaves rate and total blank on a BOQ and adds its notes', () => {
    const rows = values(listSheet('boq', [item({ unit_price: 0, total_amount: 0 })], 'Matt finish only'));
    expect(rows[4].slice(-2)).toEqual([null, null]);
    expect(rows.at(-1)).toEqual(['Matt finish only']);
  });
});

describe('site report export', () => {
  it('lists the summary per category, a grand total and every line with its delivery date', async () => {
    const { buildSiteReport } = await import('@nirman/shared');
    const { siteReportSheet } = await import('../src/lib/exports.ts');
    const list = { id: 'l', kind: 'audit' as const, status: 'saved' as const, title: 'Order 1', address: 'Sector 44', category: 'Civil', site_date: null, notes: '', created_at: '2026-10-01T00:00:00.000Z', updated_at: '' };
    const report = buildSiteReport([list], [item({ delivered_at: '2026-10-06' })], {}, { address: 'Sector 44', deliveredOnly: true });
    const rows = values(siteReportSheet('Sector 44', 'All time', report));
    expect(rows[6]).toEqual(['Civil', 'Cement', 10, 'Bag', 380, 3800, 'Sharma', 1]);
    expect(rows[8]).toEqual(['GRAND TOTAL', null, null, null, null, 3800, null, null]);
    expect(rows.at(-1)).toEqual(['2026-10-06', 'Civil', 'Cement', 'UltraTech', '', '53 grade', '', 10, 'Bag', '', 380, 3800, 'Sharma', 'Order 1', '2026-10-06']);
  });
});

describe('order slip export', () => {
  it('has the delivery details and quantities but no rates', async () => {
    const { orderSlipSheet } = await import('../src/lib/exports.ts');
    const rows = values(orderSlipSheet([item({ ordered_as: '3 bundles of 12 mm' })], { address: 'Sector 44', deliveryDate: '2026-10-08', receiverName: 'Ramesh', receiverPhone: '9876543210', notes: 'Unload at gate 2' }));
    expect(rows.slice(3, 6)).toEqual([['Deliver to', 'Sector 44'], ['Delivery by', '2026-10-08'], ['Receiver', 'Ramesh - 9876543210']]);
    expect(rows[7]).toEqual(['Sr.', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as']);
    expect(rows[8]).toEqual([1, 'Cement', 'UltraTech', '', '53 grade', '', 10, 'Bag', '3 bundles of 12 mm']);
    expect(rows.at(-1)).toEqual(['Unload at gate 2']);
    expect(JSON.stringify(rows)).not.toContain('380');
  });

  it('writes a contractor statement with terms, running balance and what is due, as Excel and PDF', async () => {
    const { contractStatement } = await import('@nirman/shared');
    const { contractStatementSheet } = await import('../src/lib/exports.ts');
    const { buildContractStatementPdf } = await import('../src/lib/pdf.ts');
    const ts = '2026-10-01T00:00:00.000Z';
    const c = {
      id: 'c', contractor: 'Ramesh', phone: '98', address: 'Sector 44', category: 'Civil', work: 'Plaster', kind: 'rate' as const, rate: 18, unit: 'sqft',
      est_quantity: 0, amount: 0, retention_pct: 5, start_date: '', status: 'active' as const, retention_released_at: '', notes: '', created_at: ts, updated_at: ts,
    };
    const entries = [
      { id: 'a', contract_id: 'c', kind: 'work' as const, date: '2026-10-02', quantity: 1000, amount: 0, mode: '', note: '', created_at: ts },
      { id: 'b', contract_id: 'c', kind: 'payment' as const, date: '2026-10-03', quantity: 0, amount: 10000, mode: 'cash', note: '', created_at: ts },
    ];
    const st = contractStatement(c, entries);
    const rows = values(contractStatementSheet(c, st, ''));
    expect(rows).toContainEqual(['2026-10-02', 'Work: 1,000 sqft @ 18', 18000, null, null, 18000]);
    expect(rows.at(-1)).toEqual([null, 'Balance due', null, null, null, 7100]);
    expect(buildContractStatementPdf(c, st, '').getNumberOfPages()).toBe(1);
  });
});
