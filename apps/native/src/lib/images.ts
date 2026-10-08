import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

/** Downscale to at most 1200 px on the long side and re-encode as JPEG (data URL). `src` is a file URI or a data URL. */
export async function compressImage(src: string, size?: { width: number; height: number }): Promise<string> {
  const context = ImageManipulator.manipulate(src);
  if (size) {
    const long = Math.max(size.width, size.height);
    if (long > MAX_DIMENSION) context.resize(size.width >= size.height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  } else {
    context.resize({ width: MAX_DIMENSION });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  return `data:image/jpeg;base64,${result.base64}`;
}

/** Strip the `data:image/jpeg;base64,` prefix. */
export const dataUrlToBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);
