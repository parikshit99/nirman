import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nirmaan.auditor',
  appName: 'Nirman',
  webDir: 'dist',
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#FF7A00', showSpinner: false },
    // The app draws under the status and navigation bars and pads itself (index.css --inset-*).
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    CapacitorSQLite: { androidIsEncryption: false },
  },
};

export default config;
