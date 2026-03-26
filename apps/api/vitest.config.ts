import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run layers sequentially (not in parallel) to avoid DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // All tests in one process to share DB connection
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
