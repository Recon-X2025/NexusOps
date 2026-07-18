import { defineConfig, devices } from "@playwright/test";

// Ports are overridable so a clean local run can avoid a port already taken by
// another project's dev server (e.g. a stray Next server squatting on :3000).
// Defaults preserve the original behaviour for CI and normal local runs.
const WEB_PORT = Number(process.env.WEB_PORT || 3000);
const API_PORT = Number(process.env.API_PORT || 3001);
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${WEB_PORT}`;

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
    baseURL: BASE_URL,
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
      command: process.env.CI
        ? `pnpm --filter @coheronconnect/api start --port ${API_PORT}`
        : `pnpm --filter @coheronconnect/api dev --port ${API_PORT}`,
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        DATABASE_URL:
          process.env.DATABASE_URL ||
          "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test",
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
        // PII_HASH_PEPPER seeds the HMAC of government identifiers (Aadhaar/PAN).
        // The API boot guard (index.ts) exits(1) if unset, which would crash this
        // webServer. Forwarded here so the child API process always has it.
        PII_HASH_PEPPER:
          process.env.PII_HASH_PEPPER || "test-pii-pepper-32-chars-minimum-here",
        LOGIN_RATE_PER_MIN: "1000",
        NODE_ENV: process.env.NODE_ENV || "test",
      },
    },
    {
      command: process.env.CI
        ? `pnpm --filter @coheronconnect/web start --port ${WEB_PORT}`
        : `pnpm --filter @coheronconnect/web dev --port ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        // The web tRPC proxy (apps/web/src/lib/trpc.ts) resolves the API via
        // API_INTERNAL_URL server-side; point it at the chosen API port.
        API_INTERNAL_URL:
          process.env.API_INTERNAL_URL || `http://127.0.0.1:${API_PORT}`,
        NEXT_PUBLIC_API_URL:
          process.env.NEXT_PUBLIC_API_URL || `http://localhost:${API_PORT}`,
      },
    },
  ],
});
