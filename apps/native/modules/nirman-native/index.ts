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
  /** The database file (size includes its -wal/-journal files), the free space beside it, and whether the Capacitor app left files (it had data here). */
  databaseInfo(name: string): { exists: boolean; size: number; freeBytes: number; otherAppFiles: boolean };
  /** Copies a database file and its companions within the databases folder; false if there was none. */
  copyDatabase(from: string, to: string): Promise<boolean>;
  /** Renames a database file and its companions within the databases folder. */
  setDatabaseAside(from: string, to: string): void;
  databaseExists(name: string): boolean;
  /** Reads the text on a photo (base64 or data URL) on the phone, with no internet. */
  readText(image: string): Promise<{ lines: TextBox[]; text: string }>;
  /** Each page of a PDF file as a JPG (base64), drawn at `scale` times the PDF's size with Android's PdfRenderer. */
  renderPdf(path: string, scale: number): Promise<string[]>;
  /** Android's share sheet for files in the cache folder (one or several). */
  shareFiles(paths: string[], mimeTypes: string[], title: string): Promise<void>;
  /** Android's own touch feedback. */
  haptic(type: HapticType): Promise<void>;
  /** The share that started or reached the app, once; listen for "shared" to hear of a new one. */
  takeShared(): SharedPayload | null;
}

export default requireNativeModule<NirmanNativeModule>('Nirman');
