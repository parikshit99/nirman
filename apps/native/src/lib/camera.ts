import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync, type ImagePickerAsset } from 'expo-image-picker';
import { compressImage } from './images';

const toDataUrl = (a: ImagePickerAsset) => compressImage(a.uri, { width: a.width, height: a.height });

/** Open the camera for one photo (null if cancelled). */
export async function takePhoto(): Promise<string | null> {
  const perm = await requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission was denied.');
  const result = await launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled || !result.assets[0]) return null;
  return toDataUrl(result.assets[0]);
}

/** Pick up to `limit` photos with Android's Photo Picker (no permission prompt); empty if cancelled. */
export async function chooseFromGallery(limit: number): Promise<string[]> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: limit > 1, selectionLimit: limit, quality: 0.85 });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, limit).map(toDataUrl));
}
