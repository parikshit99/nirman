import { defineConfig } from '@playwright/test';

/** Layout checks on the built web bundle at phone widths (`npm run build` first). */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4173', isMobile: true, hasTouch: true },
  webServer: { command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
