import type { jsPDF } from 'jspdf';
import type { SheetData } from 'write-excel-file/browser';
import type { ItemRow, ListRow, QuoteComparison, SiteReport } from '@nirman/shared';
import type { ListKind } from '../data/repo.ts';
import { pdfToBase64, type OrderSlipDetails } from './pdf.ts';
import type { SharedFile } from './files.ts';

/** The ways a report can be shared: the PDF, an Excel sheet, or a picture of each PDF page. */
export type ExportFormat = 'pdf' | 'xlsx' | 'jpg';

const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
const money = (value: number) => ({ value: value || 0, type: Number, format: '#,##0.00' });

/** The purchase list or BOQ as rows, with brand / model / size / colour in their own columns. */
export function listSheet(kind: ListKind, items: ItemRow[], notes: string): SheetData {
  const isAudit = kind === 'audit';
  const head = ['Sr.', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as', 'Rate', 'Total'];
  if (isAudit) head.push('Vendor', 'Date');
  const rows: SheetData = [[bold(isAudit ? 'Purchase report' : 'Bill of quantities')], [`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`], [], head.map(bold)];
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
  const rows: SheetData = [[bold('Order slip')], [`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`], []];
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
    [`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`],
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
export function siteReportSheet(address: string, filters: string, report: SiteReport): SheetData {
  const rows: SheetData = [[bold('Site report')], [address], [filters], [`Nirman by Akohsa - ${new Date().toLocaleDateString('en-IN')}`], []];
  rows.push(['Category', 'Material', 'Quantity', 'Unit', 'Avg rate', 'Amount', 'Vendors', 'Bills'].map(bold));
  for (const c of report.categories) {
    for (const m of c.materials) rows.push([c.name, m.name, m.quantity, m.unit, m.avgRate ? money(m.avgRate) : null, money(m.amount), m.vendors.join(', '), m.bills]);
    rows.push([bold(`${c.name} total`), null, null, null, null, { ...money(c.amount), fontWeight: 'bold' }, null, null]);
  }
  rows.push([bold('GRAND TOTAL'), null, null, null, null, { ...money(report.total), fontWeight: 'bold' }, null, null]);
  rows.push([], [bold('All lines')]);
  rows.push(['Date', 'Category', 'Item', 'Brand', 'Model / code', 'Size / spec', 'Color', 'Qty', 'Unit', 'Ordered as', 'Rate', 'Amount', 'Vendor', 'Session', 'Delivered on'].map(bold));
  const lines = report.categories.flatMap((c) => c.materials.flatMap((m) => m.lines.map((l) => ({ ...l, category: c.name }))));
  lines.sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, item, listTitle, category } of lines) {
    rows.push([date, category, item.item_name, item.brand, item.model, item.spec, item.color, item.quantity, item.unit, item.ordered_as, money(item.unit_price), money(item.total_amount), item.vendor, listTitle, item.delivered_at]);
  }
  return rows;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function sheetToXlsx(rows: SheetData, filename: string, sheet: string, widths: number[]): Promise<SharedFile> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const blob = await writeXlsxFile(rows, { sheet, columns: widths.map((width) => ({ width })) }).toBlob();
  return { filename, base64: await blobToBase64(blob), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

/** Each page of the PDF as a JPG, drawn at twice the PDF's size so text stays sharp. */
export async function pdfToJpegs(doc: jsPDF, baseName: string): Promise<SharedFile[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({ data: new Uint8Array(doc.output('arraybuffer')) });
  const files: SharedFile[] = [];
  try {
    const pdf = await task.promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const dataUrl = cropBlankBottom(canvas).toDataURL('image/jpeg', 0.9);
      const suffix = pdf.numPages > 1 ? `_page${n}` : '';
      files.push({ filename: `${baseName}${suffix}.jpg`, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' });
    }
  } finally {
    await task.destroy();
  }
  return files;
}

/** Cut the empty part of a page below the last line, keeping a margin, so a short list isn't mostly white. */
function cropBlankBottom(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let last = 0;
  for (let y = height - 1; y >= 0 && !last; y--) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 2) {
      const i = row + x * 4;
      if (pixels[i] < 235 || pixels[i + 1] < 235 || pixels[i + 2] < 235) {
        last = y;
        break;
      }
    }
  }
  const cropped = Math.min(height, last + 60);
  if (!last || cropped >= height * 0.95) return canvas;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = cropped;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out;
}

export const pdfFile = (doc: jsPDF, baseName: string): SharedFile => ({ filename: `${baseName}.pdf`, base64: pdfToBase64(doc), mimeType: 'application/pdf' });
