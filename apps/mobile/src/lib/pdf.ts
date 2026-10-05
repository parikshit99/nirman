import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { variantLabel, type ItemRow, type ListRow, type QuoteComparison, type SiteReport } from '@nirman/shared';
import type { ListKind } from '../data/repo.ts';
import appIcon from './pdf-icon.png?inline';

const rupees = (n: number) => `Rs. ${(n || 0).toLocaleString('en-IN')}`;
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
  doc.text(`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`, 14, 28);
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
  doc.text(`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`, 14, 33);

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

const qty = (n: number) => Number(n.toFixed(3)).toLocaleString('en-IN');
const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * Everything bought for one site: a summary per work category and material,
 * then every line with its date. `filters` describes what was included.
 */
export function buildSiteReportPdf(address: string, filters: string, report: SiteReport): jsPDF {
  const doc = new jsPDF();
  drawTitle(doc, 'SITE REPORT', 22);
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(address, 14, 29);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(doc.splitTextToSize(filters, 180), 14, 34);
  doc.text(`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`, 14, 43);

  if (report.lineCount === 0) {
    doc.setFontSize(11);
    doc.text('No purchases match these filters.', 14, 55);
    return doc;
  }

  // Summary: one row per material, a subtotal per category.
  const summary: (string | { content: string; colSpan?: number; styles?: object })[][] = [];
  for (const c of report.categories) {
    summary.push([{ content: c.name.toUpperCase(), colSpan: 6, styles: { fontStyle: 'bold', fillColor: [255, 237, 213] } }]);
    for (const m of c.materials) {
      summary.push([m.name, `${qty(m.quantity)} ${m.unit}`, m.avgRate ? rupees(Math.round(m.avgRate)) : '-', rupees(Math.round(m.amount)), m.vendors.join(', ') || '-', String(m.bills)]);
    }
    summary.push(['', '', { content: `${c.name} total`, styles: { fontStyle: 'bold', halign: 'right' } }, { content: rupees(Math.round(c.amount)), styles: { fontStyle: 'bold' } }, '', '']);
  }
  summary.push(['', '', { content: 'GRAND TOTAL', styles: { fontStyle: 'bold', halign: 'right' } }, { content: rupees(Math.round(report.total)), styles: { fontStyle: 'bold' } }, '', '']);
  autoTable(doc, {
    head: [['Material', 'Quantity', 'Avg rate', 'Amount', 'Vendors', 'Bills']],
    body: summary,
    startY: 48,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 18, 18], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'center', cellWidth: 12 } },
  });

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
    head: [['Date', 'Item', 'Qty', 'Rate', 'Amount', 'Vendor', 'Session', 'Delivered']],
    body: lines.map((l) => [
      l.date,
      describe(l.item),
      `${qty(l.item.quantity)} ${l.item.unit}`,
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

export const pdfToBase64 = (doc: jsPDF) => {
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf(',') + 1);
};
