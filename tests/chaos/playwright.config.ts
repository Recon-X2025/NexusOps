import { defineConfig, devices } from "@playwright/test";

const BASE =
  process.env["CHAOS_BASE_URL"] ?? process.env["NEXUS_QA_BASE_URL"] ?? "http://139.84.154.78";

/**
 * Chaos system validation — run from monorepo root:
 *   pnpm exec playwright test -c tests/chaos/playwright.config.ts
 *
 * All `outputFolder`, `outputFile`, and `outputDir` paths are relative to this file
 * → artifacts live under `tests/chaos/results/`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "system-validation.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env["CHAOS_RETRIES"] ? parseInt(process.env["CHAOS_RETRIES"], 10) : process.env.CI ? 1 : 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "results/html-report" }],
    ["json", { outputFile: "results/system-validation-results.json" }],
  ],
  use: {
    baseURL: BASE.replace(/\/$/, ""),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 25_000,
    ignoreHTTPSErrors: true,
    headless: true,
  },
  outputDir: "results/artifacts",
  projects: [
    {
      name: "chaos-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ["--no-sandbox"] },
      },
    },
    {
      name: "chaos-mobile",
      // Chromium device profile (no WebKit install required); still exercises narrow viewport.
      use: { ...devices["Pixel 7"] },
    },
  ],
});
