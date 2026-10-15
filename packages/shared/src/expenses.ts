import type { SiteReport } from './domain.ts';
import { paymentModes, type LabourReport } from './labour.ts';
import { expenseKinds, type ExpenseKind, type ExpenseRow } from './schemas.ts';

// ---------------------------------------------------------------------------
// Site expenses: rent, transport, food and other money spent on a project.
// ---------------------------------------------------------------------------

const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
  rent: 'Rent',
  transport: 'Transport',
  food: 'Food and tea',
  utilities: 'Electricity and water',
  permits: 'Permits and fees',
  other: 'Other',
};
export const expenseKindLabel = (kind: string) => EXPENSE_KIND_LABELS[kind as ExpenseKind] ?? kind;

/** Shown in place of the expenses when work types are picked in the site report. */
export const EXPENSES_FILTERED_NOTE = 'Expenses have no work type, so they show only with all work types.';
/** Shown in the expenses part of the site report when the dates leave none. */
export const NO_EXPENSES_MATCH = 'No expenses match these filters.';

/** What is wrong with an expense before it is saved, in words for the user; null when it can be saved. */
export function expenseProblem(e: { date: string; kind: string; amount: number; mode: string }): string | null {
  if (!(Number.isFinite(e.amount) && e.amount > 0)) return 'Enter an amount above ₹0.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Pick the date.';
  if (!(expenseKinds as readonly string[]).includes(e.kind)) return 'Pick what it was for.';
  if (e.mode && !paymentModes.includes(e.mode)) return 'Pick how it was paid.';
  return null;
}

/** Expenses newest first, as a project's list shows them. */
export const sortExpenses = (rows: ExpenseRow[]) => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

export interface ExpenseReportKind {
  kind: ExpenseKind;
  label: string;
  amount: number;
  /** Oldest first. */
  lines: ExpenseRow[];
}

export interface ExpenseReport {
  /** False when work types are picked: expenses have none, so the site report leaves them out (EXPENSES_FILTERED_NOTE). */
  included: boolean;
  /** In the order of expenseKinds; kinds with nothing in the period are left out. */
  kinds: ExpenseReportKind[];
  total: number;
  lineCount: number;
  /** Expenses of the project before the dates were applied: 0 means none were ever recorded, so the part is not shown. */
  recorded: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Expenses for the site report: a subtotal per kind with its lines, within the dates, and only with all work types. */
export function buildExpenseReport(
  expenses: ExpenseRow[],
  /** `projectId` absent: every expense given. */
  opts: { projectId?: string; from?: string; to?: string; categories?: string[] },
): ExpenseReport {
  const own = expenses.filter((e) => opts.projectId === undefined || e.project_id === opts.projectId);
  const included = !(opts.categories ?? []).some((c) => c.trim());
  const byKind = new Map<ExpenseKind, ExpenseRow[]>();
  if (included) {
    for (const e of own) {
      if ((opts.from && e.date < opts.from) || (opts.to && e.date > opts.to)) continue;
      const lines = byKind.get(e.kind) ?? [];
      lines.push(e);
      byKind.set(e.kind, lines);
    }
  }
  const kinds = expenseKinds
    .filter((k) => byKind.has(k))
    .map((kind) => {
      const lines = byKind.get(kind)!.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
      return { kind, label: expenseKindLabel(kind), amount: round2(lines.reduce((a, e) => a + (e.amount || 0), 0)), lines };
    });
  return {
    included,
    kinds,
    total: round2(kinds.reduce((a, k) => a + k.amount, 0)),
    lineCount: kinds.reduce((n, k) => n + k.lines.length, 0),
    recorded: own.length,
  };
}

/** The site report's grand total: materials + labour work done + expenses (when they are included). */
export function siteReportGrandTotal(report: SiteReport, labour?: LabourReport, expenses?: ExpenseReport): number {
  return round2(report.total + (labour?.workDone ?? 0) + (expenses?.included ? expenses.total : 0));
}

/**
 * Which parts a site report has besides materials: labour when a contract had work or payments, expenses (or the note
 * that they are left out) when the project has any. `grandParts` says what the grand total adds up.
 */
export function siteReportParts(labour?: LabourReport, expenses?: ExpenseReport) {
  const hasLabour = !!labour?.rows.length;
  const showExpenses = !!expenses && expenses.recorded > 0;
  const withExpenses = showExpenses && expenses!.included;
  const grandParts = ['materials', hasLabour && 'labour work done', withExpenses && 'expenses'].filter(Boolean).join(' + ');
  return { hasLabour, showExpenses, withExpenses, grandParts };
}
