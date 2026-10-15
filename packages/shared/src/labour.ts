import { todayISO } from './domain.ts';
import { formatQty } from './format.ts';
import type { ContractEntryRow, ContractRateRow, ContractRow } from './schemas.ts';

// ---------------------------------------------------------------------------
// Labour contracts: what has been earned, held back, deducted and paid.
// ---------------------------------------------------------------------------

/** Money handed to the contractor: a payment, or an advance (kharcha) before the work is measured. */
export const isPaidOut = (kind: ContractEntryRow['kind']) => kind === 'payment' || kind === 'advance';

/** A rate change as the rules need it. */
export type RateChange = Pick<ContractRateRow, 'rate' | 'from_date'>;

/**
 * A contract with its rate changes (rate contracts only; a lump sum's are ignored). Without `rates` it is valued at
 * its own rate throughout, as before rate changes existed. The rules below all take one.
 */
export type ContractWithRates = ContractRow & { rates?: readonly RateChange[] };

/** Each contract with its own rate changes, oldest first (any not above 0 left out): what the screens, statements and reports are given. */
export function withRates<C extends ContractRow>(contracts: C[], rates: readonly ContractRateRow[]): (C & { rates: ContractRateRow[] })[] {
  const byContract = new Map<string, ContractRateRow[]>();
  for (const r of rates) {
    if (!(r.rate > 0)) continue;
    const list = byContract.get(r.contract_id);
    if (list) list.push(r);
    else byContract.set(r.contract_id, [r]);
  }
  for (const list of byContract.values()) list.sort((a, b) => a.from_date.localeCompare(b.from_date));
  return contracts.map((c) => ({ ...c, rates: byContract.get(c.id) ?? [] }));
}

/**
 * The rate in effect on a date: the latest change from that date or before, else the contract's own rate. Without a
 * date (a new entry not dated yet), the latest rate. A change not above 0 (only possible from an edited backup) is ignored.
 */
export function rateOn(c: Pick<ContractWithRates, 'kind' | 'rate' | 'rates'>, date?: string): number {
  let rate = c.rate;
  let since = '';
  if (c.kind !== 'rate') return rate;
  for (const r of c.rates ?? []) {
    if (r.rate > 0 && (date === undefined || r.from_date <= date) && r.from_date >= since) {
      rate = r.rate;
      since = r.from_date;
    }
  }
  return rate;
}

/** Value of one work entry: quantity × the rate in effect on its date, or % of the lump sum. */
export function workValue(c: Pick<ContractWithRates, 'kind' | 'rate' | 'amount' | 'rates'>, e: Pick<ContractEntryRow, 'quantity'> & { date?: string }): number {
  return c.kind === 'rate' ? e.quantity * rateOn(c, e.date) : (e.quantity / 100) * c.amount;
}

/** Agreed value: the lump sum, or estimated quantity × the latest rate (0 when no estimate). */
export const contractValue = (c: ContractWithRates) => (c.kind === 'rate' ? c.est_quantity * rateOn(c) : c.amount);

/**
 * Work counted for a total of work entries worth `value`: a lump sum never earns more than its amount, however much
 * past 100% the entries add up to; a rate job is owed on everything measured, past the estimate too.
 */
const counted = (c: Pick<ContractRow, 'kind' | 'amount'>, value: number) => (c.kind === 'rate' ? value : Math.min(value, Math.max(0, c.amount)));

export interface ContractTotals {
  /** Agreed or estimated value of the whole job. */
  value: number;
  /** Quantity measured (rate) or % done (lump sum), as entered: may be past the estimate or 100%. */
  doneQty: number;
  /** Share of the job done (1 = all of it, more when measured past it), or null when there is no estimate. */
  progress: number | null;
  /** Value of the work, a lump sum's capped at its amount. */
  workDone: number;
  /** Held back from the work done; 0 once released. */
  retention: number;
  deductions: number;
  /** Payments and advances together. */
  paid: number;
  /** Of what was paid, the advances (kharcha). */
  advances: number;
  /** What the contractor has earned so far: work done − retention − deductions. */
  payable: number;
  /** Payable − paid; negative means paid in advance of the work. */
  balance: number;
  /** Date of the latest entry, or ''. */
  lastDate: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Totals for a contract from its entries, optionally only those up to `upTo` (YYYY-MM-DD). */
export function contractTotals(c: ContractWithRates, entries: ContractEntryRow[], upTo = ''): ContractTotals {
  let doneQty = 0;
  let workDone = 0;
  let deductions = 0;
  let paid = 0;
  let advances = 0;
  let lastDate = '';
  for (const e of entries) {
    if (e.contract_id !== c.id || (upTo && e.date > upTo)) continue;
    if (e.kind === 'work') {
      doneQty += e.quantity;
      workDone += workValue(c, e);
    } else if (isPaidOut(e.kind)) {
      paid += e.amount;
      if (e.kind === 'advance') advances += e.amount;
    } else deductions += e.amount;
    if (e.date > lastDate) lastDate = e.date;
  }
  workDone = counted(c, workDone);
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
    advances: round2(advances),
    payable: round2(payable),
    balance: round2(payable - paid),
    lastDate,
  };
}

