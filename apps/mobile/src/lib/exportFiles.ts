import type { jsPDF } from 'jspdf';
import type { SheetData } from 'write-excel-file/browser';
import type { SharedFile } from '@nirman/core';

/** Excel and page pictures for sharing; these need the browser (Blob, canvas). The sheets themselves come from core. */
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
