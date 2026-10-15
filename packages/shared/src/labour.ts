import { cleanUnit, unitFactor } from './catalog.ts';
import { formatDay, formatQty, formatRupees } from './format.ts';
import type { ContractEntryRow, ContractRow, ProjectRow } from './schemas.ts';

// ---------------------------------------------------------------------------
// Labour contracts: what has been earned, held back, deducted and paid.
// ---------------------------------------------------------------------------

/** Money handed to the contractor: a payment, or an advance (kharcha) before the work is measured. */
export const isPaidOut = (kind: ContractEntryRow['kind']) => kind === 'payment' || kind === 'advance';

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
export function contractTotals(c: ContractRow, entries: ContractEntryRow[], upTo = ''): ContractTotals {
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

/** Totals over several contracts (e.g. one site), summed field by field. */
export function sumTotals(list: ContractTotals[]): Pick<ContractTotals, 'value' | 'workDone' | 'retention' | 'deductions' | 'paid' | 'payable' | 'balance'> {
  const sum = (f: keyof ContractTotals) => round2(list.reduce((a, t) => a + (t[f] as number), 0));
  return { value: sum('value'), workDone: sum('workDone'), retention: sum('retention'), deductions: sum('deductions'), paid: sum('paid'), payable: sum('payable'), balance: sum('balance') };
}

const PAYMENT_MODES: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque' };
export const paymentModes = Object.keys(PAYMENT_MODES);
export const paymentModeLabel = (mode: string) => PAYMENT_MODES[mode] ?? mode;


/** One line describing an entry, e.g. "Work: 120 sqft" or "Payment (UPI) - advance". */
export function describeEntry(c: ContractRow, e: ContractEntryRow): string {
  const note = e.note.trim() ? ` - ${e.note.trim()}` : '';
  if (e.kind === 'work') return `Work: ${c.kind === 'rate' ? `${formatQty(e.quantity)} ${c.unit || 'unit'} @ ${formatQty(c.rate)}` : `${formatQty(e.quantity)}% of the job`}${note}`;
  if (e.kind === 'payment') return `Payment${e.mode ? ` (${paymentModeLabel(e.mode)})` : ''}${note}`;
  if (e.kind === 'advance') return `Advance (kharcha)${e.mode ? `, ${paymentModeLabel(e.mode)}` : ''}${note}`;
  return `Deduction${note}`;
}

/** The agreed terms in words, e.g. "₹18 per sqft, about 4,000 sqft" or "Lump sum ₹2,50,000". */
export function describeTerms(c: ContractRow, money: (n: number) => string): string {
  const terms =
    c.kind === 'rate'
      ? `${money(c.rate)} per ${c.unit || 'unit'}${c.est_quantity > 0 ? `, about ${formatQty(c.est_quantity)} ${c.unit || 'unit'} (${money(contractValue(c))})` : ''}`
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
  /** `address` absent: every contract given. */
  opts: { address?: string; from?: string; to?: string; categories?: string[] },
): LabourReport {
  const wanted = new Set((opts.categories ?? []).map((c) => c.trim().toLowerCase()));
  const rows: LabourReportRow[] = [];
  for (const c of contracts) {
    if (opts.address !== undefined && c.address !== opts.address) continue;
    if (wanted.size && !wanted.has((c.category || 'Uncategorised').toLowerCase())) continue;
    let workDone = 0;
    let paid = 0;
    let any = false;
    for (const e of entries) {
      if (e.contract_id !== c.id || (opts.from && e.date < opts.from) || (opts.to && e.date > opts.to)) continue;
      any = true;
      if (e.kind === 'work') workDone += workValue(c, e);
      else if (isPaidOut(e.kind)) paid += e.amount;
    }
    if (!any && (opts.from || opts.to)) continue;
    rows.push({ contract: c, workDone: round2(workDone), paid: round2(paid), balance: contractTotals(c, entries).balance });
  }
  rows.sort((a, b) => b.workDone - a.workDone || a.contract.contractor.localeCompare(b.contract.contractor));
  const sum = (f: 'workDone' | 'paid' | 'balance') => round2(rows.reduce((a, r) => a + r[f], 0));
  return { rows, workDone: sum('workDone'), paid: sum('paid'), balance: sum('balance') };
}

// ---------------------------------------------------------------------------
// Labour rates: what each trade has been paid per unit, across every project, to compare a new
// contractor's rate with the ones already agreed. Only rate contracts count; a lump sum says nothing per unit.
// ---------------------------------------------------------------------------

/** Trades and the words (English and Hinglish) that name them in a contract's Work. */
const TRADES: [trade: string, words: string[]][] = [
  ['Masonry', ['masonry', 'brick work', 'chinai', 'block work']],
  ['Plaster', ['plaster', 'plastering']],
  ['Tiling', ['tile', 'tiling']],
  ['Flooring', ['flooring', 'marble', 'granite', 'kota']],
  ['Painting', ['painting', 'paint', 'putty', 'primer', 'texture']],
  ['Shuttering', ['shuttering', 'centering', 'formwork']],
  ['Bar bending', ['bar bending', 'reinforcement', 'sariya bandhai']],
  ['Concrete', ['concrete', 'casting', 'dhalai', 'rcc', 'pcc']],
  ['Waterproofing', ['waterproofing']],
  ['POP and false ceiling', ['pop', 'plaster of paris', 'false ceiling', 'gypsum']],
  ['Plumbing', ['plumbing', 'plumber']],
  ['Electrical', ['electrical', 'wiring', 'electrician']],
  ['Carpentry', ['carpentry', 'carpenter', 'woodwork']],
  ['Fabrication', ['fabrication', 'welding', 'grill', 'railing']],
  ['Excavation', ['excavation', 'digging', 'khudai']],
];

// Each word as it is matched: also written as one word ("brickwork") and in the plural ("tiles").
const TRADE_WORDS = TRADES.flatMap(([trade, words]) =>
  words.flatMap((w) => [...new Set([w, w.replace(/ /g, '')])].flatMap((v) => [v, `${v}s`]).map((v) => ({ trade, text: ` ${v} ` }))),
);

/**
 * The trade a contract's Work names ("Internal plaster, 2nd floor" → Plaster), or null. Whole words only, so
 * "plastic" is not plaster. When several trades are named, the first one written wins ("Brick work and plaster"
 * is Masonry); at the same place the longer phrase wins ("Plaster of Paris" is POP).
 */
export function guessTrade(work: string): string | null {
  const text = ` ${work.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  let best: { trade: string; at: number; length: number } | null = null;
  for (const w of TRADE_WORDS) {
    const at = text.indexOf(w.text);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && w.text.length > best.length)) best = { trade: w.trade, at, length: w.text.length };
  }
  return best?.trade ?? null;
}

/** The card a contract's rate shows on in Labour rates: its trade, else its work type ("Civil, other work"). */
export const contractTrade = (c: Pick<ContractRow, 'work' | 'category'>) => guessTrade(c.work) ?? `${c.category.trim() || 'Uncategorised'}, other work`;

export interface LabourRateRow {
  contract: ContractRow;
  /** Name of the contract's project ('' when it is not found). */
  project: string;
  /** Rate per the card's unit: the contract's own, or converted from a unit of the same kind (sqm → sqft). */
  rate: number;
  /** The contract's start date, else the day (IST) it was added, YYYY-MM-DD. */
  date: string;
  closed: boolean;
}

export interface LabourRate {
  /** Trade and unit, unique among the cards. */
  key: string;
  trade: string;
  unit: string;
  min: number;
  max: number;
  count: number;
  /** The newest contract. */
  last: LabourRateRow;
  /** Every contract on the card, newest first. */
  rows: LabourRateRow[];
}

const IST_MS = 330 * 60_000;
const dayOf = (c: ContractRow) => c.start_date || (c.created_at ? new Date(Date.parse(c.created_at) + IST_MS).toISOString().slice(0, 10) : '');
const OTHER_WORK = /, other work$/;

/**
 * One card per trade and unit from the rate contracts of every project, ongoing and closed. Units of one kind share
 * a card (sqm with sqft), in the unit most of its contracts use; other units (day, point) get their own. Lump sums
 * and contracts without a rate are left out. Named trades come first, A to Z, then the "other work" cards.
 */
export function labourRates(contracts: ContractRow[], projects: Pick<ProjectRow, 'id' | 'name'>[]): LabourRate[] {
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const groups: { trade: string; unit: string; contracts: { c: ContractRow; unit: string; date: string }[] }[] = [];
  for (const c of contracts) {
    if (c.kind !== 'rate' || !(c.rate > 0)) continue;
    const trade = contractTrade(c);
    const unit = cleanUnit(c.unit) || 'unit';
    let group = groups.find((g) => g.trade === trade && unitFactor(unit, g.unit) !== null);
    if (!group) groups.push((group = { trade, unit, contracts: [] }));
    group.contracts.push({ c, unit, date: dayOf(c) });
  }
  const cards = groups.map((g): LabourRate => {
    const sorted = g.contracts.sort((a, b) => b.date.localeCompare(a.date) || b.c.created_at.localeCompare(a.c.created_at));
    // The unit most contracts use; on a tie, the newest one's.
    const uses = new Map<string, number>();
    for (const x of sorted) uses.set(x.unit.toLowerCase(), (uses.get(x.unit.toLowerCase()) ?? 0) + 1);
    const unit = sorted.reduce((best, x) => (uses.get(x.unit.toLowerCase())! > uses.get(best.toLowerCase())! ? x.unit : best), sorted[0].unit);
    const rows = sorted.map(({ c, unit: own, date }) => ({ contract: c, project: projectName.get(c.project_id) ?? '', rate: round2(c.rate / (unitFactor(own, unit) ?? 1)), date, closed: c.status === 'closed' }));
    const rates = rows.map((r) => r.rate);
    return { key: JSON.stringify([g.trade, unit.toLowerCase()]), trade: g.trade, unit, min: Math.min(...rates), max: Math.max(...rates), count: rows.length, last: rows[0], rows };
  });
  return cards.sort((a, b) => Number(OTHER_WORK.test(a.trade)) - Number(OTHER_WORK.test(b.trade)) || a.trade.localeCompare(b.trade) || a.unit.localeCompare(b.unit));
}

/** A card in words: "₹18 to ₹24 per sqft · 4 contracts" and "Last ₹22 · Ramesh, Sharma house, 3 Sep" (with the year when it isn't `today`'s). */
export function describeLabourRate(card: LabourRate, today: string): { range: string; last: string } {
  const range = card.min === card.max ? formatRupees(card.min) : `${formatRupees(card.min)} to ${formatRupees(card.max)}`;
  const { last } = card;
  const day = formatDay(last.date, { year: last.date.slice(0, 4) !== today.slice(0, 4) });
  return {
    range: `${range} per ${card.unit} · ${card.count} ${card.count === 1 ? 'contract' : 'contracts'}`,
    last: `Last ${formatRupees(last.rate)} · ${[last.contract.contractor, last.project, day].filter(Boolean).join(', ')}`,
  };
}

/** A contract on a card: "₹22 per sqft · Ramesh · Sharma house · 3 Sep 2026", with its own terms when they were converted. */
export function describeLabourRateRow(row: LabourRateRow, unit: string): string {
  const own = cleanUnit(row.contract.unit) || 'unit';
  const rate = `${formatRupees(row.rate)} per ${unit}${own.toLowerCase() !== unit.toLowerCase() ? ` (${formatRupees(row.contract.rate)} per ${own})` : ''}`;
  return [rate, row.contract.contractor, row.project, formatDay(row.date)].filter(Boolean).join(' · ');
}
