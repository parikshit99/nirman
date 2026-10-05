import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { MAX_IMAGES } from '@nirman/shared';
import { compressImage } from './images.ts';
import { isNative } from './platform.ts';

/** Photos (as compressed data URLs) and text shared to Nirman from another app. */
export interface IncomingShare {
  images: string[];
  text: string;
}

interface SharedEvent {
  files: { path: string; mimeType: string }[];
  text: string;
}

interface SharedFilesPlugin {
  addListener(event: 'shared', listener: (data: SharedEvent) => void): Promise<PluginListenerHandle>;
}

const SharedFiles = registerPlugin<SharedFilesPlugin>('SharedFiles');

async function readShare({ files, text }: SharedEvent): Promise<IncomingShare> {
  const { Filesystem } = await import('@capacitor/filesystem');
  const images: string[] = [];
  for (const f of files.slice(0, MAX_IMAGES)) {
    const path = `file://${f.path}`;
    try {
      const { data } = await Filesystem.readFile({ path });
      images.push(await compressImage(`data:${f.mimeType};base64,${data as string}`));
    } catch (err) {
      console.warn('Could not read a shared photo', err);
    }
    await Filesystem.deleteFile({ path }).catch(() => {});
  }
  return { images, text: (text ?? '').trim() };
}

/**
 * Call `listener` whenever photos or text are shared to the app, including the
 * share that started it. Returns a function that stops listening.
 */
export function onIncomingShare(listener: (share: IncomingShare) => void): () => void {
  if (import.meta.env.DEV) {
    // Lets a browser test stand in for Android's share sheet.
    (window as unknown as { __nirmanShare?: typeof listener }).__nirmanShare = listener;
  }
  if (!isNative) return () => {};
  const handle = SharedFiles.addListener('shared', (event) => {
    void readShare(event).then((share) => {
      if (share.images.length || share.text) listener(share);
    });
  });
  return () => void handle.then((h) => h.remove());
}
