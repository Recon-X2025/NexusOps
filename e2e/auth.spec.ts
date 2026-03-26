import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type=email]", "admin@coheron.com");
    await page.fill("input[type=password]", "wrongpassword");
    await page.click("button[type=submit]");
    // Should show error, not redirect
    await expect(page).not.toHaveURL("/app/dashboard");
  });

  test("auth guard: unauthenticated access to /app redirects to login", async ({ page }) => {
    await page.goto("/app/tickets");
    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type=email]", "admin@coheron.com");
    await page.fill("input[type=password]", "demo1234!");
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/app\/dashboard/, { timeout: 10000 });
  });
});

test.describe("Create Ticket E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill("input[type=email]", "admin@coheron.com");
    await page.fill("input[type=password]", "demo1234!");
    await page.click("button[type=submit]");
    await page.waitForURL(/app\/dashboard/);
  });

  test("navigate to create ticket form", async ({ page }) => {
    await page.goto("/app/tickets/new");
    await expect(page.locator("h1")).toContainText(/ticket|incident/i);
  });
});
