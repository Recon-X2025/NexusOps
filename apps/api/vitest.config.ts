import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./src/__tests__/global-setup.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    /** One file at a time — avoids cross-file `seedFullOrg` / `cleanupOrg` races on shared DB. */
    fileParallelism: false,
    // Run layers sequentially (not in parallel) to avoid DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // All tests in one process to share DB connection
      },
    },
    coverage: {
      provider: 'v8',
      // json-summary feeds scripts/coverage-floor.mjs (the Phase 3 Stage E gate);
      // text is for local readability. coverage/ is gitignored.
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
