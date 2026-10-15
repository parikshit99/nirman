import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { balanceLabel, describeTerms, formatQty, formatRupees, variantLabel, type ContractRow, type ContractStatement, type ItemRow, type LabourReport, type ListRow, type QuoteComparison, type SiteReport } from '@nirman/shared';
import type { ListKind } from '../data/repo.ts';
import { appIcon } from './pdfIcon.ts';

const rupees = (n: number) => formatRupees(n, { symbol: 'Rs. ' });

/** The line under every PDF and spreadsheet title. */
export const madeByLine = (now = new Date()) => `Nirman by Akohsa - ${now.toLocaleDateString('en-IN')}`;
/** Item name, with brand · model · size/spec · colour, and how it was ordered, on further lines when given. */
const describe = (item: ItemRow) => [item.item_name, variantLabel(item), item.ordered_as && `Ordered: ${item.ordered_as}`].filter(Boolean).join('\n');

/** The app icon at the top left, with the report title beside it. */
function drawTitle(doc: jsPDF, title: string, size: number) {
  doc.addImage(appIcon, 'PNG', 14, 10, 12, 12);
  doc.setFontSize(size);
  doc.setTextColor(255, 122, 0);
  doc.text(title, 29, 19);
}

/**
 * Purchase report (with rates, totals and vendors) or Bill of Quantities (rate
 * and total left blank for vendor quotes, plus specification notes).
 */
