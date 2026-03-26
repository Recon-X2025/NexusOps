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
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test",
        REDIS_URL: process.env.REDIS_URL || "redis://localhost:6380",
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
