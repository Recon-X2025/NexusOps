/**
 * ACCEPTANCE — a journal entry can be POSTED and reaches the ledger (Round 4 Part 3).
 *
 * Witnessed on connect.coheron.tech, 15 Aug: an admin created a balanced entry
 * (JE-2026-00001, Rs 67,000) through the sidebar Journal Entries page. It saved,
 * and the chart of accounts showed no movement — because nothing posted it. There
 * was no Post control on the list or the row, and no status column to reveal that
 * the entry was still a draft. Post/Reverse existed only on an orphaned
 * /app/accounting page with no nav path to it.
 *
 * (That page was retired on 2026-08-17 — the history above is why this spec
 * exists, not a description of the current tree. Post/Reverse now live on the
 * sidebar Journal Entries page, which is what this spec clicks through.)
 *
 * The spec proves the whole chain by CLICKING: create → post → the entry appears in
 * the General Ledger with a real debit and credit. page.goto is used once, for
 * /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

async function navigateTo(page: Page, filterText: string, linkName: RegExp, urlRe: RegExp) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill(filterText);
  await page.getByRole("link", { name: linkName }).first().click();
  await page.waitForURL(urlRe, { timeout: 20_000 });
}

test.describe("Journal entry — post it and see it in the ledger", () => {
  test("create a balanced entry, post it, and find it in the General Ledger", async ({ page }) => {
    const subject = `E2E Post ${Date.now()}`;

    await loginAs(page, "admin@coheron.com");

    // ── Journal Entries, by clicking ────────────────────────────────────────
    await navigateTo(page, "Journal Entries", /Journal Entries/i, /\/app\/finance\/accounting\/journal/);

    await page.getByRole("button", { name: /New Entry/i }).click();
    await page.getByPlaceholder("e.g. Monthly Rent Payment").fill(subject);

    // Two lines, equal and opposite, against the first two available accounts.
    const accountSelects = page.locator("select");
    const optionValues = await accountSelects.first().locator("option").evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value).filter((v) => v),
    );
    test.skip(optionValues.length < 2, "Needs at least two accounts in the chart of accounts");

    await accountSelects.nth(0).selectOption(optionValues[0]!);
    await accountSelects.nth(1).selectOption(optionValues[1]!);

    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill("67000");   // line 1 debit
    await numberInputs.nth(3).fill("67000");   // line 2 credit

    await page.getByRole("button", { name: /Save Entry/i }).click();

    // ── The new entry is listed as a DRAFT ──────────────────────────────────
    const row = page.locator("tr", { hasText: subject });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const number = (await row.locator("td").nth(1).innerText()).trim();
    expect(number).toBeTruthy();

    await expect(page.getByTestId(`je-status-${number}`)).toHaveText(/draft/i);

    // ── Post it ─────────────────────────────────────────────────────────────
    await page.getByTestId(`je-post-${number}`).click();
    await expect(page.getByTestId(`je-status-${number}`)).toHaveText(/posted/i, { timeout: 15_000 });

    // ── It reached the ledger ───────────────────────────────────────────────
    await navigateTo(page, "General Ledger", /General Ledger/i, /\/app\/finance\/accounting\/ledger/);

    // Pick the account used on line 1; its ledger must now show the entry.
    const ledgerAccount = page.locator("select").first();
    await ledgerAccount.selectOption(optionValues[0]!);
    await page.waitForLoadState("networkidle");

    const ledgerRow = page.locator("tr", { hasText: number });
    await expect(ledgerRow).toBeVisible({ timeout: 15_000 });
    // A posted line must render a real amount — this is exactly what was blank
    // before the debitAmount/creditAmount fix in an earlier round.
    await expect(ledgerRow).toContainText("67,000");
  });
});
