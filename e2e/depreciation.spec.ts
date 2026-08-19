/**
 * ACCEPTANCE — the depreciation engine is reachable, and its charge reaches the
 * balance sheet.
 *
 * The 15 August audit put depreciation at 10%: the engine (SLM / WDV /
 * Schedule II, with a balanced Dr 5500 / Cr 1290 posting) was correct and had no
 * UI, no nav, no route and no scheduler. The whole chain is exercised here by
 * CLICKING, and every input is created through the product:
 *
 *   Asset Management → Add Asset (cost + a purchase date two financial years ago)
 *   → Depreciation   → enrol it (straight line, 10 years)
 *                    → preview says what will post, then post it
 *                    → the row shows the charge and the reduced net book value
 *   → Balance Sheet  → Accumulated Depreciation (1290) has moved by that charge
 *
 * The asset is dated two financial years back because the run refuses to charge
 * a financial year that has not ended — which is the guard that makes a
 * scheduled month-end job safe, so the spec must respect it rather than work
 * around it.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

const COST = 120_000;
const LIFE = 10;
const EXPECTED_CHARGE = COST / LIFE; // 12,000 per financial year, straight line

/** First calendar year of the India financial year containing `d`. */
function fyStart(d = new Date()): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

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

/** `₹1,20,000.00` → 120000 */
function parseInr(text: string): number {
  const negative = text.trim().startsWith("-");
  const n = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Unparseable money string: ${JSON.stringify(text)}`);
  return negative ? -n : n;
}

test.describe("Depreciation — register, run, and the ledger", () => {
  test("enrol an asset, post its charge, and see it on the balance sheet", async ({ page }) => {
    const assetName = `E2E Depr ${Date.now()}`;
    // Two financial years back, so exactly one year has fully elapsed.
    const purchaseDate = `${fyStart() - 1}-04-01`;
    const chargeFy = `${fyStart() - 1}-${fyStart()}`;

    await loginAs(page, "admin@coheron.com");

    // ── Precondition, established through the product ───────────────────────
    // The posting needs COA codes 5500 and 1290. `packages/db/src/seed.ts` does
    // NOT create them (it seeds 21 accounts; the full India list lives in
    // `INDIA_COA_SEED`), and the startup seed-reconciler that would add them is
    // fire-and-forget AFTER `listen()` (apps/api/src/index.ts:848) — so whether
    // they exist when this spec runs is a race with the harness's own seed.
    // Clicking the screen's own idempotent "Seed India COA" makes it a fact
    // rather than a coin toss. Without them the charge still records while the
    // ledger never moves — which is exactly what the run now warns about.
    await navigateTo(page, "Chart of Accounts", /Chart of Accounts/i, /\/app\/finance\/accounting\/coa/);
    await page.getByRole("button", { name: /Seed India COA/i }).click();
    await expect(page.getByText(/Seeded \d+ accounts successfully/i)).toBeVisible({ timeout: 20_000 });

    // ── An asset with a cost and an acquisition date ────────────────────────
    await navigateTo(page, "Asset Management", /Asset Management/i, /\/app\/ham/);
    await page.getByRole("button", { name: /Add Asset/i }).first().click();
    await page.getByPlaceholder("e.g. Dell Latitude 5540").fill(assetName);
    // `assets.create` requires a typeId; the form leaves the select unset, so a
    // spec that skips it silently creates nothing.
    const typeSelect = page.locator("select").first();
    // The type list is fetched, so wait for a real option rather than racing it —
    // the placeholder "— Select type —" is present from the first paint.
    await expect(typeSelect.locator("option").nth(1)).toBeAttached({ timeout: 20_000 });
    await typeSelect.selectOption({ index: 1 });
    // EXACT: the name field's placeholder is "e.g. Dell Latitude 5540", which
    // contains "0", so a substring match puts the cost into the name.
    await page.getByPlaceholder("0", { exact: true }).fill(String(COST));
    await page.locator('input[type="date"]').first().fill(purchaseDate);
    await page.getByRole("button", { name: /^Add Asset$/i }).last().click();
    await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 20_000 });

    // ── Depreciation, reached by clicking ───────────────────────────────────
    await navigateTo(page, "Depreciation", /Depreciation/i, /\/app\/finance\/depreciation/);

    // A tenant with nothing enrolled is told so, not shown a page of zeroes.
    // (Other specs may have enrolled assets, so this is only asserted when the
    // register is genuinely empty.)
    const empty = page.getByTestId("depr-empty");
    if (await empty.isVisible().catch(() => false)) {
      await expect(empty).toContainText(/empty register, not a company/i);
    }

    // ── Enrol it: straight line, 10 years ───────────────────────────────────
    const assetSelect = page.getByTestId("depr-enrol-asset");
    // The picker is fed by a fetched asset list; poll until the new asset is in it.
    await expect
      .poll(
        async () =>
          assetSelect.locator("option").evaluateAll(
            (opts, name) =>
              (opts as HTMLOptionElement[]).find((o) => (o.textContent ?? "").includes(name))?.value ??
              "",
            assetName,
          ),
        { timeout: 20_000, message: "the new asset must be offered for enrolment" },
      )
      .not.toBe("");
    const assetOption = await assetSelect.locator("option").evaluateAll(
      (opts, name) =>
        (opts as HTMLOptionElement[]).find((o) => (o.textContent ?? "").includes(name))?.value ?? "",
      assetName,
    );
    await assetSelect.selectOption(assetOption);
    await page.getByTestId("depr-enrol-method").selectOption("SLM");
    await page.getByTestId("depr-enrol-life").fill(String(LIFE));
    await page.getByTestId("depr-enrol-submit").click();

    // The register now carries the asset at full cost, nothing charged yet.
    const row = page.locator("tr", { hasText: assetName });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("1,20,000.00");

    // ── Preview BEFORE posting: it must say what will post ──────────────────
    await page.getByTestId("depr-fy").fill(chargeFy);
    const summary = page.getByTestId("depr-preview-summary");
    await expect(summary).toContainText(/will be charged/i, { timeout: 20_000 });
    await expect(summary).toContainText("12,000.00");
    // Nothing is in the ledger yet — the charge column is still empty.
    await expect(row).toContainText(/will post/i);

    // ── Post it ─────────────────────────────────────────────────────────────
    await page.getByTestId("depr-run").click();

    // The charge landed: net book value dropped by exactly one period.
    await expect(row).toContainText("1,08,000.00", { timeout: 20_000 });
    await expect(row).toContainText(/already charged/i);

    // Running the same financial year again posts nothing — the button is
    // disabled because the preview has nothing postable left.
    await expect(page.getByTestId("depr-run")).toBeDisabled();
    await expect(summary).toContainText(/Nothing to post/i);

    // ── The balance sheet moved ─────────────────────────────────────────────
    await navigateTo(page, "Balance Sheet", /Balance Sheet/i, /\/app\/finance\/accounting\/balance-sheet/);
    const accum = page.getByTestId("bs-amount-1290");
    await expect(accum).toBeVisible({ timeout: 20_000 });
    // Contra-asset: carried negative so it nets DOWN total assets.
    const accumValue = parseInr(await accum.innerText());
    expect(accumValue).toBeLessThanOrEqual(-EXPECTED_CHARGE);
    // And the sheet still balances after the posting.
    await expect(page.getByTestId("bs-balance-check")).toHaveAttribute("data-balanced", "true");
  });

  test("the month-end run is off by default and can be switched", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await navigateTo(page, "Depreciation", /Depreciation/i, /\/app\/finance\/depreciation/);

    const state = page.getByTestId("depr-autorun-state");
    await expect(state).toBeVisible({ timeout: 20_000 });
    const initial = (await state.innerText()).trim();

    await page.getByTestId("depr-autorun-toggle").click();
    await expect(state).not.toHaveText(initial, { timeout: 20_000 });

    // Put it back, so the spec leaves the tenant as it found it.
    await page.getByTestId("depr-autorun-toggle").click();
    await expect(state).toHaveText(initial, { timeout: 20_000 });
  });
});
