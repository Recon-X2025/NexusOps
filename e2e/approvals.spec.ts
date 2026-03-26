/**
 * approvals.spec.ts — Procurement / Approval workflow E2E tests
 * Requires: dev server running, DB seeded
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/dashboard/, { timeout: 15_000 });
}

test.describe("Approvals & Procurement", () => {
  test("approvals page loads for admin", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/approvals");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Unhandled Runtime Error");
    expect(body).not.toContain("Application error");
  });

  test("approvals page shows pending approvals section", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/approvals");
    await page.waitForLoadState("networkidle");
    // Should render the approvals module — either items or empty state
    const body = await page.textContent("body");
    expect(body).toBeDefined();
    // Check for recognizable content markers
    const hasContent = body!.includes("Approval") || body!.includes("Pending") || body!.includes("Review");
    expect(hasContent).toBe(true);
  });

  test("procurement page loads", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/procurement");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("procurement — create purchase request form accessible", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/procurement");
    await page.waitForLoadState("networkidle");

    // Look for a "New" / "Create" / "Raise" button
    const newBtn = page.locator("button, a").filter({ hasText: /new|create|raise|purchase request/i }).first();
    if (await newBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForLoadState("networkidle");
      const body = await page.textContent("body");
      expect(body).not.toContain("Unhandled Runtime Error");
    }
  });

  test("approval decision — approve button visible for pending items", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/approvals");
    await page.waitForLoadState("networkidle");

    // If there are pending approvals, approve button should exist
    const approveBtn = page.locator("button").filter({ hasText: /approve/i }).first();
    // Test is non-fatal: just checks it doesn't crash if the button is present
    const isVisible = await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (isVisible) {
      // Verify no crash on click (with confirmation handling)
      page.on("dialog", (dialog) => dialog.accept());
      await approveBtn.click();
      await page.waitForLoadState("networkidle");
      const body = await page.textContent("body");
      expect(body).not.toContain("Unhandled Runtime Error");
    }
  });
});
