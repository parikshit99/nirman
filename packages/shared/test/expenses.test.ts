import { describe, expect, it } from 'vitest';
import {
  buildExpenseReport,
  buildSiteReport,
  expenseKindLabel,
  expenseKinds,
  expenseProblem,
  expenseRowSchema,
  fieldLimits,
  siteReportGrandTotal,
  siteReportParts,
  sortExpenses,
  type ExpenseRow,
  type LabourReport,
} from '../src/index.ts';

const ts = '2026-10-01T00:00:00.000Z';
const expense = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: 'e', project_id: 'p1', date: '2026-10-01', kind: 'rent', amount: 1000, paid_to: '', mode: '', note: '', created_at: ts, updated_at: ts, ...over,
});

describe('expenses', () => {
  it('names every kind in plain words', () => {
    expect(expenseKinds.map(expenseKindLabel)).toEqual(['Rent', 'Transport', 'Food and tea', 'Electricity and water', 'Permits and fees', 'Other']);
  });

  it('checks the amount, date, kind and payment mode before saving', () => {
    const ok = { date: '2026-10-01', kind: 'food', amount: 50, mode: 'upi' };
    expect(expenseProblem(ok)).toBeNull();
    expect(expenseProblem({ ...ok, mode: '' })).toBeNull();
    expect(expenseProblem({ ...ok, amount: 0 })).toBe('Enter an amount above ₹0.');
    expect(expenseProblem({ ...ok, amount: -1 })).toBe('Enter an amount above ₹0.');
    expect(expenseProblem({ ...ok, amount: Infinity })).toBe('Enter an amount above ₹0.');
    expect(expenseProblem({ ...ok, date: '' })).not.toBeNull();
    expect(expenseProblem({ ...ok, kind: 'bribe' })).not.toBeNull();
    expect(expenseProblem({ ...ok, mode: 'gold' })).not.toBeNull();
  });

  it('keeps paid to, mode and note within their limits, and reads a stored row', () => {
    expect(fieldLimits('expenses')).toMatchObject({ paid_to: 200, mode: 40, note: 500 });
    expect(expenseRowSchema.safeParse(expense({})).success).toBe(true);
    expect(expenseRowSchema.safeParse(expense({ kind: 'party' as ExpenseRow['kind'] })).success).toBe(false);
  });

  it('sorts newest first', () => {
    const rows = [expense({ id: 'a', date: '2026-10-01' }), expense({ id: 'b', date: '2026-10-03' }), expense({ id: 'c', date: '2026-10-01', created_at: '2026-10-02T00:00:00.000Z' })];
    expect(sortExpenses(rows).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('expenses in the site report', () => {
  const rows = [
    expense({ id: 'r', kind: 'rent', amount: 12000, date: '2026-09-28' }),
    expense({ id: 'f2', kind: 'food', amount: 200.5, date: '2026-10-04' }),
    expense({ id: 'f1', kind: 'food', amount: 300, date: '2026-10-02' }),
    expense({ id: 't', kind: 'transport', amount: 800, date: '2026-10-10' }),
    expense({ id: 'x', project_id: 'p2', kind: 'other', amount: 99, date: '2026-10-02' }),
  ];

  it('subtotals each kind in a fixed order with its lines oldest first, and totals them', () => {
    const r = buildExpenseReport(rows, { projectId: 'p1' });
    expect(r.included).toBe(true);
    expect(r.kinds.map((k) => [k.label, k.amount, k.lines.map((e) => e.id)])).toEqual([
      ['Rent', 12000, ['r']],
      ['Transport', 800, ['t']],
      ['Food and tea', 500.5, ['f1', 'f2']],
    ]);
    expect([r.total, r.lineCount, r.recorded]).toEqual([13300.5, 4, 4]);
  });

  it('honours the dates, and knows when the dates left none', () => {
    const october = buildExpenseReport(rows, { projectId: 'p1', from: '2026-10-01', to: '2026-10-05' });
    expect(october.kinds.map((k) => k.kind)).toEqual(['food']);
    expect(october.total).toBe(500.5);
    const none = buildExpenseReport(rows, { projectId: 'p1', from: '2026-11-01' });
    expect([none.lineCount, none.total, none.recorded]).toEqual([0, 0, 4]);
  });

  it('leaves expenses out when work types are picked, as they have none', () => {
    const r = buildExpenseReport(rows, { projectId: 'p1', categories: ['Civil'] });
    expect([r.included, r.total, r.kinds.length, r.recorded]).toEqual([false, 0, 0, 4]);
    expect(buildExpenseReport(rows, { projectId: 'p1', categories: [] }).included).toBe(true);
  });

  it('adds materials, labour work done and expenses into the grand total', () => {
    const list = { id: 'l', kind: 'audit' as const, status: 'saved' as const, project_id: 'p1', title: '', address: '', category: 'Civil', site_date: '2026-10-02', notes: '', created_at: ts, updated_at: ts };
    const item = {
      id: 'i', list_id: 'l', item_name: 'Cement', original_term: '', quantity: 10, unit: 'Bag', unit_price: 400, total_amount: 4000, vendor: '', date: '2026-10-02',
      brand: '', model: '', spec: '', color: '', delivered_at: '', ordered_as: '', photo_id: '', rates_excluded: 0, read_as: '', created_at: ts, updated_at: ts,
    };
    const materials = buildSiteReport([list], [item], {}, { deliveredOnly: false });
    const labour = { rows: [{}], workDone: 6000, paid: 0, balance: 0 } as unknown as LabourReport;
    const all = buildExpenseReport(rows, { projectId: 'p1' });
    expect(siteReportGrandTotal(materials, labour, all)).toBe(4000 + 6000 + 13300.5);
    expect(siteReportGrandTotal(materials, undefined, all)).toBe(17300.5);
    expect(siteReportGrandTotal(materials, labour, buildExpenseReport(rows, { projectId: 'p1', categories: ['Civil'] }))).toBe(10000);
    expect(siteReportParts(labour, all).grandParts).toBe('materials + labour work done + expenses');
    expect(siteReportParts(undefined, buildExpenseReport([], {}))).toMatchObject({ showExpenses: false, withExpenses: false, grandParts: 'materials' });
  });
});
