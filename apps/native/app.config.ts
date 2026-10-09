import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExpoConfig } from 'expo/config';

/** The newest section of CHANGELOG.md: this version's What's new, built into the app. */
function latestChangelog(): string {
  const text = readFileSync(join(__dirname, '../../CHANGELOG.md'), 'utf8');
  const start = text.indexOf('\n## ');
  if (start < 0) return '';
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start + 1, end < 0 ? undefined : end).trim();
}

// The same app as the 6.x Capacitor app (same id, same signing in CI), so 7.x installs as an update over 6.x.
const config: ExpoConfig = {
  name: 'Nirman',
  slug: 'nirman',
  // "<major.minor.patch>", set by CI; "dev" for local builds.
  version: process.env.APP_VERSION || 'dev',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon-only.png',
  android: {
    package: 'com.nirmaan.auditor',
    // Each CI build is newer than the last, so Android accepts it as an update.
    versionCode: Number(process.env.GITHUB_RUN_NUMBER || 1),
    adaptiveIcon: {
      foregroundImage: './assets/icon-foreground.png',
      backgroundImage: './assets/icon-background.png',
      // Themed icons (Android 13+, Samsung One UI 6+): the phone tints this one-colour shape to match the wallpaper.
      monochromeImage: './assets/icon-foreground.png',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.ACCESS_NETWORK_STATE'],
    // Expo adds these by default; the app never needed them (haptics use touch feedback, not vibrate).
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
    ],
    // Photos and text shared from other apps, e.g. a bill forwarded on WhatsApp (as in the 6.x app's AndroidManifest.xml).
    intentFilters: [
      { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
      { action: 'SEND_MULTIPLE', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
      { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'text/plain' }] },
    ],
  },
  extra: { changelog: latestChangelog() },
  plugins: [
    ['react-native-bottom-tabs', { theme: 'material3' }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-font',
    ['expo-image-picker', { cameraPermission: 'Nirman uses the camera to photograph bills.' }],
    ['expo-speech-recognition', { microphonePermission: 'Nirman uses the microphone to type what you say.', speechRecognitionPermission: 'Nirman uses speech recognition to type what you say.' }],
  ],
};

export default config;
