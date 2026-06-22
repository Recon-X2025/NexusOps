import { defineConfig, devices } from "@playwright/test";
import * as path from "path";

const QA_BASE = process.env["NEXUS_QA_BASE_URL"] ?? "http://localhost:3000";

/**
 * CoheronConnect Full-QA Playwright Config
 * Target: `NEXUS_QA_BASE_URL` or http://localhost:3000 (local dev)
 * Auth: shared storageState from global setup (login once, reuse everywhere)
 */
export const AUTH_STATE_FILE = path.join(__dirname, "results", ".auth-state.json");

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: false,
  retries: 1,
  workers: process.env.WORKERS ? parseInt(process.env.WORKERS) : 8,
  timeout: 60_000,
  globalSetup: require.resolve("./global-setup"),
  reporter: [
    ["list"],
    ["json", { outputFile: "results/raw-results.json" }],
    ["html", { open: "never", outputFolder: "results/html-report" }],
  ],
  use: {
    baseURL: QA_BASE,
    storageState: AUTH_STATE_FILE,   // reuse auth across all tests
    trace: "retain-on-failure",
    screenshot: "on",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
