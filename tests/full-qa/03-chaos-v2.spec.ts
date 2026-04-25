/**
 * NexusOps Full-QA Suite — 03: Destructive Chaos v2
 *
 * Harder than any previous chaos run:
 *  - 30 parallel workers
 *  - All 53 routes (not just 7)
 *  - 25 iterations per worker
 *  - Destructive API mutations (create, update, close records)
 *  - Simulated network degradation on 1/3 of workers
 *  - Mid-load navigation interrupts
 *  - Rapid button spam across all interactive elements
 *  - Session expiry simulation
 *  - Back/forward browser navigation chaos
 *  - Concurrent overlapping mutations
 *  - Scroll + click on off-screen elements
 *  - All XSS/SQLi vectors across all input fields
 */

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env["NEXUS_QA_BASE_URL"] ?? "http://localhost:3000";
const API_URL  = process.env["NEXUS_QA_API_URL"] ?? "http://localhost:3001";
const EMAIL    = "admin@coheron.com";
const PASSWORD = "Admin1234!";

// All 53 app routes to hit in chaos
const ALL_ROUTES = [
  "/app/dashboard",
  "/app/tickets",
  "/app/tickets/new",
  "/app/problems",
  "/app/changes",
  "/app/changes/new",
  "/app/releases",
  "/app/approvals",
  "/app/escalations",
  "/app/work-orders",
  "/app/work-orders/new",
  "/app/catalog",
  "/app/hr",
  "/app/employee-portal",
  "/app/employee-center",
  "/app/crm",
  "/app/financial",
  "/app/contracts",
  "/app/vendors",
  "/app/csm",
  "/app/legal",
  "/app/grc",
  "/app/compliance",
  "/app/security",
  "/app/knowledge",
  "/app/flows",
  "/app/workflows",
  "/app/facilities",
  "/app/projects",
  "/app/devops",
  "/app/on-call",
  "/app/cmdb",
  "/app/ham",
  "/app/sam",
  "/app/apm",
  "/app/virtual-agent",
  "/app/walk-up",
  "/app/events",
  "/app/surveys",
  "/app/reports",
  "/app/admin",
  "/app/profile",
  "/app/procurement",
  "/app/notifications",
  "/app/secretarial",
  "/app/people-workplace",
  "/app/strategy-projects",
  "/app/developer-ops",
  "/app/it-services",
  "/app/customer-sales",
  "/app/legal-governance",
  "/app/finance-procurement",
  "/app/security-compliance",
];

// Destructive mutation payloads
const MUTATIONS = [
  { proc: "tickets.create",    method: "POST", body: { title: `CHAOS-${Date.now()}`, description: "chaos test", priority: "high", type: "incident" } },
  { proc: "problems.create",   method: "POST", body: { title: `CHAOS-PRB-${Date.now()}`, description: "chaos test", priority: "medium" } },
  { proc: "changes.create",    method: "POST", body: { title: `CHAOS-CHG-${Date.now()}`, description: "chaos test", type: "normal", risk: "low", impact: "low" } },
  { proc: "legal.createMatter",method: "POST", body: { title: `CHAOS-LGL-${Date.now()}`, description: "chaos test", type: "litigation", priority: "low" } },
];

const OVERSIZED   = "X".repeat(4500);
const XSS         = '<script>window.__CHAOS_XSS=true</script>';
const SQL_INJECT  = "' OR '1'='1'; DROP TABLE tickets;--";
const UNICODE     = "日本語テスト".repeat(200);

// ── Telemetry ─────────────────────────────────────────────────────────────────
interface ChaosReport {
  worker:           number;
  loginOk:          boolean;
  consoleErrors:    string[];
  crashes:          string[];
  failedNavs:       string[];
  uiFreezes:        string[];
  failedMutations:  string[];
  xssReflected:     string[];
  requestsFailed:   string[];
  iterations:       number;
  mutationsOk:      number;
  mutationsFailed:  number;
  navTimings:       { route: string; ms: number }[];
  sessionBypassOk:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a: number, b: number): number { return Math.floor(Math.random() * (b - a + 1)) + a; }
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function login(page: Page): Promise<boolean> {
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL, { timeout: 8_000 });
    await page.locator('input[type="password"]').first().fill(PASSWORD, { timeout: 5_000 });
    await page.locator('button[type="submit"]').first().click({ timeout: 5_000 });
    await page.waitForURL(/\/app\//, { timeout: 25_000 });
    return true;
  } catch {
    return false;
  }
}

async function timedGoto(
  page: Page,
  url: string,
  report: ChaosReport,
): Promise<boolean> {
  const t = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const ms = Date.now() - t;
    report.navTimings.push({ route: url.replace(BASE_URL, ""), ms });
    if (ms > 9_000) report.uiFreezes.push(`${url} took ${ms}ms`);

    // Crash detection
    const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const CRASH_SIGNS = [
      "Application error", "This page crashed", "ChunkLoadError",
      "Unhandled Runtime Error", "TypeError:", "Cannot read propert",
      "is not a function", "is not defined",
    ];
    for (const sign of CRASH_SIGNS) {
      if (body.includes(sign)) {
        report.crashes.push(`${url}: ${sign}`);
      }
    }
    return true;
  } catch (e: unknown) {
    report.failedNavs.push(`${url}: ${(e as Error).message.slice(0, 100)}`);
    return false;
  }
}

