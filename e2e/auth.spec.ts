/** Auth shell (Seq 11 C4) — @see docs/QA_AUTH_ITSM_E2E_TEST_PACK.md */
import { test, expect, type Page } from "@playwright/test";

async function expectNoRuntimeCrash(page: Page, path: string) {
  const batch: string[] = [];
  const onErr = (e: Error) => batch.push(e.message);
  page.on("pageerror", onErr);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const body = await page.textContent("body");
  page.off("pageerror", onErr);
  expect(body, path).not.toContain("Unhandled Runtime Error");
  expect(batch, `${path}: ${batch.join("; ")}`).toHaveLength(0);
}

test.describe("Authentication (Seq 11 C4)", () => {
  test("login page loads", async ({ page }) => {
    await expectNoRuntimeCrash(page, "/login");
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
  });

  test("signup page loads", async ({ page }) => {
    await expectNoRuntimeCrash(page, "/signup");
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[data-testid="login-email"]', "admin@coheron.com");
    await page.fill('[data-testid="login-password"]', "wrongpassword");
    await page.click('[data-testid="login-submit"]');
    await expect(page).not.toHaveURL("/app/dashboard");
  });

  test("auth guard: unauthenticated access to /app redirects to login", async ({ page }) => {
    await page.goto("/app/tickets");
    await expect(page).toHaveURL(/login/);
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[data-testid="login-email"]', "admin@coheron.com");
    await page.fill('[data-testid="login-password"]', "demo1234!");
    await page.click('[data-testid="login-submit"]');
    await expect(page).toHaveURL(/app\/dashboard/, { timeout: 10000 });
  });
});

test.describe("Create Ticket E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('[data-testid="login-email"]', "admin@coheron.com");
    await page.fill('[data-testid="login-password"]', "demo1234!");
    await page.click('[data-testid="login-submit"]');
    await page.waitForURL(/app\/dashboard/);
  });

  test("navigate to create ticket form", async ({ page }) => {
    await page.goto("/app/tickets/new");
    await expect(page.locator("h1")).toContainText(/ticket|incident/i);
  });
});
