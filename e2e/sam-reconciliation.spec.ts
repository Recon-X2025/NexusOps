/**
 * ACCEPTANCE — SAM installed-vs-entitled reconciliation is reachable, and the
 * variance it shows is real.
 *
 * The 15 August audit put SAM at 50%: the reconciliation engine
 * (`assets.licenses.reconcile`, correct since G11) had no UI at all, and the
 * Compliance tab rendered the licence table with seven columns bound to fields
 * `assets.licenses.list` has never returned.
 *
 * The whole chain is exercised by CLICKING, and both inputs are created through
 * the product — there is no fixture and no direct API call:
 *
 *   Software Assets → Add License (10 seats)
 *   → Compliance Position → Record installed count (17)
 *   → the row reports a +7 variance, the position reads "over-deployed",
 *     and the page-level banner names the licence.
 *
 * 17 against 10 is chosen so the variance cannot coincide with either input —
 * a screen echoing the entitlement or the install count back would fail.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

const SEATS = 10;
const INSTALLS = 17;
const EXPECTED_VARIANCE = INSTALLS - SEATS; // 7

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

test.describe("SAM — installed vs entitled reconciliation", () => {
  test("record an installed count above the seat count and see the over-deployment", async ({ page }) => {
    // Unique per run: the E2E database is shared and this spec re-runs.
    const product = `E2E Recon ${Date.now()}`;

    await loginAs(page, "admin@coheron.com");

    // ── Software Assets, by clicking ────────────────────────────────────────
    await navigateTo(page, "Software Assets", /Software Assets/i, /\/app\/sam/);

    // ── A licence with a known entitlement ──────────────────────────────────
    await page.getByRole("button", { name: /Add License/i }).click();
    await page.getByPlaceholder("e.g. Microsoft 365, Figma").fill(product);
    await page.getByPlaceholder("e.g. 50").fill(String(SEATS));
    await page.getByRole("button", { name: /^Add License$/i }).last().click();

    // ── Compliance Position — the reconciliation view ───────────────────────
    await page.getByRole("button", { name: /Compliance Position/i }).click();
    const recon = page.getByTestId("sam-reconciliation");
    await expect(recon).toBeVisible({ timeout: 20_000 });

    // Before any install count is recorded the posture must be UNKNOWN, not
    // compliant — "no data" and "in compliance" are different claims.
    const row = page.getByTestId(`sam-recon-row-${product}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("not reconciled");
    await expect(page.getByTestId(`sam-variance-${product}`)).toHaveText("—");

    // ── Record the installed count ──────────────────────────────────────────
    await page.getByTestId(`sam-record-${product}`).click();
    await page.getByTestId("sam-installed-input").fill(String(INSTALLS));
    await page.getByTestId("sam-installed-save").click();

    // ── The variance is real ────────────────────────────────────────────────
    await expect(page.getByTestId(`sam-variance-${product}`)).toHaveText(
      `+${EXPECTED_VARIANCE}`,
      { timeout: 20_000 },
    );
    await expect(row).toContainText("over-deployed");
    // Entitled and installed are both shown, and are the numbers we entered.
    await expect(row).toContainText(String(SEATS));
    await expect(row).toContainText(String(INSTALLS));

    // The page-level banner names the licence and the shortfall.
    const banner = page.getByTestId("sam-overdeployed-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(product);
    await expect(banner).toContainText(`+${EXPECTED_VARIANCE}`);
  });

  test("Sync Discovery is disabled and says why", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await navigateTo(page, "Software Assets", /Software Assets/i, /\/app\/sam/);

    const sync = page.getByRole("button", { name: /Sync Discovery/i });
    await expect(sync).toBeVisible();
    await expect(sync).toBeDisabled();
    await expect(sync).toHaveAttribute("title", /not connected/i);
  });
});
