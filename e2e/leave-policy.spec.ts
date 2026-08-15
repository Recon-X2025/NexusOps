/**
 * ACCEPTANCE — Leave policy create + edit (WO-003 Part 3).
 *
 * Witnessed 15 Aug: an admin on a fresh tenant could not create a leave policy —
 * the Leave Accruals tab listed policies but offered no way to make one.
 *
 * This spec is the acceptance criterion: it reaches the feature by CLICKING ONLY.
 * `page.goto` appears once, for the login page, and nowhere else — navigation to
 * HR, to the tab, and through the form is all real user interaction. If the nav
 * path breaks, this fails, which is the point.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

/** Click through the sidebar. Filtering expands matching groups, revealing the link. */
async function navigateViaSidebar(page: Page, linkName: RegExp) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill("HR Service Delivery");
  await page.getByRole("link", { name: linkName }).first().click();
}

async function openLeaveAccrualsTab(page: Page) {
  await navigateViaSidebar(page, /HR Service Delivery/i);
  await page.waitForURL(/\/app\/hr/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Leave Accruals", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Leave Policies & Accruals/i })).toBeVisible();
}

/** Opens the form from whichever create control is showing (empty state or header). */
async function openNewPolicyForm(page: Page) {
  const emptyStateBtn = page.getByTestId("policy-empty-create-btn");
  if (await emptyStateBtn.isVisible().catch(() => false)) {
    await emptyStateBtn.click();
  } else {
    await page.getByTestId("new-policy-btn").click();
  }
  await expect(page.getByTestId("policy-form-modal")).toBeVisible();
}

test.describe("Leave policy — create and edit from the Leave Accruals tab", () => {
  test("create a policy, see it listed, edit it, and the change survives a reload", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await openLeaveAccrualsTab(page);

    // ── Create ──────────────────────────────────────────────────────────────
    await openNewPolicyForm(page);

    await page.getByTestId("policy-type").selectOption("marriage");
    await page.getByTestId("policy-annual-entitlement").fill("5");
    await page.getByTestId("policy-max-carry-forward").fill("2");
    await page.getByTestId("policy-year-end-treatment").selectOption("forfeit");
    await page.getByTestId("policy-exit-treatment").selectOption("encash_all");
    await page.getByTestId("policy-encashment-basis").selectOption("basic_da");
    await page.getByTestId("policy-encashment-divisor").selectOption("26");
    await page.getByTestId("policy-expiry-mode").selectOption("year_end");
    await page.getByTestId("policy-save-btn").click();

    await expect(page.getByTestId("policy-form-modal")).toBeHidden({ timeout: 15_000 });

    const row = page.getByTestId("policy-row-marriage");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("policy-entitlement-marriage")).toContainText("5");

    // ── Edit ────────────────────────────────────────────────────────────────
    await page.getByTestId("policy-edit-marriage").click();
    await expect(page.getByTestId("policy-form-modal")).toBeVisible();
    // The form must be populated from the existing row, not blank.
    await expect(page.getByTestId("policy-annual-entitlement")).toHaveValue("5");

    await page.getByTestId("policy-annual-entitlement").fill("7");
    await page.getByTestId("policy-save-btn").click();
    await expect(page.getByTestId("policy-form-modal")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId("policy-entitlement-marriage")).toContainText("7");

    // ── Persistence ─────────────────────────────────────────────────────────
    // Reload and click back to the tab: the edit must have reached the database,
    // not merely the client cache.
    await page.reload();
    await page.getByRole("button", { name: "Leave Accruals", exact: true }).click();
    await expect(page.getByTestId("policy-entitlement-marriage")).toContainText("7", {
      timeout: 15_000,
    });
  });

  test("the server's maternity floor is shown on the form, not as a vanishing toast", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await openLeaveAccrualsTab(page);
    await openNewPolicyForm(page);

    // Maternity Benefit Act 1961 — 26 weeks = 182 days. The server rejects less.
    await page.getByTestId("policy-type").selectOption("maternity");
    await page.getByTestId("policy-annual-entitlement").fill("30");
    await page.getByTestId("policy-save-btn").click();

    const error = page.getByTestId("policy-form-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/182|26 weeks|Maternity/i);
    // The form stays open with the values intact so the number can be corrected.
    await expect(page.getByTestId("policy-form-modal")).toBeVisible();
    await expect(page.getByTestId("policy-annual-entitlement")).toHaveValue("30");
  });
});
