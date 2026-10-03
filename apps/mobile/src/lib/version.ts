declare const __APP_VERSION__: string | undefined;

/** "1.1.<build>" in CI builds (same as the Android version name), "dev" otherwise. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
