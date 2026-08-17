/**
 * ACCEPTANCE — a tenant can register its own GSTIN by clicking, the place of
 * supply is DERIVED from that GSTIN, and doing so is what makes a local sale
 * bill CGST + SGST instead of IGST.
 *
 * The defect this closes: the only way to populate `gstin_registry` was the
 * Setup Wizard, whose "Primary State Code" field asks for a 2-letter ISO
 * 3166-2:IN code (placeholder "MH", default "KA") and wrote that into the GST
 * state column. `normaliseStateToCode("KA")` returns null, so the supplier had
 * no state, `computeGST` compared "" against the buyer's "29", and every sale
 * was billed INTER-state IGST — the right total, the wrong split. A seeded org
 * had no registration at all, so no quotation could be produced either.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

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

test.describe("GST registrations", () => {
  test("registering a GSTIN derives its place of supply and states what was empty before", async ({
    page,
  }) => {
    await loginAs(page, "admin@coheron.com");
    await navigateTo(
      page,
      "GST Registrations",
      /GST Registrations/i,
      /\/app\/finance\/accounting\/gstin/,
    );

    // A tenant with no registration is told what it BREAKS, not just that a
    // table is empty — this is the state every seeded org was in.
    const empty = page.getByTestId("gstin-empty");
    if (await empty.isVisible().catch(() => false)) {
      await expect(empty).toContainText(/inter-state \(IGST\)/i);
    }

    await page.getByTestId("gstin-new").click();
    await expect(page.getByTestId("gstin-form")).toBeVisible({ timeout: 15_000 });

    // ── The derivation is visible as you type ───────────────────────────────
    // A partial GSTIN cannot resolve a state, and the form says so rather than
    // guessing one.
    await page.getByTestId("gstin-input").fill("29ABC");
    await expect(page.getByTestId("gstin-derived-state")).toContainText(
      /no place of supply can be determined/i,
    );
    await expect(page.getByTestId("gstin-save")).toBeDisabled();

    // A complete GSTIN resolves Karnataka from its first two characters — the
    // state is never typed.
    await page.getByTestId("gstin-input").fill("29ABCDE1234F1Z5");
    await expect(page.getByTestId("gstin-derived-state")).toContainText(/Karnataka \(29\)/i);

    await page.getByTestId("gstin-legal-name").fill("CoheronConnect HQ Private Limited");
    await page.getByTestId("gstin-address").fill("12 MG Road, Bengaluru 560001");
    await page.getByTestId("gstin-primary").check();
    await expect(page.getByTestId("gstin-save")).toBeEnabled();
    await page.getByTestId("gstin-save").click();

    // ── It is registered, with the DERIVED state, and marked primary ────────
    const row = page.locator('[data-testid="gstin-row"]', { hasText: "29ABCDE1234F1Z5" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId("gstin-row-state")).toHaveAttribute("data-state", "29");
    await expect(row.getByTestId("gstin-row-state")).toContainText(/Karnataka/i);
    await expect(row).toContainText(/Primary/i);
  });

  test("a GSTIN from another state derives that state, not Karnataka", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await navigateTo(
      page,
      "GST Registrations",
      /GST Registrations/i,
      /\/app\/finance\/accounting\/gstin/,
    );

    await page.getByTestId("gstin-new").click();
    await expect(page.getByTestId("gstin-form")).toBeVisible({ timeout: 15_000 });

    // 27 is Maharashtra. The wizard's placeholder for this was the ISO code
    // "MH", which normalises to null; the GSTIN's "27" does not.
    await page.getByTestId("gstin-input").fill("27AABCU9603R1ZM");
    await expect(page.getByTestId("gstin-derived-state")).toContainText(/Maharashtra \(27\)/i);
    await page.getByTestId("gstin-legal-name").fill("Maharashtra Branch Private Limited");
    await page.getByTestId("gstin-save").click();

    const row = page.locator('[data-testid="gstin-row"]', { hasText: "27AABCU9603R1ZM" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId("gstin-row-state")).toHaveAttribute("data-state", "27");
  });
});