export function buildPdf(kind: ListKind, items: ItemRow[], notes: string): jsPDF {
  const isAudit = kind === 'audit';
  const doc = new jsPDF();

  drawTitle(doc, isAudit ? 'PURCHASE REPORT' : 'BILL OF QUANTITIES', 22);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(madeByLine(), 14, 28);
  doc.text(isAudit ? 'Purchases recorded from site bills and notes.' : 'Material inventory and price estimation report.', 14, 33);

  const head = ['Sr.', 'Description', 'Qty', 'Unit', 'Rate', 'Total'];
  if (isAudit) head.push('Vendor');
  const body = items.map((item, i) => {
    const row: (string | number)[] = [
      i + 1,
      describe(item),
      item.quantity,
      item.unit,
      isAudit ? rupees(item.unit_price) : '',
      isAudit ? rupees(item.total_amount) : '',
    ];
    if (isAudit) row.push(item.vendor || '-');
    return row;
  });

  const columnStyles: Record<number, object> = isAudit
    ? {
        0: { cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 30 },
        6: { halign: 'right', cellWidth: 25 },
      }
    : {
        0: { cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 35 },
      };

  if (isAudit) {
    const total = items.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    body.push(['', 'TOTAL', '', '', '', rupees(total), '']);
  }

  autoTable(doc, {
    head: [head],
    body,
    startY: 40,
    theme: 'grid',
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles,
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (!isAudit && notes) {
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Specifications / Notes:', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(notes, 180);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 10;
  }

  if (!isAudit) {
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: Rate and Total columns are intentionally left blank for manual estimation or vendor quotes.', 14, y);
  }
  return doc;
}

const pctText = (x: number | null) => (x === null ? '' : `${x > 0 ? '+' : ''}${Math.round(x * 100)}% vs last`);

/** Vendor comparison for a BOQ: rates per vendor, lowest marked, last recorded price and change. */
export function buildQuoteComparisonPdf(boq: ListRow, comparison: QuoteComparison): jsPDF {
  const doc = new jsPDF({ orientation: comparison.vendors.length > 2 ? 'landscape' : 'portrait' });
  drawTitle(doc, 'VENDOR QUOTE COMPARISON', 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${boq.title || 'BOQ'}${boq.address ? ` - ${boq.address}` : ''}`, 14, 28);
  doc.text(madeByLine(), 14, 33);

  const head = ['Sr.', 'Item', 'Qty', 'Last price', ...comparison.vendors.map((v) => v.quote.vendor)];
  const body: string[][] = comparison.rows.map((row) => [
    String(row.sr),
    describe(row.item),
    `${row.item.quantity} ${row.item.unit}`,
    row.history.last ? `${rupees(row.history.last.price)}\n${row.history.last.date} ${row.history.last.vendor}` : '-',
    ...comparison.vendors.map((v) => {
      const cell = row.cells[v.quote.id];
      if (!cell || cell.price <= 0) return 'not quoted';
      if (cell.unitDiffers) return `${rupees(cell.price)}/${cell.line.unit}\n(different unit)`;
      return [rupees(cell.price) + (cell.cheapest ? ' (lowest)' : ''), pctText(cell.vsLast)].filter(Boolean).join('\n');
    }),
  ]);
  body.push([
    '',
    'TOTAL (BOQ qty x rate)',
    '',
    '',
    ...comparison.vendors.map((v) =>
      [rupees(Math.round(v.total)), v.missing.length ? `${v.missing.length} missing` : '', pctText(v.vsLast)].filter(Boolean).join('\n'),
    ),
  ]);

  autoTable(doc, {
    head: [head],
    body,
    startY: 40,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 9 } },
    didParseCell: (data) => {
      if (data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.includes('(lowest)')) {
        data.cell.styles.fillColor = [220, 245, 225];
      }
    },
  });
  return doc;
}

/** Where and to whom an order slip's material goes. */
export interface OrderSlipDetails {
  /** Vendor the order goes to; optional. */
  vendor?: string;
  address: string;
  /** YYYY-MM-DD, or blank. */
  deliveryDate: string;
  receiverName: string;
  receiverPhone: string;
  notes: string;
}

const formatDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** An order to send a vendor: what to deliver, where, when and to whom. No rates. */
export function buildOrderSlipPdf(items: ItemRow[], d: OrderSlipDetails): jsPDF {
  const doc = new jsPDF();
  drawTitle(doc, 'ORDER SLIP', 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(madeByLine(), 14, 28);

  const rows: [string, string][] = [];
  if (d.vendor?.trim()) rows.push(['To', d.vendor.trim()]);
  if (d.address) rows.push(['Deliver to', d.address]);
  if (d.deliveryDate) rows.push(['Delivery by', formatDate(d.deliveryDate)]);
  const receiver = [d.receiverName, d.receiverPhone].filter(Boolean).join(' - ');
  if (receiver) rows.push(['Receiver', receiver]);
  let y = 34;
  if (rows.length) {
    autoTable(doc, {
      body: rows,
      startY: y,
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32, textColor: [90, 90, 90] }, 1: { textColor: [20, 20, 20] } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  autoTable(doc, {
    head: [['Sr.', 'Item', 'Qty', 'Unit']],
    // An estimated weight (TMT ordered in bundles) is marked ≈ so the bundle count is what's ordered.
    body: items.map((item, i) => [i + 1, describe(item), `${/estimated/i.test(item.ordered_as) ? '≈' : ''}${formatQty(item.quantity)}`, item.unit]),
    startY: y,
    theme: 'grid',
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 'auto' }, 2: { halign: 'right', cellWidth: 25 }, 3: { halign: 'center', cellWidth: 22 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (d.notes.trim()) {
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Specifications / Notes:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(d.notes.trim(), 180);
    doc.text(lines, 14, y + 6);
  }
  return doc;
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * Everything bought for one site: a summary per work category and material,
 * then every line with its date. `filters` describes what was included.
 */
export function buildSiteReportPdf(address: string, filters: string, report: SiteReport, labour?: LabourReport): jsPDF {
  const doc = new jsPDF();
  drawTitle(doc, 'SITE REPORT', 22);
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(address, 14, 29);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(doc.splitTextToSize(filters, 180), 14, 34);
  doc.text(madeByLine(), 14, 43);

  const hasLabour = !!labour?.rows.length;
  if (report.lineCount === 0) {
    doc.setFontSize(11);
    doc.text('No purchases match these filters.', 14, 55);
    if (hasLabour) drawLabour(doc, labour!, report.total, 62);
    return doc;
  }

  // Summary: one row per material, a subtotal per category.
  const summary: (string | { content: string; colSpan?: number; styles?: object })[][] = [];
  for (const c of report.categories) {
    summary.push([{ content: c.name.toUpperCase(), colSpan: 6, styles: { fontStyle: 'bold', fillColor: [255, 237, 213] } }]);
    for (const m of c.materials) {
      summary.push([m.name, `${formatQty(m.quantity)} ${m.unit}`, m.avgRate ? rupees(Math.round(m.avgRate)) : '-', rupees(Math.round(m.amount)), m.vendors.join(', ') || '-', String(m.bills)]);
    }
    summary.push(['', '', { content: `${c.name} total`, styles: { fontStyle: 'bold', halign: 'right' } }, { content: rupees(Math.round(c.amount)), styles: { fontStyle: 'bold' } }, '', '']);
  }
  summary.push(['', '', { content: hasLabour ? 'MATERIALS TOTAL' : 'GRAND TOTAL', styles: { fontStyle: 'bold', halign: 'right' } }, { content: rupees(Math.round(report.total)), styles: { fontStyle: 'bold' } }, '', '']);
  autoTable(doc, {
    head: [['Material', 'Quantity', 'Avg rate', 'Amount', 'Vendors', 'Bills']],
    body: summary,
    startY: 48,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'center', cellWidth: 12 } },
  });

  if (hasLabour) drawLabour(doc, labour!, report.total, lastY(doc) + 12);

  // Appendix: every line, oldest first.
  const lines = report.categories.flatMap((c) => c.materials.flatMap((m) => m.lines.map((l) => ({ ...l, category: c.name, material: m.name }))));
  lines.sort((a, b) => a.date.localeCompare(b.date));
  let y = lastY(doc) + 12;
  if (y > 260) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(`All lines (${lines.length})`, 14, y);
  autoTable(doc, {
    head: [['Date', 'Item', 'Qty', 'Rate', 'Amount', 'Vendor', 'List', 'Delivered']],
    body: lines.map((l) => [
      l.date,
      describe(l.item),
      `${formatQty(l.item.quantity)} ${l.item.unit}`,
      l.item.unit_price ? rupees(l.item.unit_price) : '-',
      rupees(l.item.total_amount),
      l.item.vendor || '-',
      l.listTitle,
      l.item.delivered_at ? 'Yes' : 'No',
    ]),
    startY: y + 4,
    theme: 'grid',
    styles: { fontSize: 7 },
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  return doc;
}

/** Labour on the site: one row per contract, then materials + labour. */
function drawLabour(doc: jsPDF, labour: LabourReport, materials: number, y: number) {
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text('Labour', 14, y);
  const bold = (content: string) => ({ content, styles: { fontStyle: 'bold' as const } });
  autoTable(doc, {
    head: [['Contractor', 'Work', 'Work type', 'Work done', 'Paid', 'Balance now']],
    body: [
      ...labour.rows.map((r) => [r.contract.contractor, r.contract.work || '-', r.contract.category || '-', rupees(Math.round(r.workDone)), rupees(Math.round(r.paid)), rupees(Math.round(r.balance))]),
      // What is due and what was paid ahead stay apart: one contractor's overpayment is not another's dues paid.
      ['', '', bold('Labour total'), bold(rupees(Math.round(labour.workDone))), bold(rupees(Math.round(labour.paid))), bold(`Due ${rupees(Math.round(labour.due))}`)],
      ...(labour.paidAhead > 0 ? [['', '', '', '', '', bold(`Paid ahead ${rupees(Math.round(labour.paidAhead))}`)]] : []),
      ['', '', bold('GRAND TOTAL'), bold(rupees(Math.round(materials + labour.workDone))), { content: 'materials + labour work done', colSpan: 2, styles: { textColor: [120, 120, 120] } }],
    ],
    startY: y + 4,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
}

const formatAmount = (n: number) => (n ? rupees(Math.round(n * 100) / 100) : '');

/** A contractor's account: terms, each entry with a running balance, and the summary of what is due. */
export function buildContractStatementPdf(c: ContractRow, st: ContractStatement, period: string): jsPDF {
  const doc = new jsPDF();
  drawTitle(doc, 'LABOUR STATEMENT', 20);
  const rows: [string, string][] = [['Contractor', [c.contractor, c.phone].filter(Boolean).join(' - ')]];
  if (c.work) rows.push(['Work', c.work]);
  if (c.address) rows.push(['Site', [c.address, c.category].filter(Boolean).join(' - ')]);
  rows.push(['Terms', describeTerms(c, rupees)]);
  if (c.start_date) rows.push(['Started', formatDate(c.start_date)]);
  rows.push(['Period', period || 'All entries']);
  autoTable(doc, {
    body: rows,
    startY: 27,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, textColor: [90, 90, 90] }, 1: { textColor: [20, 20, 20] } },
  });
  const body: (string | { content: string; colSpan?: number; styles?: object })[][] = [];
  if (st.opening !== null) body.push(['', { content: 'Brought forward', styles: { fontStyle: 'italic' } }, '', '', '', rupees(st.opening)]);
  for (const r of st.rows) body.push([r.date, r.particulars, formatAmount(r.work), formatAmount(r.deduction), formatAmount(r.paid), rupees(r.balance)]);
  if (!body.length) body.push([{ content: 'No entries in this period.', colSpan: 6 }]);
  autoTable(doc, {
    head: [['Date', 'Particulars', 'Work done', 'Deduction', 'Paid', 'Balance']],
    body,
    startY: lastY(doc) + 4,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
  const t = st.totals;
  const summary: [string, string][] = [['Work done', rupees(t.workDone)]];
  if (c.retention_pct > 0) summary.push([`Less retention ${c.retention_pct}%${c.retention_released_at ? ' (released)' : ' (held)'}`, rupees(t.retention)]);
  if (t.deductions) summary.push(['Less deductions', rupees(t.deductions)]);
  summary.push(['Less paid', rupees(t.paid)]);
  summary.push([t.balance ? balanceLabel(c, t.balance) : 'Balance due', rupees(Math.abs(t.balance))]);
  autoTable(doc, {
    body: summary,
    startY: lastY(doc) + 6,
    margin: { left: 110 },
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.2 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.row.index === summary.length - 1) data.cell.styles.fontStyle = 'bold';
    },
  });
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(madeByLine(), 14, lastY(doc) + 10);
  return doc;
}

export const pdfToBase64 = (doc: jsPDF) => {
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf(',') + 1);
};
