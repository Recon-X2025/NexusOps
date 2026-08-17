/**
 * ACCEPTANCE — the Balance Sheet and the P&L are reachable, and the balance
 * sheet balances on entries posted through the product.
 *
 * The 15 August audit put both statements at 10%: "engines real and correct …
 * orphaned — no UI, no nav, no route … reachable only by a direct API call".
 * Self-balancing in a unit test is not the same claim as balancing on real
 * posted data, so this spec establishes the second one by CLICKING:
 *
 *   Journal Entries → create a balanced entry → Post it
 *   → Balance Sheet  → the check is green AND assets really do equal
 *                      liabilities plus equity when the rendered totals are
 *                      parsed and added up
 *   → Profit & Loss  → total income moved by exactly the amount posted
 *
 * The income delta is measured before and after rather than asserted as an
 * absolute, because the E2E database is shared across specs and other specs
 * post to the ledger too. Playwright runs this suite with `workers: 1` and
 * `fullyParallel: false`, so nothing else posts in between.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

const AMOUNT = 123456;

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

/**
 * Reach a page through the sidebar navigator. Scoped to the navigation
 * landmark: both statement screens carry a header link to the other one, so an
 * unscoped `getByRole("link")` could match the page's own cross-link instead of
 * the nav entry and "prove" a nav path that does not exist.
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

/** `₹12,34,567.50` / `-₹1,000.00` → number. */
function parseInr(text: string): number {
  const negative = text.trim().startsWith("-");
  const digits = text.replace(/[^0-9.]/g, "");
  const n = Number(digits);
  if (!Number.isFinite(n)) throw new Error(`Unparseable money string: ${JSON.stringify(text)}`);
  return negative ? -n : n;
}

/** Option value on a `{code} - {name}` account select, chosen by account code. */
async function accountOptionValue(select: ReturnType<Page["locator"]>, code: string): Promise<string> {
  const options = await select.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => ({ value: o.value, text: o.textContent ?? "" })),
  );
  const match = options.find((o) => o.value && o.text.trim().startsWith(`${code} `));
  if (!match) {
    throw new Error(
      `Account ${code} is not in the chart of accounts. Available: ${options
        .map((o) => o.text.trim())
        .join(" | ")}`,
    );
  }
  return match.value;
}

