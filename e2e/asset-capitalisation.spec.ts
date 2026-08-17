/**
 * ACCEPTANCE — buying an asset puts it on the balance sheet.
 *
 * `assets.create` inserted the asset row and a history row and posted NO journal
 * entry. It is the only product path that creates an asset, so every asset was
 * absent from the books and the balance sheet was short by the cost of
 * everything the company owned. Depreciation made it visibly wrong: 1290
 * Accumulated Depreciation carried a balance while the gross asset account had
 * never been touched — a contra-asset with no asset behind it.
 *
 * This walks the whole chain by CLICKING: create an asset with a cost in Asset
 * Management, then read the balance sheet and assert the asset account moved by
 * exactly that cost.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

const COST = 175_000;

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

/** Reach a page through the sidebar navigator, scoped to the nav landmark. */
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

/** `₹1,20,000.00` / `-₹500.00` → number */
function parseInr(text: string): number {
  const negative = text.trim().startsWith("-");
  const n = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Unparseable money string: ${JSON.stringify(text)}`);
  return negative ? -n : n;
}

test.describe("Asset capitalisation", () => {
  test("an asset created with a cost appears on the balance sheet at that cost", async ({ page }) => {
    const assetName = `E2E Capitalised ${Date.now()}`;

    await loginAs(page, "admin@coheron.com");

    // ── Precondition, established through the product ───────────────────────
    // Capitalisation needs 1200 (Fixed Assets) and 2110 (Accounts Payable).
    // `packages/db/src/seed.ts` seeds 21 accounts and the full India list arrives
    // via the screen's own idempotent control, so click it rather than depend on
    // the startup seed-reconciler winning a race.
    await navigateTo(page, "Chart of Accounts", /Chart of Accounts/i, /\/app\/finance\/accounting\/coa/);
    await page.getByRole("button", { name: /Seed India COA/i }).click();
    await expect(page.getByText(/Seeded \d+ accounts successfully/i)).toBeVisible({ timeout: 20_000 });

    // ── The asset account's balance BEFORE ──────────────────────────────────
    await navigateTo(
      page,
      "Balance Sheet",
      /Balance Sheet/i,
      /\/app\/finance\/accounting\/balance-sheet/,
    );
    const assetLine = page.getByTestId("bs-amount-1200");
    // The line may be absent when nothing has ever been capitalised — that is
    // precisely the state this round ends, so treat absence as zero.
    const before = (await assetLine.count())
      ? parseInr(await assetLine.innerText())
      : 0;

    // ── Create an asset with a cost ─────────────────────────────────────────
    await navigateTo(page, "Hardware Assets", /Hardware Assets/i, /\/app\/ham/);
    await page.getByRole("button", { name: /Add Asset/i }).first().click();
    await page.getByPlaceholder("e.g. Dell Latitude 5540").fill(assetName);

    // `assets.create` requires a typeId; the form leaves the select unset, and the
    // list is fetched, so wait for a real option rather than racing it.
    const typeSelect = page.locator("select").first();
    await expect(typeSelect.locator("option").nth(1)).toBeAttached({ timeout: 20_000 });
    await typeSelect.selectOption({ index: 1 });

    // EXACT: the name field's placeholder contains "0", so a substring match puts
    // the cost into the name field instead.
    await page.getByPlaceholder("0", { exact: true }).fill(String(COST));
    await page.getByRole("button", { name: /^Add Asset$/i }).last().click();
    await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 20_000 });

    // ── The balance sheet moved by exactly the cost ──────────────────────────
    await navigateTo(
      page,
      "Balance Sheet",
      /Balance Sheet/i,
      /\/app\/finance\/accounting\/balance-sheet/,
    );
    await expect(assetLine).toBeVisible({ timeout: 20_000 });

    // POLLED, not read once: this is a return visit, so React Query renders the
    // previous visit's cached figure while it refetches. `staleTime: 0` guarantees
    // the refetch happens, not that the stale value is hidden while it does.
    await expect
      .poll(async () => parseInr(await assetLine.innerText()) - before, {
        timeout: 20_000,
        message: "the asset account must rise by the asset's purchase cost",
      })
      .toBeCloseTo(COST, 2);

    // And the sheet still balances with the asset and its payable both on it.
    await expect(page.getByTestId("bs-balance-check")).toHaveAttribute("data-balanced", "true");
  });
});
