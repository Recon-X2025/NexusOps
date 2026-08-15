/**
 * ACCEPTANCE — the CRM lead lifecycle, end to end by clicking (Round 9b).
 *
 * Two things this proves that unit tests cannot:
 *  1. Exactly ONE Edit Lead dialog renders. There used to be two, both gated on the
 *     same `editingLead` state, so both stacked on screen and which one you used
 *     changed what was saved — one sent BANT and `source`, the other neither.
 *  2. A lead can be qualified from the ROW and converted, with the estimated value
 *     landing on the deal, without ever opening a form to change a dropdown.
 *
 * page.goto is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

test.describe("CRM lead lifecycle", () => {
  test("create with BANT, log an activity, advance from the row, convert carrying the value", async ({ page }) => {
    const stamp = Date.now();
    const company = `Lifecycle Co ${stamp}`;
    const email = `lead-${stamp}@lifecycle.test`;

    await loginAs(page, "admin@coheron.com");

    // ── Click through to CRM → Leads ────────────────────────────────────────
    const filter = page.getByPlaceholder("Filter navigator...");
    await filter.click();
    await filter.fill("CRM");
    await page.getByRole("link", { name: /CRM & Sales/i }).first().click();
    await page.waitForURL(/\/app\/crm/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Leads", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    // ── Create the lead ─────────────────────────────────────────────────────
    await page.getByRole("button", { name: /Add Lead/i }).first().click();
    // Field order in the New Lead modal: first, last, company, title, phone, email.
    const inputs = page.locator('.fixed input');
    await inputs.nth(0).fill("Grace");
    await inputs.nth(1).fill("Hopper");
    await inputs.nth(2).fill(company);
    await inputs.nth(4).fill("+91 90000 00000");
    await inputs.nth(5).fill(email);
    await page.getByRole("button", { name: /^(Create|Add) Lead$/i }).last().click();
    await page.waitForLoadState("networkidle");

    const row = page.locator("tr", { hasText: company }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // ── Open the edit dialog: EXACTLY ONE must render ───────────────────────
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    const dialogHeadings = page.getByRole("heading", { name: /^Edit Lead/i });
    await expect(dialogHeadings).toHaveCount(1);

    // ── Capture BANT + the opportunity shape ────────────────────────────────
    await page.getByTestId("lead-budget-band").selectOption("over_25l");
    await page.getByTestId("lead-authority").selectOption("decision_maker");
    await page.getByTestId("lead-timeline").selectOption("immediate");
    await page.getByTestId("lead-need").fill("Replacing a spreadsheet payroll process");
    await page.getByTestId("lead-estimated-value").fill("250000");
    await page.getByTestId("lead-expected-close").fill("2026-12-31");
    await page.getByTestId("lead-edit-save").click();
    await expect(dialogHeadings).toHaveCount(0, { timeout: 15_000 });

    // The estimated value is now on the row. Formatted en-IN (2,50,000), so match
    // the digits rather than a locale-specific grouping.
    await expect(row).toContainText("2,50,000");

    // ── Advance from the ROW, no dialog ─────────────────────────────────────
    await row.getByTestId("lead-advance-contacted").click();
    await expect(row).toContainText(/contacted/i, { timeout: 15_000 });
    await row.getByTestId("lead-advance-qualified").click();
    await expect(row).toContainText(/qualified/i, { timeout: 15_000 });

    // `converted` is never offered as a row advance — it must go through Convert.
    await expect(row.getByTestId("lead-advance-converted")).toHaveCount(0);

    // ── Convert, and the deal carries the estimated value ───────────────────
    await row.getByRole("button", { name: /^Convert$/i }).click();
    await page.waitForLoadState("networkidle");

    // The lead is now converted — a terminal state offering no row advance.
    await expect(row).toContainText(/converted/i, { timeout: 15_000 });
    await expect(row.getByTestId("lead-advance-disqualified")).toHaveCount(0);

    // The deal it created carries the estimated value. Deals live on the Pipeline
    // tab (there is no "Deals" tab).
    //
    // The Pipeline abbreviates money to ₹250K (page.tsx:1007) while the leads list
    // renders ₹2,50,000 via toLocaleString("en-IN") — two screens, two formats. So
    // this asserts the RAW value carried on data-value rather than any rendered
    // string: a locale or formatting change must not break this test, but the deal
    // losing its value must.
    await page.getByRole("button", { name: "Pipeline", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    const values = page.getByTestId("pipeline-deal-value");
    await expect(values.first()).toBeVisible({ timeout: 15_000 });
    const raw = await values.evaluateAll((els) =>
      (els as HTMLElement[]).map((e) => Number(e.dataset["value"] ?? 0)),
    );
    // 250000 exactly — the estimatedValue captured on the lead, carried through
    // conversion onto the deal.
    expect(raw).toContain(250000);
  });
});
