/** Bank Reconciliation (finance) — import statement, match, finalize. */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 15_000 });
}

test.describe("Bank Reconciliation", () => {
  test("P1 admin: /app/finance/accounting/reconciliation loads without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/finance/accounting/reconciliation");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Bank Reconciliation/i })).toBeVisible();
    expect(errors, errors.join("; ")).toHaveLength(0);
  });

  test("create a reconciliation session, import a statement, and finalize", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");

    // Ensure a bank/cash account exists by seeding the standard COA (idempotent).
    await page.goto("/app/accounting");
    await page.waitForLoadState("networkidle");
    const seedBtn = page.getByRole("button", { name: /Seed.*COA|Seed India|Seed Accounts/i }).first();
    if (await seedBtn.isVisible().catch(() => false)) {
      await seedBtn.click();
      // Wait for the seed mutation to settle rather than a fixed sleep.
      await page.waitForLoadState("networkidle");
    }

    await page.goto("/app/finance/accounting/reconciliation");
    await page.waitForLoadState("networkidle");

    // Open the new-statement modal.
    await page.getByTestId("new-statement-btn").click();
    await expect(page.getByTestId("new-statement-modal")).toBeVisible();

    // Select the first bank/cash account in the modal dropdown.
    const accountSelect = page.getByTestId("modal-account-select");
    const optionValues = await accountSelect.locator("option").evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value).filter((v) => v),
    );
    test.skip(optionValues.length === 0, "No bank/cash account available to reconcile");
    await accountSelect.selectOption(optionValues[0]);

    const stmtName = `E2E Statement ${Date.now()}`;
    await page.getByTestId("statement-name-input").fill(stmtName);
    await page.getByTestId("create-statement-submit").click();

    // We should land in the detail view (back button appears).
    await expect(page.getByTestId("back-to-statements")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("unmatched-count")).toBeVisible();

    // Import a small CSV statement via the modal.
    await page.getByTestId("import-txns-btn").click();
    const csv = [
      "date,description,reference,amount",
      "2026-01-05,Stripe payout,STRIPE-001,15000.00",
      "2026-01-08,Office rent,RENT-JAN,-25000.00",
      "2026-01-10,AWS invoice,AWS-9921,-4200.50",
    ].join("\n");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // Step 2 (preview) → Continue.
    await page.getByRole("button", { name: /Continue with .* valid rows/i }).click();
    // Step 3 (confirm) → Import.
    await page.getByRole("button", { name: /Import .* Records/i }).click();
    // Step 5 (done) → Close.
    await page.getByRole("button", { name: /^Close$/i }).click({ timeout: 15_000 });

    await page.waitForLoadState("networkidle");
    // Three transactions should now be present and unmatched.
    await expect(page.getByTestId("txn-row")).toHaveCount(3, { timeout: 10_000 });

    // Ignore all three so the statement can be finalized (no ledger entries to match against).
    // After each click, wait for the button count to actually decrease (event-based,
    // not a fixed sleep) to avoid double-clicks and timing races.
    const ignoreBtns = page.getByTestId("ignore-btn");
    let remaining = await ignoreBtns.count();
    while (remaining > 0) {
      await ignoreBtns.first().click();
      await expect(ignoreBtns).toHaveCount(remaining - 1, { timeout: 10_000 });
      remaining = await ignoreBtns.count();
    }

    // Unmatched count should reach 0 and Finalize becomes enabled.
    await expect(page.getByTestId("unmatched-count")).toHaveText("0", { timeout: 10_000 });
    await page.getByTestId("reconcile-btn").click();

    // Reconciled banner should appear.
    await expect(page.getByText(/fully reconciled/i)).toBeVisible({ timeout: 10_000 });
  });
});
