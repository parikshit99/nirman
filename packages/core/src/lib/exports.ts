import type { jsPDF } from 'jspdf';
import type { SheetData } from 'write-excel-file/browser';
import { balanceLabel, describeTerms, formatRupees, type ContractWithRates, type ContractStatement, type ItemRow, type LabourReport, type ListRow, type QuoteComparison, type SiteReport } from '@nirman/shared';
import type { ListKind } from '../data/repo.ts';
import { madeByLine, pdfToBase64, type OrderSlipDetails } from './pdf.ts';

/** A file to share or save, as base64. */
export interface SharedFile {
  filename: string;
  base64: string;
  mimeType: string;
}

/** The ways a report can be shared: the PDF, an Excel sheet, or a picture of each PDF page. */
export type ExportFormat = 'pdf' | 'xlsx' | 'jpg';

const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
const money = (value: number) => ({ value: value || 0, type: Number, format: '#,##0.00' });

/** The purchase list or BOQ as rows, with brand / model / size / colour in their own columns. */
export function listSheet(kind: ListKind, items: ItemRow[], notes: string): SheetData {
  const isAudit = kind === 'audit';
  const head = ['Sr.', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as', 'Rate', 'Total'];
  if (isAudit) head.push('Vendor', 'Date');
  const rows: SheetData = [[bold(isAudit ? 'Purchase report' : 'Bill of quantities')], [madeByLine()], [], head.map(bold)];
  items.forEach((item, i) => {
    const row: SheetData[number] = [i + 1, item.item_name, item.brand, item.model, item.spec, item.color, item.quantity, item.unit, item.ordered_as];
    if (isAudit) row.push(money(item.unit_price), money(item.total_amount), item.vendor, item.date);
    else row.push(null, null);
    rows.push(row);
  });
  if (isAudit) {
    const total = items.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    rows.push([null, bold('TOTAL'), null, null, null, null, null, null, null, null, { ...money(total), fontWeight: 'bold' }]);
  }
  if (!isAudit && notes.trim()) rows.push([], [bold('Specifications / Notes')], [notes.trim()]);
  return rows;
}

/** Order slip for Excel: delivery details, then items with sizes and quantities, no rates. */
export function orderSlipSheet(items: ItemRow[], d: OrderSlipDetails): SheetData {
  const rows: SheetData = [[bold('Order slip')], [madeByLine()], []];
  if (d.vendor?.trim()) rows.push([bold('To'), d.vendor.trim()]);
  if (d.address) rows.push([bold('Deliver to'), d.address]);
  if (d.deliveryDate) rows.push([bold('Delivery by'), d.deliveryDate]);
  if (d.receiverName || d.receiverPhone) rows.push([bold('Receiver'), [d.receiverName, d.receiverPhone].filter(Boolean).join(' - ')]);
  rows.push([], ['Sr.', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as'].map(bold));
  items.forEach((item, i) => rows.push([i + 1, item.item_name, item.brand, item.model, item.spec, item.color, item.quantity, item.unit, item.ordered_as]));
  if (d.notes.trim()) rows.push([], [bold('Specifications / Notes')], [d.notes.trim()]);
  return rows;
}

/** Vendor rates side by side for each BOQ item, with the last recorded price. */
export function comparisonSheet(boq: ListRow, comparison: QuoteComparison): SheetData {
  const vendors = comparison.vendors;
  const rows: SheetData = [
    [bold('Vendor quote comparison')],
    [`${boq.title || 'BOQ'}${boq.address ? ` - ${boq.address}` : ''}`],
    [madeByLine()],
    [],
    ['Sr.', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Last price', 'Last vendor', ...vendors.map((v) => v.quote.vendor || 'Vendor')].map(bold),
  ];
  for (const row of comparison.rows) {
    const last = row.history.last;
    rows.push([
      row.sr,
      row.item.item_name,
      row.item.brand,
      row.item.model,
      row.item.spec,
      row.item.color,
      row.item.quantity,
      row.item.unit,
      last ? money(last.price) : null,
      last ? `${last.vendor} (${last.date})` : null,
      ...vendors.map((v) => {
        const cell = row.cells[v.quote.id];
        if (!cell || cell.price <= 0) return 'not quoted';
        if (cell.unitDiffers) return `${cell.price} per ${cell.line.unit} (different unit)`;
        return cell.cheapest ? { ...money(cell.price), fontWeight: 'bold' as const, backgroundColor: '#DCF5E1' } : money(cell.price);
      }),
    ]);
  }
  rows.push([null, bold('TOTAL (BOQ qty x rate)'), null, null, null, null, null, null, null, null, ...vendors.map((v) => ({ ...money(Math.round(v.total)), fontWeight: 'bold' as const }))]);
  return rows;
}

/** Site report for Excel: the per-material summary, then every line. */
export function siteReportSheet(address: string, filters: string, report: SiteReport, labour?: LabourReport): SheetData {
  const rows: SheetData = [[bold('Site report')], [address], [filters], [madeByLine()], []];
  rows.push(['Work type', 'Material', 'Quantity', 'Unit', 'Avg rate', 'Amount', 'Vendors', 'Bills'].map(bold));
  for (const c of report.categories) {
    for (const m of c.materials) rows.push([c.name, m.name, m.quantity, m.unit, m.avgRate ? money(m.avgRate) : null, money(m.amount), m.vendors.join(', '), m.bills]);
    rows.push([bold(`${c.name} total`), null, null, null, null, { ...money(c.amount), fontWeight: 'bold' }, null, null]);
  }
  const hasLabour = !!labour?.rows.length;
  rows.push([bold(hasLabour ? 'MATERIALS TOTAL' : 'GRAND TOTAL'), null, null, null, null, { ...money(report.total), fontWeight: 'bold' }, null, null]);
  if (hasLabour) {
    rows.push([], [bold('Labour')], ['Contractor', 'Work', 'Work type', 'Work done', 'Paid', 'Balance now'].map(bold));
    for (const r of labour!.rows) rows.push([r.contract.contractor, r.contract.work, r.contract.category, money(r.workDone), money(r.paid), money(r.balance)]);
    // What is due and what was paid ahead stay apart: one contractor's overpayment is not another's dues paid.
    rows.push([null, null, bold('Labour total'), { ...money(labour!.workDone), fontWeight: 'bold' }, { ...money(labour!.paid), fontWeight: 'bold' }, null]);
    rows.push([null, null, null, null, bold('Due'), { ...money(labour!.due), fontWeight: 'bold' }]);
    if (labour!.paidAhead > 0) rows.push([null, null, null, null, bold('Paid ahead'), { ...money(labour!.paidAhead), fontWeight: 'bold' }]);
    if (labour!.owes > 0) rows.push([null, null, null, null, bold('Contractor owes'), { ...money(labour!.owes), fontWeight: 'bold' }]);
    rows.push([bold('GRAND TOTAL (materials + labour work done)'), null, null, null, null, { ...money(report.total + labour!.workDone), fontWeight: 'bold' }]);
  }
  rows.push([], [bold('All lines')]);
  rows.push(['Date', 'Work type', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as', 'Rate', 'Amount', 'Vendor', 'List', 'Delivered on'].map(bold));
  const lines = report.categories.flatMap((c) => c.materials.flatMap((m) => m.lines.map((l) => ({ ...l, category: c.name }))));
  lines.sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, item, listTitle, category } of lines) {
    rows.push([date, category, item.item_name, item.brand, item.model, item.spec, item.color, item.quantity, item.unit, item.ordered_as, money(item.unit_price), money(item.total_amount), item.vendor, listTitle, item.delivered_at]);
  }
  return rows;
}

/** A contractor's statement for Excel: terms, entries with running balance, then the summary. */
export function contractStatementSheet(c: ContractWithRates, st: ContractStatement, period: string): SheetData {
  const rupees = (n: number) => formatRupees(n, { whole: true, symbol: 'Rs. ' });
  const rows: SheetData = [[bold('Labour statement')], [madeByLine()], []];
  rows.push([bold('Contractor'), [c.contractor, c.phone].filter(Boolean).join(' - ')]);
  if (c.work) rows.push([bold('Work'), c.work]);
  if (c.address) rows.push([bold('Site'), [c.address, c.category].filter(Boolean).join(' - ')]);
  rows.push([bold('Terms'), describeTerms(c, rupees)], [bold('Period'), period || 'All entries'], []);
  rows.push(['Date', 'Particulars', 'Work done', 'Deduction', 'Paid', 'Balance'].map(bold));
  if (st.opening !== null) rows.push([null, 'Brought forward', null, null, null, money(st.opening)]);
  for (const r of st.rows) rows.push([r.date, r.particulars, r.work ? money(r.work) : null, r.deduction ? money(r.deduction) : null, r.paid ? money(r.paid) : null, money(r.balance)]);
  const t = st.totals;
  rows.push([], [null, bold('Work done'), null, null, null, money(t.workDone)]);
  if (c.retention_pct > 0) rows.push([null, `Less retention ${c.retention_pct}%${c.retention_released_at ? ' (released)' : ' (held)'}`, null, null, null, money(t.retention)]);
  if (t.deductions) rows.push([null, 'Less deductions', null, null, null, money(t.deductions)]);
  rows.push([null, 'Less paid', null, null, null, money(t.paid)]);
  rows.push([null, bold(t.balance ? balanceLabel(c, t) : 'Balance due'), null, null, null, { ...money(Math.abs(t.balance)), fontWeight: 'bold' }]);
  return rows;
}

export const pdfFile = (doc: jsPDF, baseName: string): SharedFile => ({ filename: `${baseName}.pdf`, base64: pdfToBase64(doc), mimeType: 'application/pdf' });
