import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Set by CI ("1.1.<build>", same as the Android version name); "dev" otherwise.
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'dev') },
  // Relative asset paths so the bundle also loads inside the Android WebView.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
