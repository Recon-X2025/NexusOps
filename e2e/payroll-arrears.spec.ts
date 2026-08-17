/**
 * ACCEPTANCE — arrears are reachable and recordable by CLICKING.
 *
 * The gap this closes: `salaryStructures.upsert` has always refused to edit a version that
 * already has payslips and told the operator to "post the change as arrears in the current
 * month" — a route with no implementation anywhere. The engine, schema and router now exist,
 * but this repo's recurring failure is engines nobody can reach (G18 depreciation, G20 balance
 * sheet, G21 SAM — all correct and orphaned until someone gave them a screen). A router test
 * proves the arithmetic; only a click proves the feature.
 *
 * Path: sidebar → Payroll → Arrears tab → pick an employee → record an amount → it appears in
 * the period's list → remove it → the list is empty again.
 *
 * `page.goto` is used once, for /login, and nowhere else — reaching the tab through the real
 * navigation is the point of the spec.
 */
import { test, expect, type Page } from "@playwright/test";

const AMOUNT = 4321;

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

/**
 * Reach a page through the sidebar navigator, scoped to the navigation landmark so an in-page
 * cross-link cannot masquerade as a nav path that does not exist.
 */
async function navigateTo(page: Page, filterText: string, linkName: RegExp, urlRe: RegExp) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill(filterText);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: linkName })
    .first()
    .click();
  await page.waitForURL(urlRe, { timeout: 20_000 });
}

test.describe("payroll arrears", () => {
  /**
   * SCOPE, stated honestly. The E2E database has **zero employees org-wide** (verified:
   * `select count(*) from employees` on the e2e DB returns 0), so the record-an-amount path
   * cannot be exercised by clicking here — and neither can the existing Tax declarations or
   * Form 16 tabs, which depend on the same list. That is an E2E SEED gap, recorded in
   * reports/fix-plan.md, not a defect in this feature.
   *
   * This spec therefore proves what a click genuinely can prove on this seed: the tab is
   * reachable through real navigation, it renders, it carries the PF warning before anyone
   * touches money, the period selector drives the list, and both empty states are HONEST.
   * The record → persist → remove path is covered by `payroll-arrears.test.ts` (10 cases on
   * real Postgres). A self-skipping test that goes green while proving nothing would be worse
   * than this smaller, true one.
   */
  test("the Arrears tab is reachable and tells the truth when empty", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await navigateTo(page, "Payroll", /^Payroll$/, /app\/payroll/);

    // Reachability — the claim this spec exists to make.
    await page.getByRole("button", { name: "Arrears" }).click();
    await expect(
      page.getByText(/Back-pay for an .*earlier.* period/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The PF warning must be on screen BEFORE anyone can record money: paying arrears changes
    // the PF deducted that month, and an operator should not discover that after approving.
    await expect(page.getByText(/change the PF deducted this month/i)).toBeVisible();

    // The period selector drives the list, and the empty state names the period it is empty FOR
    // — "no arrears" without saying for when is the kind of half-statement that reads as fact.
    await page.locator("select").first().selectOption("7");
    await expect(page.getByText(/No arrears recorded for July 2026\./)).toBeVisible({
      timeout: 10_000,
    });
    await page.locator("select").first().selectOption("9");
    await expect(page.getByText(/No arrears recorded for September 2026\./)).toBeVisible({
      timeout: 10_000,
    });

    // The employee section must distinguish "none" from "not loaded". It renders "No employees
    // found." ONLY once the query has actually returned an empty list — the first cut of this
    // screen collapsed undefined into that message, asserting something it did not know.
    await expect(page.getByText("Record arrears")).toBeVisible();
    await expect(page.getByText("No employees found.")).toBeVisible({ timeout: 15_000 });
  });
});
