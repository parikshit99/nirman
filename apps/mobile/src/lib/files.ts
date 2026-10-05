import { isNative } from './platform.ts';

/**
 * Hand a generated file to the user: the Android share sheet on the phone
 * (save to Files, WhatsApp, email…), a normal download in the browser.
 */
export async function shareFile(filename: string, base64: string, mimeType: string): Promise<void> {
  await shareFiles([{ filename, base64, mimeType }]);
}

export interface SharedFile {
  filename: string;
  base64: string;
  mimeType: string;
}

/** Several files in one share (e.g. one picture per page); separate downloads in the browser. */
export async function shareFiles(files: SharedFile[]): Promise<void> {
  if (files.length === 0) return;
  if (isNative) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const uris: string[] = [];
    for (const f of files) uris.push((await Filesystem.writeFile({ path: f.filename, data: f.base64, directory: Directory.Cache })).uri);
    await Share.share({ title: files[0].filename, files: uris, dialogTitle: 'Save or send' });
    return;
  }
  for (const f of files) {
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = f.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
