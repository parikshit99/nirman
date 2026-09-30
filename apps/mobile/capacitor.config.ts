import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nirmaan.auditor',
  appName: 'Nirmaan Auditor',
  webDir: 'dist',
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#FF7A00', showSpinner: false },
    CapacitorSQLite: { androidIsEncryption: false },
  },
};

export default config;