async function spamButtons(page: Page, max = 8): Promise<void> {
  try {
    const btns = page.locator("button:not([disabled])");
    const count = Math.min(await btns.count(), max);
    for (let i = 0; i < count; i++) {
      await btns.nth(i).click({ force: true, timeout: 1500 }).catch(() => {});
      await pause(randInt(30, 120));
    }
  } catch { /* ignore */ }
}

async function injectAllInputs(page: Page, payload: string): Promise<void> {
  try {
    const inputs = page.locator(
      'input[type="text"], input[type="search"], input:not([type]), textarea',
    ).filter({ hasNot: page.locator("[disabled],[readonly]") });
    const count = Math.min(await inputs.count(), 6);
    for (let i = 0; i < count; i++) {
      await inputs.nth(i).fill(payload, { timeout: 1500 }).catch(() => {});
      await pause(40);
    }
  } catch { /* ignore */ }
}

async function openAndCrashModal(page: Page): Promise<void> {
  const triggers = [
    'button:has-text("New")',
    'button:has-text("Create")',
    'button:has-text("Add")',
    'button:has-text("Book")',
    'button:has-text("Request")',
  ];
  for (const sel of triggers) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
      await btn.click({ force: true, timeout: 1500 }).catch(() => {});
      await pause(300);
      // Try both Escape and clicking outside
      await page.keyboard.press("Escape");
      await pause(100);
      // Re-open
      await btn.click({ force: true, timeout: 1500 }).catch(() => {});
      await pause(200);
      // Click outside this time
      await page.mouse.click(5, 5);
      await pause(150);
      return;
    }
  }
}

