import { describe, expect, it } from 'vitest';
import { buildLabourReport, contractStatement, contractTotals, describeEntry, describeTerms, type ContractEntryRow, type ContractRow } from '../src/index.ts';

const ts = '2026-10-01T00:00:00.000Z';
const plaster: ContractRow = {
  id: 'c1', contractor: 'Ramesh', phone: '98', address: 'Sector 44', category: 'Civil', work: 'Plaster', kind: 'rate', rate: 18, unit: 'sqft',
  est_quantity: 4000, amount: 0, retention_pct: 5, start_date: '2026-09-01', status: 'active', retention_released_at: '', notes: '', created_at: ts, updated_at: ts,
};
const plumbing: ContractRow = { ...plaster, id: 'c2', contractor: 'Sunil', work: 'Plumbing', category: 'Plumbing', kind: 'lump_sum', rate: 0, unit: '', est_quantity: 0, amount: 250000, retention_pct: 0 };
let n = 0;
const entry = (contract_id: string, kind: ContractEntryRow['kind'], date: string, value: number, extra: Partial<ContractEntryRow> = {}): ContractEntryRow => ({
  id: `e${++n}`, contract_id, kind, date, quantity: kind === 'work' ? value : 0, amount: kind === 'work' ? 0 : value, mode: kind === 'payment' ? 'cash' : '', note: '', created_at: `2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`, ...extra,
});
const entries = [
  entry('c1', 'payment', '2026-09-02', 5000, { note: 'advance' }),
  entry('c1', 'work', '2026-09-10', 1000),
  entry('c1', 'deduction', '2026-09-12', 700, { note: 'cement' }),
  entry('c1', 'work', '2026-09-20', 1500),
  entry('c1', 'payment', '2026-09-21', 30000, { mode: 'upi' }),
  entry('c2', 'work', '2026-09-15', 40),
  entry('c2', 'payment', '2026-09-16', 120000),
];

describe('labour contracts', () => {
  it('works out work done, retention, deductions and the balance due', () => {
    const t = contractTotals(plaster, entries);
    // 2,500 sqft × ₹18 = 45,000; 5% retention 2,250; less 700 deducted and 35,000 paid.
    expect(t).toMatchObject({ value: 72000, doneQty: 2500, workDone: 45000, retention: 2250, deductions: 700, paid: 35000, payable: 42050, balance: 7050, lastDate: '2026-09-21' });
    expect(t.progress).toBeCloseTo(0.625);
    // Lump sum: 40% of 2,50,000 done, 1,20,000 paid → 20,000 paid ahead.
    expect(contractTotals(plumbing, entries)).toMatchObject({ value: 250000, workDone: 100000, balance: -20000, progress: 0.4 });
    // Up to a date, and with the retention released.
    expect(contractTotals(plaster, entries, '2026-09-15').balance).toBe(18000 - 900 - 700 - 5000);
    expect(contractTotals({ ...plaster, retention_released_at: '2026-09-30' }, entries).balance).toBe(9300);
  });

  it('builds a statement with a running balance and a brought-forward line', () => {
    const all = contractStatement(plaster, entries);
    expect(all.opening).toBeNull();
    expect(all.rows.map((r) => r.balance)).toEqual([-5000, 13000, 12300, 39300, 9300]);
    expect(all.rows[0].particulars).toBe('Payment (Cash) - advance');
    const period = contractStatement(plaster, entries, { from: '2026-09-15', to: '2026-09-20' });
    expect(period.opening).toBe(12300);
    expect(period.rows).toHaveLength(1);
    expect(period.totals.workDone).toBe(45000);
  });

  it('describes terms and entries in words', () => {
    const money = (x: number) => `₹${x.toLocaleString('en-IN')}`;
    expect(describeTerms(plaster, money)).toBe('₹18 per sqft, about 4,000 sqft (₹72,000); 5% retention');
    expect(describeTerms(plumbing, money)).toBe('Lump sum ₹2,50,000');
    expect(describeEntry(plaster, entries[1])).toBe('Work: 1,000 sqft @ 18');
    expect(describeEntry(plumbing, entries[5])).toBe('Work: 40% of the job');
  });

  it('reports labour on a site for a period and categories', () => {
    const all = buildLabourReport([plaster, plumbing], entries, { address: 'Sector 44' });
    expect(all.rows.map((r) => r.contract.contractor)).toEqual(['Sunil', 'Ramesh']);
    expect(all.workDone).toBe(145000);
    const civil = buildLabourReport([plaster, plumbing], entries, { address: 'Sector 44', categories: ['Civil'], from: '2026-09-15' });
    expect(civil.rows).toHaveLength(1);
    expect(civil.rows[0]).toMatchObject({ workDone: 27000, paid: 30000, balance: 7050 });
    expect(buildLabourReport([plaster], entries, { address: 'Elsewhere' }).rows).toHaveLength(0);
  });
});
