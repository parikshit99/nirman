import type { jsPDF } from 'jspdf';
import writeXlsxFile from 'write-excel-file/universal';
import type { SheetData } from 'write-excel-file/universal';
import { bytesToBase64, pdfToBase64, type SharedFile } from '@nirman/core';
import Nirman from '../../modules/nirman-native';
import { writeCacheFile } from './files';

/** React Native's Blob can't be made from bytes; this one just keeps them for `sheetToXlsx` to take. */
class ByteBlob {
  readonly parts: unknown[];
  constructor(parts: unknown[] = []) {
    this.parts = parts;
  }
}

/** The sheet as an Excel file; the sheets themselves come from core. */
export async function sheetToXlsx(rows: SheetData, filename: string, sheet: string, widths: number[]): Promise<SharedFile> {
  const g = globalThis as { Blob: unknown };
  const real = g.Blob;
  g.Blob = ByteBlob;
  let blob: unknown;
  try {
    blob = await writeXlsxFile(rows, { sheet, columns: widths.map((width) => ({ width })) }).toBlob();
  } finally {
    g.Blob = real;
  }
  const part = (blob as ByteBlob).parts[0];
  const bytes = part instanceof Uint8Array ? part : new Uint8Array(part as ArrayBuffer);
  return { filename, base64: bytesToBase64(bytes), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

/** Each page of the PDF as a JPG, drawn at twice the PDF's size so text stays sharp. */
export async function pdfToJpegs(doc: jsPDF, baseName: string): Promise<SharedFile[]> {
  const path = await writeCacheFile('render.pdf', pdfToBase64(doc));
  const pages = await Nirman.renderPdf(path, 2);
  return pages.map((base64, i) => ({ filename: `${baseName}${pages.length > 1 ? `_page${i + 1}` : ''}.jpg`, base64, mimeType: 'image/jpeg' }));
}
