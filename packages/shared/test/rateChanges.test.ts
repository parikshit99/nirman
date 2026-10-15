import { describe, expect, it } from 'vitest';
import {
  buildLabourReport,
  contractRateRowSchema,
  contractStatement,
  contractTotals,
  contractValue,
  describeEntry,
  describeTerms,
  rateOn,
  shortDate,
  withRates,
  workValue,
  type ContractEntryRow,
  type ContractRateRow,
  type ContractRow,
} from '../src/index.ts';

/*
 * Rate changes on labour contracts (7.15): each work entry is valued at the rate in effect on its date, the latest
 * change from that date or before, else the contract's own rate.
 */

const ts = '2026-10-01T00:00:00.000Z';
const plaster: ContractRow = {
  id: 'c1', project_id: 'p1', contractor: 'Ramesh', phone: '', address: 'Sector 44', category: 'Civil', work: 'Plaster', kind: 'rate', rate: 18, unit: 'sqft',
  est_quantity: 4000, amount: 0, retention_pct: 0, start_date: '2026-09-01', status: 'active', retention_released_at: '', notes: '', created_at: ts, updated_at: ts,
};
const plumbing: ContractRow = { ...plaster, id: 'c2', contractor: 'Sunil', kind: 'lump_sum', rate: 0, unit: '', est_quantity: 0, amount: 100000 };
const change = (contract_id: string, from_date: string, rate: number): ContractRateRow => ({ id: `r-${contract_id}-${from_date}`, contract_id, rate, from_date, created_at: ts, updated_at: ts });
let n = 0;
const entry = (contract_id: string, kind: ContractEntryRow['kind'], date: string, value: number): ContractEntryRow => ({
  id: `e${++n}`, contract_id, kind, date, quantity: kind === 'work' ? value : 0, amount: kind === 'work' ? 0 : value, mode: '', note: '', created_at: `2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`,
});
const money = (v: number) => `₹${v.toLocaleString('en-IN')}`;

// ₹18 to start, ₹20 from 1 Oct, ₹22 from 1 Nov. Given newest first: the order they come in must not matter.
const rates = [change('c1', '2026-11-01', 22), change('c1', '2026-10-01', 20), change('c2', '2026-10-01', 5)];
const [dated, lump] = withRates([plaster, plumbing], rates);
const entries = [
  entry('c1', 'work', '2026-09-30', 100), // 1,800
  entry('c1', 'work', '2026-10-01', 100), // 2,000
  entry('c1', 'payment', '2026-10-05', 3000),
  entry('c1', 'work', '2026-10-31', 50), // 1,000
  entry('c1', 'work', '2026-11-02', 10), // 220
];

describe('rate changes on labour contracts', () => {
  it('values work at the rate in effect on its date: before, on and after a change, with two changes', () => {
    expect(dated.rates.map((r) => r.from_date)).toEqual(['2026-10-01', '2026-11-01']);
    expect(rateOn(dated, '2026-09-30')).toBe(18);
    expect(rateOn(dated, '2026-10-01')).toBe(20);
    expect(rateOn(dated, '2026-10-31')).toBe(20);
    expect(rateOn(dated, '2026-11-01')).toBe(22);
    // Not dated yet (a new entry being typed): the latest rate.
    expect(rateOn(dated)).toBe(22);
    expect(workValue(dated, { quantity: 10, date: '2026-09-15' })).toBe(180);
    expect(workValue(dated, { quantity: 10 })).toBe(220);
    // Without its changes, a contract is valued at its own rate as before.
    expect(rateOn(plaster, '2026-11-02')).toBe(18);
  });

  it('uses dated rates in totals and the statement, and the latest rate for the agreed value', () => {
    const t = contractTotals(dated, entries);
    expect(t.workDone).toBe(1800 + 2000 + 1000 + 220);
    expect(t.value).toBe(4000 * 22);
    expect(contractValue(dated)).toBe(88000);
    expect(contractTotals(dated, entries, '2026-10-05').workDone).toBe(3800);
    const st = contractStatement(dated, entries, { from: '2026-10-01' });
    expect(st.opening).toBe(1800);
    expect(st.rows.map((r) => [r.particulars, r.work])).toEqual([
      ['Work: 100 sqft @ 20', 2000],
      ['Payment', 0],
      ['Work: 50 sqft @ 20', 1000],
      ['Work: 10 sqft @ 22', 220],
    ]);
    expect(st.rows.at(-1)!.balance).toBe(5020 - 3000);
    expect(describeEntry(dated, entries[0])).toBe('Work: 100 sqft @ 18');
  });

  it('uses dated rates for labour in a site report period', () => {
    const october = buildLabourReport([dated], entries, { from: '2026-10-01', to: '2026-10-31' });
    expect(october.rows[0]).toMatchObject({ workDone: 3000, paid: 3000, balance: 5020 - 3000 });
    expect(buildLabourReport([dated], entries, { from: '2026-11-01' }).workDone).toBe(220);
  });

  it('describes the terms with every change, oldest first, and the year only when it is another', () => {
    expect(describeTerms(dated, money, '2026-10-15')).toBe('₹18 per sqft, ₹20 from 1 Oct, ₹22 from 1 Nov, about 4,000 sqft (₹88,000)');
    expect(describeTerms({ ...dated, est_quantity: 0 }, money, '2027-01-05')).toBe('₹18 per sqft, ₹20 from 1 Oct 2026, ₹22 from 1 Nov 2026');
    expect(describeTerms(plaster, money, '2026-10-15')).toBe('₹18 per sqft, about 4,000 sqft (₹72,000)');
    expect(shortDate('2025-03-09', '2026-10-15')).toBe('9 Mar 2025');
  });

  it('leaves a lump sum as it was, whatever changes it carries', () => {
    const work = [entry('c2', 'work', '2026-10-10', 40), entry('c2', 'work', '2026-10-20', 80)];
    expect(rateOn(lump, '2026-10-10')).toBe(0);
    expect(contractTotals(lump, work)).toMatchObject({ value: 100000, workDone: 100000 });
    expect(describeTerms(lump, money)).toBe('Lump sum ₹1,00,000');
    expect(describeEntry(lump, work[0])).toBe('Work: 40% of the job');
  });

  it('accepts any rate in a stored change (so backups restore) but only dates as YYYY-MM-DD', () => {
    expect(contractRateRowSchema.safeParse(change('c1', '2026-10-01', 20)).success).toBe(true);
    expect(contractRateRowSchema.safeParse(change('c1', '2026-10-01', 0)).success).toBe(true);
    expect(contractRateRowSchema.safeParse(change('c1', '1 Oct', 20)).success).toBe(false);
  });

  it('ignores a change not above 0', () => {
    const [c] = withRates([plaster], [change('c1', '2026-10-01', 0), change('c1', '2026-11-01', -5)]);
    expect(c.rates).toEqual([]);
    const raw = { ...plaster, rates: [change('c1', '2026-10-01', 0)] };
    expect(rateOn(raw, '2026-10-05')).toBe(18);
    expect(describeTerms(raw, money)).not.toContain('from');
  });
});
