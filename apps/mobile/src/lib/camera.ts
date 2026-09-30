import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressImage } from './images.ts';

/**
 * Native photo capture: lets the user take a photo or pick one from the
 * gallery, returned as a compressed JPEG data URL (null if cancelled).
 */
export async function capturePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.DataUrl,
      quality: 85,
      width: 1600,
      correctOrientation: true,
      promptLabelHeader: 'Add bill or note',
      promptLabelPhoto: 'From gallery',
      promptLabelPicture: 'Take photo',
    });
    return photo.dataUrl ? compressImage(photo.dataUrl) : null;
  } catch (err) {
    if (/cancel/i.test((err as Error).message)) return null;
    throw err;
  }
}
