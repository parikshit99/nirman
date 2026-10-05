import type { ContractEntryRow, ContractRow } from './schemas.ts';

// ---------------------------------------------------------------------------
// Labour contracts: what has been earned, held back, deducted and paid.
// ---------------------------------------------------------------------------

/** Value of one work entry: quantity × rate, or % of the lump sum. */
export function workValue(c: Pick<ContractRow, 'kind' | 'rate' | 'amount'>, e: Pick<ContractEntryRow, 'quantity'>): number {
  return c.kind === 'rate' ? e.quantity * c.rate : (e.quantity / 100) * c.amount;
}

/** Agreed value: the lump sum, or estimated quantity × rate (0 when no estimate). */
export const contractValue = (c: ContractRow) => (c.kind === 'rate' ? c.est_quantity * c.rate : c.amount);

export interface ContractTotals {
  /** Agreed or estimated value of the whole job. */
  value: number;
  /** Quantity measured (rate) or % done (lump sum). */
  doneQty: number;
  /** Share of the job done, 0–1, or null when there is no estimate. */
  progress: number | null;
  workDone: number;
  /** Held back from the work done; 0 once released. */
  retention: number;
  deductions: number;
  paid: number;
  /** What the contractor has earned so far: work done − retention − deductions. */
  payable: number;
  /** Payable − paid; negative means paid in advance of the work. */
  balance: number;
  /** Date of the latest entry, or ''. */
  lastDate: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Totals for a contract from its entries, optionally only those up to `upTo` (YYYY-MM-DD). */
export function contractTotals(c: ContractRow, entries: ContractEntryRow[], upTo = ''): ContractTotals {
  let doneQty = 0;
  let workDone = 0;
  let deductions = 0;
  let paid = 0;
  let lastDate = '';
  for (const e of entries) {
    if (e.contract_id !== c.id || (upTo && e.date > upTo)) continue;
    if (e.kind === 'work') {
      doneQty += e.quantity;
      workDone += workValue(c, e);
    } else if (e.kind === 'payment') paid += e.amount;
    else deductions += e.amount;
    if (e.date > lastDate) lastDate = e.date;
  }
  const released = !!c.retention_released_at && (!upTo || c.retention_released_at <= upTo);
  const retention = released ? 0 : (workDone * (c.retention_pct || 0)) / 100;
  const payable = workDone - retention - deductions;
  const target = c.kind === 'rate' ? c.est_quantity : 100;
  return {
    value: round2(contractValue(c)),
    doneQty: round2(doneQty),
    progress: target > 0 ? doneQty / target : null,
    workDone: round2(workDone),
    retention: round2(retention),
    deductions: round2(deductions),
    paid: round2(paid),
    payable: round2(payable),
    balance: round2(payable - paid),
    lastDate,
  };
}

/** Totals over several contracts (e.g. one site), summed field by field. */
export function sumTotals(list: ContractTotals[]): Pick<ContractTotals, 'value' | 'workDone' | 'retention' | 'deductions' | 'paid' | 'payable' | 'balance'> {
  const sum = (f: keyof ContractTotals) => round2(list.reduce((a, t) => a + (t[f] as number), 0));
  return { value: sum('value'), workDone: sum('workDone'), retention: sum('retention'), deductions: sum('deductions'), paid: sum('paid'), payable: sum('payable'), balance: sum('balance') };
}

const PAYMENT_MODES: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque' };
export const paymentModes = Object.keys(PAYMENT_MODES);
export const paymentModeLabel = (mode: string) => PAYMENT_MODES[mode] ?? mode;

const num = (n: number) => Number(n.toFixed(3)).toLocaleString('en-IN');

/** One line describing an entry, e.g. "Work: 120 sqft" or "Payment (UPI) - advance". */
export function describeEntry(c: ContractRow, e: ContractEntryRow): string {
  const note = e.note.trim() ? ` - ${e.note.trim()}` : '';
  if (e.kind === 'work') return `Work: ${c.kind === 'rate' ? `${num(e.quantity)} ${c.unit || 'unit'} @ ${num(c.rate)}` : `${num(e.quantity)}% of the job`}${note}`;
  if (e.kind === 'payment') return `Payment${e.mode ? ` (${paymentModeLabel(e.mode)})` : ''}${note}`;
  return `Deduction${note}`;
}

/** The agreed terms in words, e.g. "₹18 per sqft, about 4,000 sqft" or "Lump sum ₹2,50,000". */
export function describeTerms(c: ContractRow, money: (n: number) => string): string {
  const terms =
    c.kind === 'rate'
      ? `${money(c.rate)} per ${c.unit || 'unit'}${c.est_quantity > 0 ? `, about ${num(c.est_quantity)} ${c.unit || 'unit'} (${money(contractValue(c))})` : ''}`
      : `Lump sum ${money(c.amount)}`;
  return c.retention_pct > 0 ? `${terms}; ${num(c.retention_pct)}% retention` : terms;
}

export interface StatementRow {
  date: string;
  particulars: string;
  work: number;
  deduction: number;
  paid: number;
  /** Work done − deductions − paid so far (before retention). */
  balance: number;
}

export interface ContractStatement {
  /** Balance (before retention) brought forward from before `from`; null when there is no start date. */
  opening: number | null;
  rows: StatementRow[];
  /** Totals up to `to` (or everything). */
  totals: ContractTotals;
}

/** Account statement for a contractor: every entry with a running balance, and totals at the end. */
export function contractStatement(c: ContractRow, entries: ContractEntryRow[], opts: { from?: string; to?: string } = {}): ContractStatement {
  const own = entries
    .filter((e) => e.contract_id === c.id && (!opts.to || e.date <= opts.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  let balance = 0;
  let opening: number | null = null;
  const rows: StatementRow[] = [];
  for (const e of own) {
    const work = e.kind === 'work' ? workValue(c, e) : 0;
    const deduction = e.kind === 'deduction' ? e.amount : 0;
    const paid = e.kind === 'payment' ? e.amount : 0;
    if (opts.from && e.date < opts.from) {
      balance += work - deduction - paid;
      continue;
    }
    if (opts.from && opening === null) opening = round2(balance);
    balance += work - deduction - paid;
    rows.push({ date: e.date, particulars: describeEntry(c, e), work: round2(work), deduction: round2(deduction), paid: round2(paid), balance: round2(balance) });
  }
  if (opts.from && opening === null) opening = round2(balance);
  return { opening, rows, totals: contractTotals(c, entries, opts.to) };
}

export interface LabourReportRow {
  contract: ContractRow;
  /** Work done and paid within the period. */
  workDone: number;
  paid: number;
  /** Balance today, whatever the period. */
  balance: number;
}

export interface LabourReport {
  rows: LabourReportRow[];
  workDone: number;
  paid: number;
  balance: number;
}

/** Labour on one site for the site report: work done and paid per contract in the period. */
export function buildLabourReport(
  contracts: ContractRow[],
  entries: ContractEntryRow[],
  opts: { address: string; from?: string; to?: string; categories?: string[] },
): LabourReport {
  const wanted = new Set((opts.categories ?? []).map((c) => c.trim().toLowerCase()));
  const rows: LabourReportRow[] = [];
  for (const c of contracts) {
    if (c.address !== opts.address) continue;
    if (wanted.size && !wanted.has((c.category || 'Uncategorised').toLowerCase())) continue;
    let workDone = 0;
    let paid = 0;
    let any = false;
    for (const e of entries) {
      if (e.contract_id !== c.id || (opts.from && e.date < opts.from) || (opts.to && e.date > opts.to)) continue;
      any = true;
      if (e.kind === 'work') workDone += workValue(c, e);
      else if (e.kind === 'payment') paid += e.amount;
    }
    if (!any && (opts.from || opts.to)) continue;
    rows.push({ contract: c, workDone: round2(workDone), paid: round2(paid), balance: contractTotals(c, entries).balance });
  }
  rows.sort((a, b) => b.workDone - a.workDone || a.contract.contractor.localeCompare(b.contract.contractor));
  const sum = (f: 'workDone' | 'paid' | 'balance') => round2(rows.reduce((a, r) => a + r[f], 0));
  return { rows, workDone: sum('workDone'), paid: sum('paid'), balance: sum('balance') };
}
