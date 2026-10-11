import { cacheDirectory, deleteAsync, makeDirectoryAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { bytesToBase64, type SharedFile } from '@nirman/core';
import Nirman from '../../modules/nirman-native';

const EXPORTS = `${cacheDirectory}exports/`;

/** Writes a base64 file into the cache folder; returns its path (without `file://`). */
export async function writeCacheFile(filename: string, base64: string): Promise<string> {
  await makeDirectoryAsync(EXPORTS, { intermediates: true });
  const uri = `${EXPORTS}${filename.replace(/[^\w.-]+/g, '_')}`;
  await writeAsStringAsync(uri, base64, { encoding: 'base64' });
  return uri.replace(/^file:\/\//, '');
}

/** Hand a generated file to the user: Android's share sheet (save to Files, WhatsApp, email…). */
export async function shareFile(filename: string, base64: string, mimeType: string): Promise<void> {
  await shareFiles([{ filename, base64, mimeType }]);
}

/** Several files in one share (e.g. one picture per page). */
export async function shareFiles(files: SharedFile[]): Promise<void> {
  if (files.length === 0) return;
  const paths: string[] = [];
  for (const f of files) paths.push(await writeCacheFile(f.filename, f.base64));
  try {
    await Nirman.shareFiles(
      paths,
      files.map((f) => f.mimeType),
      files[0].filename,
    );
  } finally {
    // The share sheet has the files by now; clear them later so the receiving app can still read them.
    setTimeout(() => void Promise.all(paths.map((p) => deleteAsync(`file://${p}`, { idempotent: true }))).catch(() => {}), 10 * 60_000);
  }
}

/**
 * A backup .zip: written to the file piece by piece as `fill` makes it, then shared like every other file. The whole
 * backup is never in memory. A file left half written by an error is deleted.
 */
export async function shareBackupZip<T>(filename: string, fill: (write: (chunk: Uint8Array) => void) => Promise<T>): Promise<T> {
  await makeDirectoryAsync(EXPORTS, { intermediates: true });
  const uri = `${EXPORTS}${filename.replace(/[^\w.-]+/g, '_')}`;
  const file = new File(uri);
  if (file.exists) file.delete();
  file.create();
  let result: T;
  try {
    const handle = file.open();
    try {
      result = await fill((chunk) => handle.writeBytes(chunk));
    } finally {
      handle.close();
    }
  } catch (err) {
    if (file.exists) file.delete();
    throw err;
  }
  await Nirman.shareFiles([uri.replace(/^file:\/\//, '')], ['application/zip'], filename);
  return result;
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes);
}
