/**
 * ACCEPTANCE — Chart of Accounts: Add Account saves a sub-type (WO-003 Part 4).
 *
 * Witnessed 15 Aug: an account created through Add Account saved with a blank
 * sub-type because the form had no sub-type field. Bank reconciliation selects
 * accounts BY sub-type, so a hand-created bank account was invisible to it —
 * which is why reconciliation only ever saw the single seeded account.
 *
 * Reaches the feature by CLICKING ONLY; `page.goto` appears once, for login.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

test.describe("Chart of Accounts — Add Account with sub-type", () => {
  test("create an asset account with sub-type Bank; it still reads Bank after a reload", async ({ page }) => {
    // Unique per run: the (org, code) pair is unique and this spec re-runs.
    const code = `9${Date.now().toString().slice(-6)}`;
    const name = `E2E Bank ${code}`;

    await loginAs(page, "admin@coheron.com");

    // ── Click through the sidebar to Chart of Accounts ──────────────────────
    const filter = page.getByPlaceholder("Filter navigator...");
    await filter.click();
    await filter.fill("Chart of Accounts");
    await page.getByRole("link", { name: /Chart of Accounts/i }).first().click();
    await page.waitForURL(/\/app\/finance\/accounting\/coa/, { timeout: 20_000 });

    // ── Create the account ──────────────────────────────────────────────────
    await page.getByTestId("coa-add-account-btn").click();

    await page.getByPlaceholder("1100").fill(code);
    await page.getByPlaceholder("e.g. Bank — HDFC").fill(name);
    await page.getByTestId("coa-type").selectOption("asset");

    // Choosing ASSET must offer Bank — and must NOT offer an income sub-type.
    const subType = page.getByTestId("coa-subtype");
    const assetOptions = await subType.locator("option").evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value),
    );
    expect(assetOptions).toContain("bank");
    expect(assetOptions).toContain("cash");
    expect(assetOptions).not.toContain("other_income");

    await subType.selectOption("bank");
    await page.getByTestId("coa-create-submit").click();

    // ── Persistence: reload, find the row, assert the stored sub-type ───────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder("Search by name or code...").fill(code);

    const cell = page.getByTestId(`coa-subtype-cell-${code}`);
    await expect(cell).toBeVisible({ timeout: 15_000 });
    await expect(cell).toHaveText(/bank/i);
  });

  test("switching the account type re-scopes the sub-type options", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");

    const filter = page.getByPlaceholder("Filter navigator...");
    await filter.click();
    await filter.fill("Chart of Accounts");
    await page.getByRole("link", { name: /Chart of Accounts/i }).first().click();
    await page.waitForURL(/\/app\/finance\/accounting\/coa/, { timeout: 20_000 });

    await page.getByTestId("coa-add-account-btn").click();
    const subType = page.getByTestId("coa-subtype");

    await page.getByTestId("coa-type").selectOption("income");
    const incomeOptions = await subType.locator("option").evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value),
    );
    expect(incomeOptions).toContain("other_income");
    expect(incomeOptions).not.toContain("bank");
  });
});
