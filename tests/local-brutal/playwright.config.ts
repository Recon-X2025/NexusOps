import { defineConfig, devices } from "@playwright/test";
import * as path from "path";

const BASE_URL = process.env["NEXUS_LOCAL_BASE_URL"] ?? "http://localhost:3000";
const AUTH_STATE_FILE = path.join(__dirname, "results", ".auth-local.json");

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6380";

/**
 * Brutal localhost E2E: starts API + web unless already running.
 * Requires Postgres/Redis (e.g. pnpm docker:test:up).
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.WORKERS ? parseInt(process.env.WORKERS, 10) : 6,
  timeout: 120_000,
  globalSetup: require.resolve("./global-setup"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "results/html-report" }],
    ["json", { outputFile: "results/brutal-results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    storageState: AUTH_STATE_FILE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  webServer:
    process.env["SKIP_LOCAL_BRUTAL_WEBSERVER"] === "1"
      ? undefined
      : [
          {
            command: "pnpm --filter @coheronconnect/api dev",
            port: 3001,
            // Localhost suite must never require killing ports or answering prompts; attach if already up.
            reuseExistingServer: true,
            timeout: 120_000,
            env: {
              ...process.env,
              DATABASE_URL,
              REDIS_URL,
            },
          },
          {
            command: "pnpm --filter @coheronconnect/web dev",
            port: 3000,
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
