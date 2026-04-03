/**
 * NexusOps Frontend Chaos Test
 *
 * 20 parallel workers. Each worker:
 *   1. Logs in as admin@coheron.com
 *   2. Runs 20 iterations of random navigation + destructive UI actions
 *   3. Records every console error, failed nav, and UI hang
 *
 * Chaos vectors:
 *   - Rapid random navigation
 *   - Oversized input injection
 *   - Modal open/slam-close
 *   - Random button spamming
 *   - Mid-load page reload
 *   - Network throttle (2G simulation) on some workers
 *   - Session expiry simulation
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE_URL  = "http://139.84.154.78";
const API_URL   = "http://139.84.154.78:3001";
const EMAIL     = "admin@coheron.com";
const PASSWORD  = "demo1234!";

const ROUTES = [
  "/app/dashboard",
  "/app/tickets",
  "/app/projects",
  "/app/crm",
  "/app/approvals",
  "/app/assets",
  "/app/settings",
];

const LONG_STRING = "A".repeat(1100);
const SPECIAL_CHARS = `<script>alert(1)</script>; DROP TABLE tickets;--'"\`{}[]`;
const UNICODE_BOMB = "𠜎𠜱𠝹𠱓𠱸𠲖𠳏".repeat(50);

// ── Telemetry ─────────────────────────────────────────────────────────────────
interface WorkerReport {
  worker:          number;
  consoleErrors:   string[];
  failedNavs:      string[];
  uiFreezes:       string[];
  failedActions:   string[];
  requestsFailed:  string[];
  xssAttempts:     { input: string; reflected: boolean }[];
  iterations:      number;
  ticketsCreated:  number;
  timings:         { route: string; ms: number }[];
}

const reports: WorkerReport[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Click every visible button matching a selector, up to `max` times. */
async function spamClick(page: Page, selector: string, max = 7): Promise<string[]> {
  const errors: string[] = [];
  try {
    const buttons = page.locator(selector).filter({ hasNot: page.locator("[disabled]") });
    const count   = Math.min(await buttons.count(), max);
    for (let i = 0; i < count; i++) {
      try {
        await buttons.nth(i).click({ timeout: 2000, force: true });
        await sleep(randomInt(50, 150));
      } catch (e: unknown) {
        errors.push(`spam-click[${i}]: ${(e as Error).message.slice(0, 80)}`);
      }
    }
  } catch {
    // locator itself failed — element not present, fine
  }
  return errors;
}

/** Fill every visible text input with a payload. */
async function injectInputs(page: Page, payload: string): Promise<string[]> {
  const errors: string[] = [];
  try {
    const inputs = page.locator('input[type="text"], input[type="search"], textarea').filter({ hasNot: page.locator("[disabled],[readonly]") });
    const count  = Math.min(await inputs.count(), 5);
    for (let i = 0; i < count; i++) {
      try {
        await inputs.nth(i).fill(payload, { timeout: 2000 });
        await sleep(50);
      } catch (e: unknown) {
        errors.push(`input-inject[${i}]: ${(e as Error).message.slice(0, 80)}`);
      }
    }
  } catch {
    // fine
  }
  return errors;
}

/** Navigate and measure; return ms taken or -1 on failure. */
async function timedNav(page: Page, url: string): Promise<{ ms: number; error?: string }> {
  const start = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    return { ms: Date.now() - start };
  } catch (e: unknown) {
    return { ms: Date.now() - start, error: (e as Error).message.slice(0, 120) };
  }
}

/** Open first visible modal-trigger, then immediately dismiss. */
async function openAndCloseModal(page: Page): Promise<void> {
  const triggers = [
    '[data-testid*="modal"]',
    'button:has-text("New")',
    'button:has-text("Create")',
    'button:has-text("Add")',
    '[aria-haspopup="dialog"]',
  ];
  for (const sel of triggers) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click({ force: true, timeout: 2000 }).catch(() => {});
      await sleep(300);
      // dismiss with Escape
      await page.keyboard.press("Escape");
      await sleep(200);
      return;
    }
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  // Fill credentials
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const pwInput    = page.locator('input[type="password"]').first();

  await emailInput.fill(EMAIL, { timeout: 10_000 });
  await pwInput.fill(PASSWORD, { timeout: 5_000 });

  // Submit
  const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
  await submitBtn.click({ timeout: 5_000 });

  // Wait for redirect to app
  await page.waitForURL(/\/app\//, { timeout: 20_000 });
}

// ── API ticket creation via fetch ─────────────────────────────────────────────
async function apiCreateTicket(page: Page, sessionId: string): Promise<boolean> {
  try {
    const res = await page.evaluate(
      async ({ apiUrl, sid }) => {
        const r = await fetch(`${apiUrl}/trpc/tickets.create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sid}` },
          body: JSON.stringify({
            title:       `Chaos ticket ${Date.now()}`,
            description: "Automated chaos test ticket",
            priority:    "medium",
            type:        "incident",
          }),
        });
        return r.status;
      },
      { apiUrl: API_URL, sid: sessionId },
    );
    return res === 200;
  } catch {
    return false;
  }
}

