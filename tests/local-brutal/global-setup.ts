/**
 * Local brutal suite — prepare DB schema + seed (demo users), then login once.
 * Seeded admin: admin@coheron.com / demo1234! (override with NEXUS_ADMIN_PASSWORD).
 */
import { chromium, type FullConfig } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env["NEXUS_LOCAL_BASE_URL"] ?? "http://localhost:3000";
export const AUTH_STATE_FILE = path.join(__dirname, "results", ".auth-local.json");

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test";

const ADMIN_EMAIL = process.env["NEXUS_ADMIN_EMAIL"] ?? "admin@coheron.com";
const ADMIN_PASSWORD = process.env["NEXUS_ADMIN_PASSWORD"] ?? "demo1234!";

export default async function globalSetup(_config: FullConfig) {
  if (process.env["SKIP_LOCAL_BRUTAL_DB"] !== "1") {
    console.log("🌱 Local brutal: db push --force + seed...");
    const dbPkg = path.join(__dirname, "..", "..", "packages", "db");
    execSync("pnpm exec drizzle-kit push --force", {
      cwd: dbPkg,
      env: { ...process.env, DATABASE_URL },
      stdio: "inherit",
    });
    execSync("pnpm --filter @coheronconnect/db db:seed", {
      env: { ...process.env, DATABASE_URL },
      stdio: "inherit",
    });
  }

  fs.mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log(`🔑 Local brutal: logging in at ${BASE_URL}...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput = page.locator('input[type="password"]').first();
    await emailInput.fill(ADMIN_EMAIL, { timeout: 15_000 });
    await pwInput.fill(ADMIN_PASSWORD, { timeout: 10_000 });
    await page.locator('button[type="submit"]').first().click({ timeout: 10_000 });
    await page.waitForURL(/\/app\//, { timeout: 45_000 });

    await page.context().storageState({ path: AUTH_STATE_FILE });
    console.log(`✅ Auth state saved → ${AUTH_STATE_FILE}`);
  } finally {
    await browser.close();
  }
}