test.describe("Finance statements — balance sheet and P&L", () => {
  test("post an entry, then the balance sheet balances and the P&L reflects it", async ({ page }) => {
    const subject = `E2E Statements ${Date.now()}`;

    await loginAs(page, "admin@coheron.com");

    // ── Baseline: this month's total income before posting anything ─────────
    await navigateTo(page, "Profit & Loss", /Profit & Loss/i, /\/app\/finance\/accounting\/pnl/);

    const pnlEmptyBefore = page.getByTestId("pnl-empty");
    const pnlIncomeBefore = page.getByTestId("pnl-total-income");
    await expect(pnlEmptyBefore.or(pnlIncomeBefore)).toBeVisible({ timeout: 20_000 });
    const incomeBefore = (await pnlIncomeBefore.count())
      ? parseInr(await pnlIncomeBefore.innerText())
      : 0;

    // ── Post a balanced entry: debit Bank, credit Revenue ───────────────────
    await navigateTo(page, "Journal Entries", /Journal Entries/i, /\/app\/finance\/accounting\/journal/);

    await page.getByRole("button", { name: /New Entry/i }).click();
    await page.getByPlaceholder("e.g. Monthly Rent Payment").fill(subject);

    const accountSelects = page.locator("select");
    // 1120 Bank Accounts (asset) and 4100 Revenue from Operations (income) are
    // both in the seeded chart of accounts. An income account is required — a
    // two-asset entry would balance and show nothing at all on a P&L.
    const bankValue = await accountOptionValue(accountSelects.first(), "1120");
    const revenueValue = await accountOptionValue(accountSelects.first(), "4100");

    await accountSelects.nth(0).selectOption(bankValue);
    await accountSelects.nth(1).selectOption(revenueValue);

    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill(String(AMOUNT)); // line 1 debit  — bank
    await numberInputs.nth(3).fill(String(AMOUNT)); // line 2 credit — revenue

    await page.getByRole("button", { name: /Save Entry/i }).click();

    const row = page.locator("tr", { hasText: subject });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const number = (await row.locator("td").nth(1).innerText()).trim();
    expect(number).toBeTruthy();

    await expect(page.getByTestId(`je-status-${number}`)).toHaveText(/draft/i);
    await page.getByTestId(`je-post-${number}`).click();
    await expect(page.getByTestId(`je-status-${number}`)).toHaveText(/posted/i, { timeout: 15_000 });

    // ── Balance Sheet, reached by clicking the nav ──────────────────────────
    await navigateTo(page, "Balance Sheet", /Balance Sheet/i, /\/app\/finance\/accounting\/balance-sheet/);

    const check = page.getByTestId("bs-balance-check");
    await expect(check).toBeVisible({ timeout: 20_000 });

    // The screen's own verdict …
    await expect(check).toHaveAttribute("data-balanced", "true");
    await expect(check).toContainText(/Balanced/i);

    // … and the same claim re-derived from the rendered totals, so a hardcoded
    // green banner could not pass this.
    const totalAssets = parseInr(await page.getByTestId("bs-total-assets").innerText());
    const totalLiabilities = parseInr(await page.getByTestId("bs-total-liabilities").innerText());
    const totalEquity = parseInr(await page.getByTestId("bs-total-equity").innerText());
    expect(Math.abs(totalAssets - (totalLiabilities + totalEquity))).toBeLessThan(0.01);

    // The posted entry is on the sheet: the bank account line is rendered.
    await expect(page.getByTestId("bs-amount-1120")).toBeVisible();
    // Current-period earnings is the derived equity line, always rendered.
    await expect(page.getByTestId("bs-current-period-earnings")).toBeVisible();

    // ── Profit & Loss picks the same posting up ─────────────────────────────
    await navigateTo(page, "Profit & Loss", /Profit & Loss/i, /\/app\/finance\/accounting\/pnl/);

    const incomeAfterEl = page.getByTestId("pnl-total-income");
    await expect(incomeAfterEl).toBeVisible({ timeout: 20_000 });
    // POLLED, not read once. This is a return visit, so React Query has the
    // FIRST visit's result cached and renders it immediately while refetching
    // in the background — `staleTime: 0` + `refetchOnMount: "always"` guarantee
    // the refetch happens, not that the stale figure is hidden while it does.
    // Reading innerText() synchronously therefore observed the pre-posting ₹0
    // and asserted a delta of 0 against 1,23,456. The equality below is
    // unchanged and just as strict — it is only allowed to arrive
    // asynchronously, which is what "the P&L reflects it" actually means.
    await expect
      .poll(
        async () => parseInr(await incomeAfterEl.innerText()) - incomeBefore,
        { timeout: 20_000, message: "the P&L must pick up the posted revenue" },
      )
      .toBeCloseTo(AMOUNT, 2);

    // The revenue account is itemised, and the net figure renders.
    await expect(page.getByTestId("pnl-amount-4100")).toBeVisible();
    await expect(page.getByTestId("pnl-net-profit")).toBeVisible();
  });

  test("the period picker is on both statements and defaults to the current month", async ({ page }) => {
    const currentMonth = `${new Date().getUTCFullYear()}-${String(
      new Date().getUTCMonth() + 1,
    ).padStart(2, "0")}`;

    await loginAs(page, "admin@coheron.com");

    await navigateTo(page, "Balance Sheet", /Balance Sheet/i, /\/app\/finance\/accounting\/balance-sheet/);
    await expect(page.getByTestId("bs-period")).toHaveValue(currentMonth);

    // A period with nothing in it must say so, not render a page of zeroes.
    await page.getByTestId("bs-period").fill("2001-01");
    await expect(page.getByTestId("bs-empty")).toBeVisible({ timeout: 20_000 });

    await navigateTo(page, "Profit & Loss", /Profit & Loss/i, /\/app\/finance\/accounting\/pnl/);
    await expect(page.getByTestId("pnl-period")).toHaveValue(currentMonth);

    await page.getByTestId("pnl-period").fill("2001-01");
    await expect(page.getByTestId("pnl-empty")).toBeVisible({ timeout: 20_000 });
  });
});
