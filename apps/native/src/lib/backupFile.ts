import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

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