/** What is owed across contracts, without netting one contractor's overpayment against another's dues. */
export interface DuesSplit {
  /** Sum of the balances still due (the positive ones). */
  due: number;
  /** Sum of what was paid ahead of the work (negative balances, as a positive amount), where the work earned something. */
  paidAhead: number;
  /** Sum of what contractors owe back: negative balances where deductions are more than the work (payable below 0). */
  owes: number;
}

/** A negative balance from deductions past the work: the contractor owes it, rather than was paid ahead. */
const owing = (t: Pick<ContractTotals, 'balance' | 'payable'>) => t.balance < 0 && t.payable < 0;

const splitDues = (list: Pick<ContractTotals, 'balance' | 'payable'>[]): DuesSplit => ({
  due: round2(list.reduce((a, t) => a + Math.max(0, t.balance), 0)),
  paidAhead: round2(list.reduce((a, t) => a - (owing(t) ? 0 : Math.min(0, t.balance)), 0)),
  owes: round2(list.reduce((a, t) => a - (owing(t) ? t.balance : 0), 0)),
});

/** Totals over several contracts (e.g. one site), summed field by field, plus what is due and paid ahead. */
export function sumTotals(list: ContractTotals[]): Pick<ContractTotals, 'value' | 'workDone' | 'retention' | 'deductions' | 'paid' | 'payable' | 'balance'> & DuesSplit {
  const sum = (f: keyof ContractTotals) => round2(list.reduce((a, t) => a + (t[f] as number), 0));
  return {
    value: sum('value'),
    workDone: sum('workDone'),
    retention: sum('retention'),
    deductions: sum('deductions'),
    paid: sum('paid'),
    payable: sum('payable'),
    balance: sum('balance'),
    ...splitDues(list),
  };
}

/**
 * What a balance is called: "Balance due", "Balance", "Contractor owes" (deductions are more than the work), or
 * "Paid ahead of work" ("Overpaid" once the contract is closed).
 */
export function balanceLabel(c: Pick<ContractRow, 'status'>, t: Pick<ContractTotals, 'balance' | 'payable'>): string {
  if (owing(t)) return 'Contractor owes';
  if (t.balance < 0) return c.status === 'closed' ? 'Overpaid' : 'Paid ahead of work';
  return t.balance > 0 ? 'Balance due' : 'Balance';
}

/** Why contract terms can't be saved, or null: the rate or lump sum must be above 0, the estimate not below 0, retention 0–50%. */
export function contractTermsProblem(t: Pick<ContractRow, 'kind' | 'rate' | 'amount' | 'est_quantity' | 'retention_pct'>): string | null {
  if (t.kind === 'rate') {
    if (!(t.rate > 0)) return 'Enter a rate above ₹0.';
    if (!(t.est_quantity >= 0)) return 'The estimate can’t be below 0.';
  } else if (!(t.amount > 0)) return 'Enter an amount above ₹0.';
  if (!(t.retention_pct >= 0 && t.retention_pct <= 50)) return 'Retention is a percentage between 0 and 50.';
  return null;
}

/** Why a contract with work recorded keeps its kind: its work entries are sqft (or another unit) for a rate, % for a lump sum. */
export function kindLockedNote(c: Pick<ContractRow, 'kind' | 'unit'>): string {
  return c.kind === 'rate' ? `Work is recorded in ${c.unit || 'unit'}, so this contract stays a rate contract.` : 'Work is recorded as % of the job, so this contract stays a lump sum.';
}

/** Why a rate contract with rate changes (and no work) keeps its kind: a lump sum has no rate changes. */
export const rateChangesLockedNote = 'This contract has rate changes, so it stays a rate contract. Delete them to change it.';

/** "Measured 5,000 of about 4,000 sqft" for a rate job measured past its estimate (the rate is owed on all of it); otherwise null. */
export function pastEstimate(c: ContractWithRates, t: Pick<ContractTotals, 'doneQty'>): string | null {
  if (c.kind !== 'rate' || !(c.est_quantity > 0) || t.doneQty <= c.est_quantity) return null;
  return `Measured ${formatQty(t.doneQty)} of about ${formatQty(c.est_quantity)} ${c.unit || 'unit'}`;
}

const PAYMENT_MODES: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque' };
export const paymentModes = Object.keys(PAYMENT_MODES);
export const paymentModeLabel = (mode: string) => PAYMENT_MODES[mode] ?? mode;


