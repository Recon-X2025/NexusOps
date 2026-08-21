/**
 * SWEEP 47 — BATCH 3 (payroll cycle).
 *
 * Ordering forced by Batch 2: door A of /app/hr REQUIRES a salary structure, and a
 * fresh tenant has none. So: structure → employee → run.
 *
 * The class (c) assertion this batch exists for: a salary structure's effective
 * date must default to the PERIOD START (1st of the month), never to `today`.
 * A structure dated after the 1st is not in force for that month and the run
 * silently pays NOBODY (CLAUDE.md, standing decisions — payroll operability).
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

async function navTo(page: Page, filterText: string, linkName: RegExp, urlRe: RegExp) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill(filterText);
  await page.getByRole("link", { name: linkName }).first().click();
  await page.waitForURL(urlRe, { timeout: 20_000 });
}

test.describe("SWEEP47 B3 — /app/payroll — salary structure", () => {
  test("New structure defaults its effective date to the FIRST of the month, not today", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await navTo(page, "Payroll", /Payroll/i, /\/app\/payroll/);

    await page.getByRole("button", { name: "Salary structures", exact: true }).click();
    await page.getByRole("button", { name: /New structure/i }).click();

    const editor = page.locator("div.max-w-lg").filter({ hasText: "New salary structure" }).first();
    await expect(editor).toBeVisible({ timeout: 10_000 });
    const effFrom = editor.locator('input[type="date"]').first();
    await expect(effFrom).toBeVisible({ timeout: 10_000 });
    const defaultDate = await effFrom.inputValue();

    const now = new Date();
    const expectedFirst = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    console.log(`[B3/structure] effectiveFrom default = ${defaultDate} | first-of-month = ${expectedFirst} | today = ${today}`);
    // SOFT so the run continues and we can prove what gets STORED, not just shown.
    expect.soft(defaultDate, "effective date must default to the period START").toBe(expectedFirst);

    // ── Create it, so the rest of the batch has something to select ─────────
    const stamp = Date.now().toString().slice(-6);
    const structureName = `Sweep47 Structure ${stamp}`;
    await editor.getByRole("textbox").first().fill(structureName);

    // Fill EVERY numeric field — several are `required`, and an empty one blocks
    // submit silently (no mutation fires at all).
    const nums = editor.locator('input[type="number"]:not([readonly]):not([disabled])');
    const n = await nums.count();
    for (let i = 0; i < n; i++) {
      await nums.nth(i).fill(i === 0 ? "1200000" : i === 1 ? "10" : i === 2 ? "40" : "0");
    }
    console.log(`[B3/structure] filled ${n} numeric fields`);

    await editor.getByRole("button", { name: /Save structure|Saving/i }).click();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Salary structures", exact: true }).click();

    const row = page.locator("tr", { hasText: structureName });
    await expect(row, "the structure never appeared in the list").toBeVisible({ timeout: 15_000 });
    const rowText = (await row.textContent())?.replace(/\s+/g, " ").trim();
    console.log(`[B3/structure] ROUND-TRIPPED row = ${JSON.stringify(rowText)}`);
  });
});
