import type { ExpoConfig } from 'expo/config';

// The same app as apps/mobile (same id, same signing in CI), so 7.0 installs as an update over 6.x.
const config: ExpoConfig = {
  name: 'Nirman',
  slug: 'nirman',
  // "<major.minor.patch>", set by CI; "dev" for local builds.
  version: process.env.APP_VERSION || 'dev',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: '../mobile/assets/icon-only.png',
  android: {
    package: 'com.nirmaan.auditor',
    // Each CI build is newer than the last, so Android accepts it as an update.
    versionCode: Number(process.env.GITHUB_RUN_NUMBER || 1),
    adaptiveIcon: {
      foregroundImage: '../mobile/assets/icon-foreground.png',
      backgroundImage: '../mobile/assets/icon-background.png',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.ACCESS_NETWORK_STATE'],
    // Expo adds these by default; the app never needed them (haptics use touch feedback, not vibrate).
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
    ],
    // Photos and text shared from other apps, e.g. a bill forwarded on WhatsApp (as in apps/mobile's AndroidManifest.xml).
    intentFilters: [
      { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
      { action: 'SEND_MULTIPLE', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
      { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'text/plain' }] },
    ],
  },
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