/** One line describing an entry, e.g. "Work: 120 sqft @ 20" (the rate on its date) or "Payment (UPI) - advance". */
export function describeEntry(c: ContractWithRates, e: ContractEntryRow): string {
  const note = e.note.trim() ? ` - ${e.note.trim()}` : '';
  if (e.kind === 'work') return `Work: ${c.kind === 'rate' ? `${formatQty(e.quantity)} ${c.unit || 'unit'} @ ${formatQty(rateOn(c, e.date))}` : `${formatQty(e.quantity)}% of the job`}${note}`;
  if (e.kind === 'payment') return `Payment${e.mode ? ` (${paymentModeLabel(e.mode)})` : ''}${note}`;
  if (e.kind === 'advance') return `Advance (kharcha)${e.mode ? `, ${paymentModeLabel(e.mode)}` : ''}${note}`;
  return `Deduction${note}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date in a line of text: "1 Oct" this year, "1 Oct 2025" in another. */
export function shortDate(iso: string, today = todayISO()): string {
  const [y, m, d] = iso.split('-');
  const day = `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`;
  return y === today.slice(0, 4) ? day : `${day} ${y}`;
}

/** The rate changes in words, oldest first, e.g. ", ₹20 from 1 Oct, ₹22 from 1 Jan 2027"; '' when none. */
const describeRateChanges = (c: ContractWithRates, money: (n: number) => string, today: string) =>
  (c.rates ?? [])
    .filter((r) => r.rate > 0)
    .sort((a, b) => a.from_date.localeCompare(b.from_date))
    .map((r) => `, ${money(r.rate)} from ${shortDate(r.from_date, today)}`)
    .join('');

/** The agreed terms in words, e.g. "₹18 per sqft, ₹20 from 1 Oct, about 4,000 sqft (₹80,000)" or "Lump sum ₹2,50,000". */
export function describeTerms(c: ContractWithRates, money: (n: number) => string, today = todayISO()): string {
  const terms =
    c.kind === 'rate'
      ? `${money(c.rate)} per ${c.unit || 'unit'}${describeRateChanges(c, money, today)}${c.est_quantity > 0 ? `, about ${formatQty(c.est_quantity)} ${c.unit || 'unit'} (${money(contractValue(c))})` : ''}`
      : `Lump sum ${money(c.amount)}`;
  return c.retention_pct > 0 ? `${terms}; ${formatQty(c.retention_pct)}% retention` : terms;
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
export function contractStatement(c: ContractWithRates, entries: ContractEntryRow[], opts: { from?: string; to?: string } = {}): ContractStatement {
  const own = entries
    .filter((e) => e.contract_id === c.id && (!opts.to || e.date <= opts.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  let balance = 0;
  let opening: number | null = null;
  /** Work entered so far, before the lump-sum cap. */
  let entered = 0;
  const rows: StatementRow[] = [];
  for (const e of own) {
    let work = 0;
    if (e.kind === 'work') {
      // Only what is left of a lump sum counts: an entry past 100% adds nothing.
      work = counted(c, entered + workValue(c, e)) - counted(c, entered);
      entered += workValue(c, e);
    }
    const deduction = e.kind === 'deduction' ? e.amount : 0;
    const paid = isPaidOut(e.kind) ? e.amount : 0;
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
  contract: ContractWithRates;
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
  /** Net of every balance; `due`, `paidAhead` and `owes` keep them apart. */
  balance: number;
  due: number;
  paidAhead: number;
  owes: number;
}

/** Labour on one site for the site report: work done and paid per contract in the period. */
export function buildLabourReport(
  contracts: ContractWithRates[],
  entries: ContractEntryRow[],
  /** `address` absent: every contract given. */
  opts: { address?: string; from?: string; to?: string; categories?: string[] },
): LabourReport {
  const wanted = new Set((opts.categories ?? []).map((c) => c.trim().toLowerCase()));
  const rows: LabourReportRow[] = [];
  const now: Pick<ContractTotals, 'balance' | 'payable'>[] = [];
  for (const c of contracts) {
    if (opts.address !== undefined && c.address !== opts.address) continue;
    if (wanted.size && !wanted.has((c.category || 'Uncategorised').toLowerCase())) continue;
    let before = 0;
    let workDone = 0;
    let paid = 0;
    let any = false;
    for (const e of entries) {
      if (e.contract_id !== c.id || (opts.to && e.date > opts.to)) continue;
      if (opts.from && e.date < opts.from) {
        if (e.kind === 'work') before += workValue(c, e);
        continue;
      }
      any = true;
      if (e.kind === 'work') workDone += workValue(c, e);
      else if (isPaidOut(e.kind)) paid += e.amount;
    }
    if (!any && (opts.from || opts.to)) continue;
    // A lump sum's work in the period is only what was left of it at the start.
    workDone = counted(c, before + workDone) - counted(c, before);
    const t = contractTotals(c, entries);
    now.push(t);
    rows.push({ contract: c, workDone: round2(workDone), paid: round2(paid), balance: t.balance });
  }
  rows.sort((a, b) => b.workDone - a.workDone || a.contract.contractor.localeCompare(b.contract.contractor));
  const sum = (f: 'workDone' | 'paid' | 'balance') => round2(rows.reduce((a, r) => a + r[f], 0));
  return { rows, workDone: sum('workDone'), paid: sum('paid'), balance: sum('balance'), ...splitDues(now) };
}
