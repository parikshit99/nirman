import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform.ts';

/**
 * - `tap`: a main button pressed (Save, Add, OK).
 * - `tick`: a tab or option picked.
 * - `confirm`: something just worked (the toasts).
 * - `reject`: a delete or clear confirmed.
 */
export type HapticKind = 'tap' | 'tick' | 'confirm' | 'reject';

interface HapticsPlugin {
  perform(options: { type: HapticKind }): Promise<void>;
}

const Haptics = registerPlugin<HapticsPlugin>('Haptics');

/** A short buzz through Android's touch feedback (follows the phone's setting); nothing in the browser. */
export function haptic(type: HapticKind) {
  if (isNative) Haptics.perform({ type }).catch(() => {});
}