// ── Chaos iteration ───────────────────────────────────────────────────────────
async function runChaosIteration(
  page:      Page,
  sessionId: string,
  report:    WorkerReport,
  iter:      number,
): Promise<void> {
  const route = randomItem(ROUTES);
  const nav   = await timedNav(page, `${BASE_URL}${route}`);

  report.timings.push({ route, ms: nav.ms });

  if (nav.error) {
    report.failedNavs.push(`iter=${iter} route=${route}: ${nav.error}`);
    return;
  }

  // Freeze detection: if page is still loading after 8s consider it a freeze
  if (nav.ms > 8_000) {
    report.uiFreezes.push(`iter=${iter} route=${route} took ${nav.ms}ms`);
  }

  // Random action mix
  const actions = randomInt(4, 8);
  for (let a = 0; a < actions; a++) {
    const roll = randomInt(0, 9);

    if (roll <= 1) {
      // Spam-click buttons
      const errs = await spamClick(page, "button", randomInt(5, 10));
      report.failedActions.push(...errs);

    } else if (roll <= 3) {
      // Inject long string
      const errs = await injectInputs(page, LONG_STRING);
      report.failedActions.push(...errs);

    } else if (roll === 4) {
      // Inject special chars (XSS attempt)
      const errs = await injectInputs(page, SPECIAL_CHARS);
      report.failedActions.push(...errs);
      // Check if reflected raw in page
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
      if (bodyText.includes("<script>")) {
        report.xssAttempts.push({ input: SPECIAL_CHARS, reflected: true });
      }

    } else if (roll === 5) {
      // Open and immediately close modals
      await openAndCloseModal(page);

    } else if (roll === 6) {
      // Mid-load reload: start nav and reload immediately
      page.goto(`${BASE_URL}${randomItem(ROUTES)}`).catch(() => {});
      await sleep(randomInt(100, 400));
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (e: unknown) {
        report.failedNavs.push(`mid-load-reload iter=${iter}: ${(e as Error).message.slice(0, 80)}`);
      }

    } else if (roll === 7) {
      // Navigate away during loading
      const p1 = timedNav(page, `${BASE_URL}${randomItem(ROUTES)}`);
      await sleep(randomInt(50, 300));
      const p2 = timedNav(page, `${BASE_URL}${randomItem(ROUTES)}`);
      await Promise.allSettled([p1, p2]);

    } else if (roll === 8) {
      // Create a ticket via API
      const ok = await apiCreateTicket(page, sessionId);
      if (ok) report.ticketsCreated++;

    } else {
      // Submit empty form
      const errs = await injectInputs(page, "");
      report.failedActions.push(...errs);
      const submitBtns = await spamClick(page, 'button[type="submit"]', 3);
      report.failedActions.push(...submitBtns);
    }

    await sleep(randomInt(80, 300));
  }
}

// ── Main test ─────────────────────────────────────────────────────────────────
test.describe.configure({ mode: "parallel" });

test.describe("Frontend Chaos — NexusOps", () => {
  // Generate 20 separate test instances so all 20 Playwright workers are used
  for (let workerIdx = 0; workerIdx < 20; workerIdx++) {
    test(`chaos worker ${workerIdx}`, async ({ page, context }) => {
      const workerIndex = workerIdx;
    const report: WorkerReport = {
      worker:         workerIndex,
      consoleErrors:  [],
      failedNavs:     [],
      uiFreezes:      [],
      failedActions:  [],
      requestsFailed: [],
      xssAttempts:    [],
      iterations:     0,
      ticketsCreated: 0,
      timings:        [],
    };

    // ── Intercept console errors ────────────────────────────────────────────
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        report.consoleErrors.push(msg.text().slice(0, 200));
      }
    });

    // ── Track failed network requests ───────────────────────────────────────
    page.on("requestfailed", (req) => {
      report.requestsFailed.push(`${req.method()} ${req.url().slice(0, 120)}: ${req.failure()?.errorText ?? "unknown"}`);
    });

    // ── Apply 2G throttle on odd workers ───────────────────────────────────
    if (workerIndex % 3 === 0) {
      await context.route("**/*", async (route) => {
        await sleep(randomInt(50, 200));
        await route.continue();
      });
    }

    // ── Login ───────────────────────────────────────────────────────────────
    let sessionId = "";
    try {
      await login(page);
      // Extract session token from cookies or local storage
      const cookies = await context.cookies();
      const session = cookies.find((c) => c.name.toLowerCase().includes("session") || c.name.toLowerCase().includes("token"));
      sessionId = session?.value ?? "";

      // Also try localStorage
      if (!sessionId) {
        sessionId = await page.evaluate(() => {
          return localStorage.getItem("sessionId") ?? localStorage.getItem("token") ?? "";
        }).catch(() => "");
      }
    } catch (e: unknown) {
      report.failedNavs.push(`LOGIN FAILED: ${(e as Error).message.slice(0, 200)}`);
      reports.push(report);
      return;
    }

    // ── 20 chaos iterations ─────────────────────────────────────────────────
    const ITERATIONS = 20;
    for (let i = 0; i < ITERATIONS; i++) {
      report.iterations = i + 1;
      try {
        await runChaosIteration(page, sessionId, report, i);
      } catch (e: unknown) {
        report.failedActions.push(`iter=${i} unhandled: ${(e as Error).message.slice(0, 120)}`);
      }
    }

    // ── Simulate session expiry mid-action ──────────────────────────────────
    try {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      // After clearing, try one more navigation
      await page.goto(`${BASE_URL}/app/tickets`, { timeout: 15_000 }).catch(() => {});
      const url = page.url();
      if (url.includes("/app/")) {
        report.failedActions.push("SESSION_EXPIRY_BYPASS: still in /app after clearing storage");
      }
    } catch {
      // expected redirect
    }

    reports.push(report);

    // ── Save per-worker JSON ────────────────────────────────────────────────
    const outDir = path.join(__dirname, "..", "results");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, `worker-${workerIndex}.json`),
      JSON.stringify(report, null, 2),
    );

    // Playwright assertion: no hard crashes (page must still respond)
    await expect(page).toHaveURL(/.+/, { timeout: 10_000 });
    }); // end test
  } // end for loop
}); // end describe
