import { defineConfig, devices } from "@playwright/test";

/**
 * Chaos vertical stack — Playwright config (Vultr / any deployment).
 *
 * Run from repo root:
 *   DATABASE_URL=postgresql://... pnpm exec playwright test -c tests/chaos-vertical/playwright.config.ts
 *
 * Env:
 *   CHAOS_BASE_URL   — default http://localhost:3000
 *   DATABASE_URL     — required for Drizzle seed + DB assertions (same DB the API uses)
 *
 * Defaults: testDir = this file's directory (see Playwright docs).
 */
const CHAOS_BASE =
  process.env["CHAOS_BASE_URL"] ?? process.env["NEXUS_QA_BASE_URL"] ?? "http://localhost:3000";

export default defineConfig({
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Default 0: auth.login is rate-limited — multiple retries re-hit login and can lock the account.
  retries: process.env["CHAOS_RETRIES"] ? parseInt(process.env["CHAOS_RETRIES"], 10) : process.env.CI ? 1 : 0,
  workers: process.env.CHAOS_WORKERS ? parseInt(process.env.CHAOS_WORKERS, 10) : undefined,
  timeout: 180_000,
  expect: { timeout: 25_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "results/html-report" }],
  ],
  use: {
    baseURL: CHAOS_BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 45_000,
    actionTimeout: 25_000,
    ignoreHTTPSErrors: true,
  },
  outputDir: "results/artifacts",
  projects: [
    {
      name: "desktop-chaos",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chaos",
      use: {
        ...devices["iPhone 14"],
      },
    },
  ],
});
