import { bytesToBase64, type SharedFile } from '@nirman/core';
import { isNative } from './platform.ts';

/**
 * Hand a generated file to the user: the Android share sheet on the phone
 * (save to Files, WhatsApp, email…), a normal download in the browser.
 */
export async function shareFile(filename: string, base64: string, mimeType: string): Promise<void> {
  await shareFiles([{ filename, base64, mimeType }]);
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

/** A large binary file (a backup .zip): written in pieces, so the whole file never sits in memory as base64 text. */
export async function shareBytes(filename: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  if (!isNative) {
    await shareFiles([{ filename, base64: bytesToBase64(bytes), mimeType }]);
    return;
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const CHUNK = 3 * 1024 * 1024; // a multiple of 3, so the base64 pieces join up
  let uri = '';
  for (let at = 0; at === 0 || at < bytes.length; at += CHUNK) {
    const data = bytesToBase64(bytes.subarray(at, at + CHUNK));
    if (at === 0) uri = (await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })).uri;
    else await Filesystem.appendFile({ path: filename, data, directory: Directory.Cache });
  }
  await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or send' });
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
