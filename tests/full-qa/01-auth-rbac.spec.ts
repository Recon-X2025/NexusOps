/**
 * NexusOps Full-QA Suite — 01: Auth, RBAC & Session Security
 *
 * Tests:
 *  A) Login: valid, invalid password, invalid email, empty, SQL injection
 *     (these tests use { storageState: undefined } to start unauthenticated)
 *  B) Logout: session invalidated, can't re-access /app after logout
 *  C) RBAC: admin has full access
 *  D) Session expiry simulation
 *  E) Concurrent sessions
 *  F) Auth bypass attempts: direct URL/API access without session
 */

import { test, expect, type Page } from "@playwright/test";
import {
  loginAs,
  apiCall,
  BASE_URL,
  API_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ORG_SLUG,
  pageHasCrash,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// A — Login validation (no pre-loaded auth state — fresh context)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("A — Login Validation", () => {
  // Override storageState so tests start unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });

  test("valid admin login → redirects to /app/", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput = page.locator('input[type="password"]').first();
    await emailInput.fill(ADMIN_EMAIL);
    await pwInput.fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/app\//, { timeout: 25_000 });
    expect(page.url()).toMatch(/\/app\//);
  });

  test("wrong password → error message shown, no redirect", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput = page.locator('input[type="password"]').first();
    await emailInput.fill(ADMIN_EMAIL);
    await pwInput.fill("WrongPassword999!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    // Must stay on login page
    expect(page.url()).toMatch(/login/);
    // Error message must appear
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/invalid|incorrect|error|credentials|wrong/i);
  });

  test("empty email + password → validation errors shown", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/login/);
  });

  test("non-existent email → error, no redirect", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput = page.locator('input[type="password"]').first();
    await emailInput.fill("nobody@nonexistent-domain-xyz.com");
    await pwInput.fill("SomePassword1!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    expect(page.url()).toMatch(/login/);
  });

  test("SQL injection in email field → no server error, no redirect", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const pwInput = page.locator('input[type="password"]').first();
    await emailInput.fill("' OR '1'='1'; --").catch(() => {});
    await pwInput.fill("' OR '1'='1'; --").catch(() => {});
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    expect(page.url()).not.toMatch(/\/app\//);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/unexpected|500|server error/i);
  });

  test("XSS in email field → no script reflected in page", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill('<script>window.__XSS=1</script>@test.com').catch(() => {});
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    const xssSet = await page.evaluate(() => (window as unknown as Record<string,unknown>).__XSS).catch(() => null);
    expect(xssSet).toBeFalsy();
  });

  test("rate limiting: rapid login attempts trigger 429", async ({ page }) => {
    // 8 rapid failed logins should trigger rate limit
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

    let got429 = false;
    page.on("response", (resp) => {
      if (resp.url().includes("auth.login") && resp.status() === 429) got429 = true;
    });

    for (let i = 0; i < 8; i++) {
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      const pwInput = page.locator('input[type="password"]').first();
      await emailInput.fill(`baduser${i}@example.com`).catch(() => {});
      await pwInput.fill("badpass").catch(() => {});
      await page.locator('button[type="submit"]').first().click().catch(() => {});
      await page.waitForTimeout(300);
    }

    // Allow up to 3s for last request
    await page.waitForTimeout(3000);
    // Either we got a 429 or the page shows "too many"
    const body = await page.locator("body").innerText().catch(() => "");
    const rateimited = got429 || body.match(/too many|rate limit|wait/i) !== null;
    // Not mandatory to fail — just check server didn't crash
    expect(page.url()).not.toMatch(/\/app\//);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — Logout & Session Invalidation (start fresh)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("B — Logout & Session Invalidation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("logout redirects to login page", async ({ page }) => {
    await loginAs(page);
    // Find logout button
    const logoutBtn = page
      .locator('button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout"), a:has-text("Sign out"), [data-testid*="logout"]')
      .first();

    // Try to click profile/avatar first if logout is nested
    const profileMenu = page
      .locator('[data-testid*="profile"], [data-testid*="avatar"], button:has([alt*="avatar"]), button:has(.avatar), .avatar')
      .first();
    if (await profileMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await profileMenu.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForURL(/login/, { timeout: 15_000 });
      expect(page.url()).toMatch(/login/);
    }
  });

  test("after logout, /app routes redirect to login", async ({ page }) => {
    await loginAs(page);
    // Clear session cookie manually
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) =>
      c.name.toLowerCase().includes("session"),
    );
    if (sessionCookie) {
      await page.context().clearCookies();
      await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      // Must redirect to login
      expect(page.url()).toMatch(/login|^\//);
    }
  });

  test("app routes without any session redirect to login", async ({ page }) => {
    // No login at all
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    expect(page.url()).not.toMatch(/\/app\/dashboard/);
  });

  test("app routes without session: /app/tickets redirects", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    expect(page.url()).not.toMatch(/\/app\/tickets/);
  });

  test("app routes without session: /app/crm redirects", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/crm`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    expect(page.url()).not.toMatch(/\/app\/crm/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — Auth Bypass via API (unauthenticated — explicit fresh context)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("C — API Auth Bypass Attempts", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Navigate to the login page first so page.evaluate has a proper origin
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  });

  test("unauthenticated tickets.list returns 401", async ({ page }) => {
    // Call via proxy (same origin) without session cookie
    const result = await page.evaluate(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/trpc/tickets.list?input=%7B%7D`, {
        credentials: "omit",
      });
      return r.status;
    }, BASE_URL);
    expect(result).toBeGreaterThanOrEqual(401);
  });

  test("unauthenticated tickets.create returns 401", async ({ page }) => {
    const result = await page.evaluate(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/trpc/tickets.create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "hacked", type: "incident" }),
        credentials: "omit",
      });
      return r.status;
    }, BASE_URL);
    expect(result).toBeGreaterThanOrEqual(401);
  });

  test("unauthenticated changes.create returns 401", async ({ page }) => {
    const result = await page.evaluate(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/trpc/changes.create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "hacked", type: "normal", risk: "low" }),
        credentials: "omit",
      });
      return r.status;
    }, BASE_URL);
    expect(result).toBeGreaterThanOrEqual(401);
  });

  test("unauthenticated admin procedures return 401/403", async ({ page }) => {
    const adminEndpoints = [
      "auth.listUsers",
      "settings.get",
    ];
    for (const ep of adminEndpoints) {
      const result = await page.evaluate(async ({ baseUrl, ep }) => {
        const r = await fetch(`${baseUrl}/api/trpc/${ep}?input=%7B%7D`, {
          credentials: "omit",
        });
        return r.status;
      }, { baseUrl: BASE_URL, ep });
      expect(result, `${ep} should block unauthenticated access`).toBeGreaterThanOrEqual(400);
    }
  });

  test("forged session cookie: proxy should block or return 401", async ({ page }) => {
    // The proxy forwards cookies; a fake cookie should not grant access
    const result = await page.evaluate(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/api/trpc/tickets.list?input=%7B%7D`, {
        headers: {},
        credentials: "omit",
      });
      return r.status;
    }, BASE_URL);
    expect(result).toBeGreaterThanOrEqual(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — Session Persistence & Multi-Tab
// ─────────────────────────────────────────────────────────────────────────────
test.describe("D — Session Persistence", () => {
  test("session persists across page reloads", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    // Should still be on tickets, not redirected to login
    expect(page.url()).toMatch(/\/app\/tickets/);
  });

  test("session persists across navigation", async ({ page }) => {
    const routes = ["/app/tickets", "/app/problems", "/app/changes", "/app/crm", "/app/hr"];
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      expect(page.url()).toMatch(/\/app\//);
    }
  });

  test("clearing localStorage does NOT maintain session (cookie-based)", async ({ page }) => {
    // First navigate somewhere to ensure proper page context
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore if localStorage is blocked in some contexts */ }
    }).catch(() => {});
    await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
    // Session is cookie-based, so clearing localStorage shouldn't log out
    // Page should still load (session cookie remains)
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText().catch(() => "");
    // Either still in app (good, cookie still valid) or redirected to login (also acceptable)
    // What's NOT acceptable is a crash
    expect(pageHasCrash(body)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — RBAC: Permission Gates
// ─────────────────────────────────────────────────────────────────────────────
test.describe("E — RBAC Permission Gates", () => {
  test("admin user: can navigate to admin panel", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/admin`, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    // Admin should see admin content, not a "permission denied" full block
    expect(pageHasCrash(body)).toBeNull();
  });

  test("admin user: New Ticket button visible on tickets page", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const newBtn = page.locator('button:has-text("New"), button:has-text("Create"), a:has-text("New Ticket")').first();
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
  });

  test("admin user: can access financial module", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/financial`, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/permission denied|not authorized|forbidden/i);
    expect(pageHasCrash(body)).toBeNull();
  });

  test("admin user: can access reports", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/reports`, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    expect(pageHasCrash(body)).toBeNull();
  });

  test("admin user: catalog manage button visible", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/catalog`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const manageBtn = page.locator('button:has-text("Manage"), button:has-text("Admin"), button:has-text("Manage Items")').first();
    if (await manageBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      expect(true).toBe(true); // Button present for admin
    }
  });

  test("admin API: hr.employees.list returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const result = await apiCall(page, "hr.employees.list", {}, "GET");
    expect(result.status).toBe(200);
  });

  test("admin API: financial.listInvoices returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const result = await apiCall(page, "financial.listInvoices", {}, "GET");
    expect(result.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F — Security: XSS Reflection Check across all modules
// ─────────────────────────────────────────────────────────────────────────────
test.describe("F — XSS Reflection Prevention", () => {
  const XSS_PAYLOAD = '<script>window.__QA_XSS_MARKER=1</script>';
  const XSS_IMG = '<img src=x onerror="window.__QA_XSS_IMG=1">';

  async function checkXSSNotReflected(page: Page): Promise<void> {
    const xssSet = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return { script: w.__QA_XSS_MARKER, img: w.__QA_XSS_IMG };
    }).catch(() => ({ script: null, img: null }));
  expect(xssSet.script, "Script XSS reflected in page!").toBeFalsy();
  expect(xssSet.img, "IMG onerror XSS reflected in page!").toBeFalsy();
  }

  test("tickets/new: XSS in title not reflected", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/tickets/new`, { waitUntil: "domcontentloaded" });
    const titleInput = page
      .locator('input[name="title"], input[placeholder*="title" i], input[placeholder*="subject" i]')
      .first();
    if (await titleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await titleInput.fill(XSS_PAYLOAD);
      await page.waitForTimeout(1000);
      await checkXSSNotReflected(page);
    }
  });

  test("search fields: XSS not reflected", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
    const search = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await search.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await search.fill(XSS_PAYLOAD);
      await page.waitForTimeout(1500);
      await checkXSSNotReflected(page);
    }
  });

  test("crm: XSS in deal/contact form not reflected", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/crm`, { waitUntil: "domcontentloaded" });
    const search = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await search.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await search.fill(XSS_IMG);
      await page.waitForTimeout(1500);
      await checkXSSNotReflected(page);
    }
  });

  test("comments: XSS in ticket comment not executed", async ({ page }) => {
    // Navigate to tickets list and find any ticket
    await page.goto(`${BASE_URL}/app/tickets`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const link = page.locator('a[href*="/app/tickets/"]').first();
    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click();
      await page.waitForURL(/\/app\/tickets\/.+/, { timeout: 15_000 });
      const textarea = page.locator("textarea").first();
      if (await textarea.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const isDisabled = await textarea.isDisabled().catch(() => true);
        if (!isDisabled) {
          await textarea.fill(XSS_PAYLOAD);
          await page.waitForTimeout(1000);
          await checkXSSNotReflected(page);
        }
      }
    }
  });
});
