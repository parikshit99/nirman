import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { plural } from './format';

/** Android's file picker for a backup (.zip, or an older .json; any file type, as Drive and WhatsApp don't always say it's a zip); its bytes, or null if nothing was picked. */
export async function pickBackupFile(): Promise<Uint8Array | null> {
  const picked = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets[0]) return null;
  const file = new File(picked.assets[0].uri);
  try {
    return await file.bytes();
  } finally {
    try {
      file.delete();
    } catch {
      // The picker's copy in the cache folder; Android clears it anyway.
    }
  }
}

/**
 * For the Restore confirm: how many over-long values an older backup has that restoring shortens to fit (text longer
 * than the app keeps, e.g. two phone numbers in one field); empty when there are none.
 */
export function shortenedNote(shortened: number): string {
  return shortened > 0 ? `${plural(shortened, 'very long note, name or number', 'very long notes, names or numbers')} will be shortened to fit.` : '';
}
