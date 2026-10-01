import { Camera, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
import { compressImage } from './images.ts';

const isCancel = (err: unknown) => /cancel|no picture/i.test((err as Error).message);

/** Compressed JPEG data URL for a photo the plugin returned. */
function toDataUrl(result: MediaResult): Promise<string> | null {
  if (result.webPath) return compressImage(result.webPath);
  if (result.thumbnail) return compressImage(`data:image/jpeg;base64,${result.thumbnail}`);
  return null;
}

/** Open the camera for one photo (null if cancelled). */
export async function takePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.takePhoto({ quality: 85, correctOrientation: true });
    return await toDataUrl(photo);
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
}

/** Pick up to `limit` photos from the gallery in one go (empty if cancelled). */
export async function chooseFromGallery(limit: number): Promise<string[]> {
  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: limit > 1,
      limit,
      quality: 85,
      correctOrientation: true,
    });
    // `limit` is only enforced by Android 13+, so cap it here too.
    const urls = await Promise.all(results.slice(0, limit).map(toDataUrl));
    return urls.filter((x): x is string => !!x);
  } catch (err) {
    if (isCancel(err)) return [];
    throw err;
  }
}