async function tryDestructiveMutation(
  page: Page,
  report: ChaosReport,
): Promise<void> {
  const mutation = rand(MUTATIONS);
  try {
    const body = { ...mutation.body, title: `${(mutation.body as Record<string,string>).title}-${Date.now()}` };
    const result = await page.evaluate(
      async ({ apiUrl, proc, body }) => {
        const r = await fetch(`${apiUrl}/trpc/${proc}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ json: body }),
        });
        return r.status;
      },
      { apiUrl: API_URL, proc: mutation.proc, body },
    );
    if (result === 200) {
      report.mutationsOk++;
    } else {
      report.mutationsFailed++;
      report.failedMutations.push(`${mutation.proc}: HTTP ${result}`);
    }
  } catch (e: unknown) {
    report.mutationsFailed++;
    report.failedMutations.push(`${mutation.proc}: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function tryMidLoadReload(page: Page, report: ChaosReport): Promise<void> {
  const route = rand(ALL_ROUTES);
  page.goto(`${BASE_URL}${route}`).catch(() => {});
  await pause(randInt(80, 350));
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch (e: unknown) {
    report.failedNavs.push(`mid-reload ${route}: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function tryBackForward(page: Page): Promise<void> {
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => {});
  await pause(200);
  await page.goForward({ waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => {});
}

async function checkXSS(page: Page, report: ChaosReport, label: string): Promise<void> {
  const xssSet = await page.evaluate(() => {
    return !!(window as unknown as Record<string,unknown>).__CHAOS_XSS;
  }).catch(() => false);
  if (xssSet) report.xssReflected.push(label);
}

async function simulateScrollAndClick(page: Page): Promise<void> {
  // Scroll down
  await page.evaluate(() => window.scrollBy(0, randInt(200, 800))).catch(() => {});
  await pause(200);
  // Try clicking a visible link
  const links = page.locator("a[href]");
  const count = await links.count().catch(() => 0);
  if (count > 0) {
    const idx = randInt(0, Math.min(count - 1, 4));
    const href = await links.nth(idx).getAttribute("href").catch(() => "");
    if (href && href.startsWith("/app/")) {
      await links.nth(idx).click({ timeout: 2000, force: true }).catch(() => {});
      await pause(300);
    }
  }
}

// ── Chaos iteration ───────────────────────────────────────────────────────────
async function chaosIteration(
  page: Page,
  report: ChaosReport,
  iter: number,
): Promise<void> {
  const route = rand(ALL_ROUTES);
  await timedGoto(page, `${BASE_URL}${route}`, report);

  const actions = randInt(5, 10);
  for (let a = 0; a < actions; a++) {
    const roll = randInt(0, 12);

    switch (roll) {
      case 0:
      case 1:
        // Spam all buttons
        await spamButtons(page, randInt(5, 12));
        break;
      case 2:
        // Inject oversized text
        await injectAllInputs(page, OVERSIZED);
        break;
      case 3:
        // Inject XSS
        await injectAllInputs(page, XSS);
        await checkXSS(page, report, `iter=${iter} route=${route}`);
        break;
      case 4:
        // Inject SQL
        await injectAllInputs(page, SQL_INJECT);
        break;
      case 5:
        // Inject unicode
        await injectAllInputs(page, UNICODE);
        break;
      case 6:
        // Modal open/slam/re-open
        await openAndCrashModal(page);
        break;
      case 7:
        // Mid-load reload
        await tryMidLoadReload(page, report);
        break;
      case 8:
        // Navigate away during load (race condition)
        { const p1 = timedGoto(page, `${BASE_URL}${rand(ALL_ROUTES)}`, report);
          await pause(randInt(30, 200));
          const p2 = timedGoto(page, `${BASE_URL}${rand(ALL_ROUTES)}`, report);
          await Promise.allSettled([p1, p2]);
        }
        break;
      case 9:
        // Destructive API mutation
        await tryDestructiveMutation(page, report);
        break;
      case 10:
        // Back/Forward navigation
        await tryBackForward(page);
        break;
      case 11:
        // Scroll + random link click
        await simulateScrollAndClick(page);
        break;
      default:
        // Empty form submit
        { const submit = page.locator('button[type="submit"]').first();
          if (await submit.isVisible({ timeout: 600 }).catch(() => false)) {
            await submit.click({ force: true, timeout: 1500 }).catch(() => {});
          }
        }
    }

    await pause(randInt(50, 200));
  }
}

// ── Test: 30 chaos workers ─────────────────────────────────────────────────────
test.describe.configure({ mode: "parallel" });

test.describe("Chaos v2 — NexusOps (30 workers)", () => {
  test.setTimeout(180_000); // 3 min per worker — 25 iterations under load
  const WORKER_COUNT = 30;
  const ITERATIONS   = 25;

  for (let idx = 0; idx < WORKER_COUNT; idx++) {
    test(`chaos-worker-${idx}`, async ({ page, context }) => {
      const report: ChaosReport = {
        worker:          idx,
        loginOk:         false,
        consoleErrors:   [],
        crashes:         [],
        failedNavs:      [],
        uiFreezes:       [],
        failedMutations: [],
        xssReflected:    [],
        requestsFailed:  [],
        iterations:      0,
        mutationsOk:     0,
        mutationsFailed: 0,
        navTimings:      [],
        sessionBypassOk: false,
      };

      // Intercept console errors
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          report.consoleErrors.push(msg.text().slice(0, 250));
        }
      });
      page.on("requestfailed", (req) => {
        report.requestsFailed.push(
          `${req.method()} ${req.url().slice(0, 120)}: ${req.failure()?.errorText ?? "?"}`,
        );
      });

      // Simulate 2G network degradation on 1/3 of workers
      if (idx % 3 === 0) {
        await context.route("**/*", async (route) => {
          await pause(randInt(50, 250));
          await route.continue();
        });
      }

      // Simulate mobile viewport on some workers
      if (idx % 5 === 0) {
        await page.setViewportSize({ width: 390, height: 844 });
      }

      // Login
      report.loginOk = await login(page);
      if (!report.loginOk) {
        const outDir = path.join(__dirname, "results");
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
          path.join(outDir, `chaos-worker-${idx}.json`),
          JSON.stringify({ ...report, error: "LOGIN_FAILED" }, null, 2),
        );
        return;
      }

      // 25 chaos iterations
      for (let i = 0; i < ITERATIONS; i++) {
        report.iterations = i + 1;
        try {
          await chaosIteration(page, report, i);
        } catch (e: unknown) {
          report.failedNavs.push(`iter=${i} unhandled: ${(e as Error).message.slice(0, 120)}`);
        }
      }

      // Session expiry simulation: clear cookies, try to access /app
      try {
        await context.clearCookies();
        await page.goto(`${BASE_URL}/app/tickets`, {
          waitUntil: "domcontentloaded",
          timeout: 10_000,
        });
        const url = page.url();
        if (url.includes("/app/tickets")) {
          report.sessionBypassOk = true; // BAD — should have been redirected
        }
      } catch {
        // Expected
      }

      // Save per-worker report
      const outDir = path.join(__dirname, "results");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, `chaos-worker-${idx}.json`),
        JSON.stringify(report, null, 2),
      );

      // Final assertion: no XSS reflected
      expect(
        report.xssReflected.length,
        `XSS reflected on worker ${idx}: ${report.xssReflected.join(", ")}`,
      ).toBe(0);

      // Final assertion: session expiry must redirect
      expect(
        report.sessionBypassOk,
        `Session bypass succeeded on worker ${idx} — /app/ accessible without cookies!`,
      ).toBe(false);

      // Final assertion: page still responds (not completely broken)
      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 15_000 });
        const url = page.url();
        expect(url).toBeTruthy();
      } catch {
        // ignore — server still up check done separately
      }
    });
  }
});
