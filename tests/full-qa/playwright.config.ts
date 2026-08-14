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
  // Default 2 (not 8): the suite drives a single dev API instance as ONE shared
  // admin account. Higher concurrency saturates per-user rate limits (dashboard
  // getMetrics is 60/min) and induces a session-wipe race, producing failures that
  // vanish at lower concurrency (10+12 together: 0 fail @2, dozens @4). Override with
  // WORKERS=N when pointing at a beefier/isolated target.
  workers: process.env.WORKERS ? parseInt(process.env.WORKERS) : 2,
  timeout: 60_000,
  globalSetup: require.resolve("./global-setup"),
  // Production-build target (NEXUS_QA_BUILT=1): serve the web app from `next build`
  // + `next start` instead of `next dev`. Next dev compiles each route lazily on first
  // visit, which inflates route-sweep tests to minutes and causes "Verifying session"
  // stalls; a precompiled build removes that entirely (warm dev: 685 pass / 44 min vs a
  // built target which should run in minutes). The API (port 3001) is assumed running.
  webServer: process.env["NEXUS_QA_BUILT"]
    ? {
        command: "pnpm --filter @coheronconnect/web build && pnpm --filter @coheronconnect/web start --port 3000",
        url: QA_BASE,
        timeout: 300_000,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
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
