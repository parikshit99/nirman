const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/** Downscale to at most 1200px on the long side and re-encode as JPEG (data URL). */
export async function compressImage(src: string): Promise<string> {
  const img = await loadImage(src);
  let { width, height } = img;
  if (width > height && width > MAX_DIMENSION) {
    height = (height * MAX_DIMENSION) / width;
    width = MAX_DIMENSION;
  } else if (height > MAX_DIMENSION) {
    width = (width * MAX_DIMENSION) / height;
    height = MAX_DIMENSION;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Strip the `data:image/jpeg;base64,` prefix. */
export const dataUrlToBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);
