import { registerPlugin } from '@capacitor/core';
import type { TextBox } from '@nirman/shared';
import { isNative } from './platform.ts';

interface TextReaderPlugin {
  read(options: { image: string }): Promise<{ lines: TextBox[]; text: string }>;
}

const TextReader = registerPlugin<TextReaderPlugin>('TextReader');

/** Reads the text on a photo on the phone (no internet); null where it isn't available (browser). */
export const readPhotoText: ((image: string) => Promise<TextBox[]>) | null = isNative
  ? async (image) => (await TextReader.read({ image })).lines
  : null;
