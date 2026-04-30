/**
 * CoheronConnect QA — Global Setup
 * Logs in ONCE, saves auth state to disk.
 * All test files reuse this state via storageState — no per-test login.
 * If auth state file exists and is < 55 minutes old, skips the login.
 */
import { chromium, type FullConfig } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const BASE_URL =
  process.env["NEXUS_QA_BASE_URL"] ?? "http://localhost:3000";
export const AUTH_STATE_FILE = path.join(__dirname, "results", ".auth-state.json");
const MAX_AGE_MS = 55 * 60 * 1000; // 55 minutes

export default async function globalSetup(_config: FullConfig) {
  // Reuse existing auth state if it's recent
  if (fs.existsSync(AUTH_STATE_FILE)) {
    const stat = fs.statSync(AUTH_STATE_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < MAX_AGE_MS) {
      console.log(`✅ Reusing existing auth state (age: ${Math.round(ageMs / 60000)}min)`);
      return;
    }
  }

  const browser = await chromium.launch();
  const page    = await browser.newPage();

  try {
    console.log(`🔑 Global setup: logging in to ${BASE_URL}...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput    = page.locator('input[type="password"]').first();
    await emailInput.fill("admin@coheron.com", { timeout: 10_000 });
    await pwInput.fill("demo1234!", { timeout: 5_000 });
    await page.locator('button[type="submit"]').first().click({ timeout: 5_000 });
    await page.waitForURL(/\/app\//, { timeout: 30_000 });

    // Save auth state (cookies + localStorage)
    fs.mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_STATE_FILE });
    console.log(`✅ Auth state saved to ${AUTH_STATE_FILE}`);
  } finally {
    await browser.close();
  }
}
