import { Capacitor } from '@capacitor/core';

/** True inside the Android app (as opposed to the browser dev server). */
export const isNative = Capacitor.isNativePlatform();
