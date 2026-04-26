import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,         // Run sequentially (tests share state)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                   // Single worker for consistent state
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: require.resolve("./e2e/global-setup"),
  // Auto-start the dev server before E2E tests
  webServer: [
    {
      command: "pnpm --filter @nexusops/api dev",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        DATABASE_URL:
          process.env.DATABASE_URL ||
          "postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test",
        REDIS_URL: process.env.REDIS_URL || "redis://localhost:6380",
        MEILISEARCH_URL:
          process.env.MEILISEARCH_URL || "http://localhost:7701",
        MEILISEARCH_KEY: process.env.MEILISEARCH_KEY || "test_master_key",
        AUTH_SECRET:
          process.env.AUTH_SECRET || "test-secret-32-chars-minimum-here",
        ENCRYPTION_KEY:
          process.env.ENCRYPTION_KEY || "test-encryption-32-chars-minimum",
        // APP_SECRET is the AES-256 KEK used by services/encryption.ts to
        // wrap integration credentials (eMudhra webhookSecret, AiSensy API
        // key, etc.). Must match between the API process and any test that
        // pre-seeds an integration row.
        APP_SECRET:
          process.env.APP_SECRET || "test-app-secret-32-chars-minimum-",
        NODE_ENV: process.env.NODE_ENV || "development",
      },
    },
    {
      command: "pnpm --filter @nexusops/web dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
