/**
 * ACCEPTANCE — the Admin Console user table shows no invented identifier (Round 7).
 *
 * Observed on the live Vultr tenant: two distinct accounts (test@test.ai and
 * test@coheron.com) both rendered a "USERNAME" of "test", because the column was
 * `email.split("@")[0]`. There is no username column anywhere in the schema — the
 * value was invented by the table, and it collided.
 *
 * The column is gone. This spec reaches User Management BY CLICKING (page.goto is
 * used once, for /login) and asserts both that the header is absent and that two
 * users with different emails are distinguishable on screen.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

test.describe("Admin Console — user table", () => {
  test("no USERNAME column, and users with different emails are distinguishable", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");

    // Click through the sidebar to Administration, then its User Management tab
    // (the sidebar exposes the hub; the tabs live on the page).
    const filter = page.getByPlaceholder("Filter navigator...");
    await filter.click();
    await filter.fill("Administration");
    await page.getByRole("link", { name: /Administration/i }).first().click();
    await page.waitForURL(/\/app\/admin/, { timeout: 20_000 });
    await page.getByRole("button", { name: "User Management", exact: true }).click();
    await page.waitForLoadState("networkidle");

    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15_000 });

    // ── The invented column is gone ─────────────────────────────────────────
    const headers = (await table.locator("thead th").allTextContents()).map((h) => h.trim());
    expect(headers).not.toContain("Username");
    expect(headers.some((h) => /username/i.test(h))).toBe(false);
    // Email — the real identifier — is still there.
    expect(headers).toContain("Email");

    // ── Two different users render as distinguishable rows ──────────────────
    // The seed provisions several accounts on one domain; before the fix their
    // USERNAME cells were the email local-parts, which is exactly what collided.
    const emailCells = await table.locator("tbody tr td:nth-child(3)").allTextContents();
    const emails = emailCells.map((e) => e.trim()).filter((e) => e.includes("@"));
    expect(emails.length, "expected at least two seeded users").toBeGreaterThanOrEqual(2);
    expect(new Set(emails).size, "every row must show a distinct email").toBe(emails.length);
  });
});
