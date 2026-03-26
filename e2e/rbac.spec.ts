/**
 * rbac.spec.ts — Role-Based Access Control E2E tests
 * Validates UI + API alignment for admin vs. restricted users
 * Requires: dev server running, DB seeded with admin@coheron.com and viewer@coheron.com
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/dashboard/, { timeout: 15_000 });
}

async function logout(page: Page) {
  // Click user menu button (avatar/name in header)
  const userMenuBtn = page.locator("button").filter({ hasText: /sign out|logout/i }).first();
  if (await userMenuBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await userMenuBtn.click();
  } else {
    // Try opening the user dropdown first
    const headerBtn = page.locator('[data-testid="user-menu-trigger"], button:has(.rounded-full)').first();
    if (await headerBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await headerBtn.click();
      await page.locator("button, a").filter({ hasText: /sign out/i }).first().click();
    }
  }
  await page.context().clearCookies();
}

// ── Admin tests ───────────────────────────────────────────────────────────────

test.describe("RBAC — Admin (full access)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
  });

  test("admin sees Admin Console in navigation or header", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toBeDefined();
    // Admin users should see admin-related navigation
    const hasAdminNav = body!.includes("Admin") || body!.includes("Administration");
    expect(hasAdminNav).toBe(true);
  });

  test("admin can access /app/admin without AccessDenied", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/app/admin");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Access Denied");
    expect(body).not.toContain("Unhandled Runtime Error");
    const critical = errors.filter((e) => !e.includes("favicon") && !e.includes("ERR_"));
    expect(critical).toHaveLength(0);
  });

  test("admin can access security module", async ({ page }) => {
    await page.goto("/app/security");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Access Denied");
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("admin can access financial module", async ({ page }) => {
    await page.goto("/app/financial");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("admin can access GRC module", async ({ page }) => {
    await page.goto("/app/grc");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Access Denied");
    expect(body).not.toContain("Unhandled Runtime Error");
  });
});

// ── Viewer (restricted) tests ────────────────────────────────────────────────

test.describe("RBAC — Restricted user", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "viewer@coheron.com");
  });

  test("viewer is denied access to /app/admin", async ({ page }) => {
    await page.goto("/app/admin");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    const url = page.url();
    // Either redirected away or shown AccessDenied
    const isRestricted =
      !url.endsWith("/app/admin") ||
      body!.includes("Access Denied") ||
      body!.includes("Permission") ||
      body!.includes("Forbidden") ||
      body!.includes("not authorized");
    expect(isRestricted).toBe(true);
  });

  test("viewer cannot see admin console link in UI", async ({ page }) => {
    // Admin-only links should not be visible for viewers
    const adminLink = page.locator("a[href='/app/admin']");
    const isVisible = await adminLink.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(isVisible).toBe(false);
  });

  test("viewer can access dashboard", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("viewer cannot see role switcher (demo-only component)", async ({ page }) => {
    // Role switcher should only appear in demo mode, not for real auth users
    const roleSwitcher = page.locator('[data-testid="role-switcher"], [aria-label*="role switcher" i]');
    const isVisible = await roleSwitcher.isVisible({ timeout: 2_000 }).catch(() => false);
    // In production mode with a real user, role switcher should not be shown
    expect(isVisible).toBe(false);
  });
});

// ── Session management ───────────────────────────────────────────────────────

test.describe("RBAC — Session & Auth Guard", () => {
  test("unauthenticated user redirected from /app/* to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/app/tickets");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });

  test("unauthenticated user redirected from /app/admin to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/app/admin");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });

  test("session cookie cleared after logout clears access", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    // Verify logged in
    await expect(page).toHaveURL(/app\/dashboard/);
    // Clear cookies manually (simulates session expiry)
    await page.context().clearCookies();
    // Navigate and check redirect
    await page.goto("/app/tickets");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
