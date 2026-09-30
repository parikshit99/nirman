import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nirmaan.auditor',
  appName: 'Nirmaan Auditor',
  webDir: 'dist',
  android: {
    // Only allow cleartext HTTP when explicitly building against a local dev server.
    allowMixedContent: process.env.CAP_ALLOW_HTTP === '1',
  },
  server: process.env.CAP_ALLOW_HTTP === '1' ? { cleartext: true } : undefined,
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#FF7A00', showSpinner: false },
    CapacitorSQLite: { androidIsEncryption: false },
  },
};

export default config;
