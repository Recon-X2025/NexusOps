/**
 * CoheronConnect QA — Global Setup
 * Logs in ONCE, saves auth state to disk.
 * All test files reuse this state via storageState — no per-test login.
 * If auth state file exists and is < 55 minutes old, skips the login.
 */
import { chromium, type FullConfig } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { loginAs } from "./helpers";

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
    // Programmatic login (shared helper), NOT the UI form — see loginAs in helpers.ts
    // for why the form races here. loginAs installs the session cookie via the context
    // jar + localStorage; storageState then persists both for every test.
    await loginAs(page);

    // Save auth state (cookies + localStorage)
    fs.mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_STATE_FILE });
    console.log(`✅ Auth state saved to ${AUTH_STATE_FILE}`);
  } finally {
    await browser.close();
  }
}
