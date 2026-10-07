import Nirman, { type HapticType } from '../../modules/nirman-native';

/**
 * - `tap`: a main button pressed (Save, Add, OK).
 * - `tick`: a tab or option picked.
 * - `confirm`: something just worked (the toasts).
 * - `reject`: a delete or clear confirmed.
 */
export type HapticKind = HapticType;

/** A short buzz through Android's touch feedback (follows the phone's setting). */
export function haptic(type: HapticKind) {
  Nirman.haptic(type).catch(() => {});
}
