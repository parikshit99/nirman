import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
