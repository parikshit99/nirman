import { NativeModule, requireNativeModule } from 'expo';
import type { TextBox } from '@nirman/shared';

/** Photos (copied into the app's cache) and text shared from another app. */
export interface SharedPayload {
  files: { path: string; mimeType: string }[];
  text: string;
}

export type HapticType = 'tap' | 'tick' | 'confirm' | 'reject';

declare class NirmanNativeModule extends NativeModule<{ shared: () => void }> {
  /** Full path of a file in the app's databases folder (where the Capacitor app keeps its database). */
  databasePath(name: string): string;
  /** Reads the text on a photo (base64 or data URL) on the phone, with no internet. */
  readText(image: string): Promise<{ lines: TextBox[]; text: string }>;
  /** Android's own touch feedback. */
  haptic(type: HapticType): Promise<void>;
  /** The share that started or reached the app, once; listen for "shared" to hear of a new one. */
  takeShared(): SharedPayload | null;
}

export default requireNativeModule<NirmanNativeModule>('Nirman');
