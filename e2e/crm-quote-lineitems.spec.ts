/**
 * ACCEPTANCE — the CRM quote line-item editor, end to end by clicking (Round 11).
 *
 * What this proves that unit tests cannot: the PRODUCT can now produce a quote
 * with a correct non-zero total and tax split. The engine could always do the
 * arithmetic; the New Quote dialog sent one hardcoded line worth zero, so every
 * quote a salesperson could create totalled ₹0 while looking finished.
 *
 * It also proves the refusal: a quote with no value cannot be created from the UI.
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

async function gotoCrmTab(page: Page, tab: string) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill("CRM");
  await page.getByRole("link", { name: /CRM & Sales/i }).first().click();
  await page.waitForURL(/\/app\/crm/, { timeout: 20_000 });
  /*
   * The CRM tab strip collapsed from eight tabs to five. Contacts folded into
   * Accounts and Quotes into Pipeline, each as a SUB-VIEW behind its parent tab,
   * so reaching them is now two clicks rather than one. The content, and every
   * assertion below, is unchanged — only the route to it moved.
   */
  const MERGED: Record<string, { parent: string; view: string }> = {
    Quotes: { parent: "Pipeline", view: "crm-subview-quotes" },
    Contacts: { parent: "Accounts", view: "crm-subview-contacts" },
  };
  const merged = MERGED[tab];
  if (merged) {
    await page.getByRole("button", { name: merged.parent, exact: true }).first().click();
    await page.getByTestId(merged.view).click();
  } else {
    await page.getByRole("button", { name: tab, exact: true }).first().click();
  }
  await page.waitForLoadState("networkidle");
}

/** Read the raw number a totals cell carries, not its rupee formatting. */
async function rawValue(page: Page, testid: string): Promise<number> {
  const el = page.getByTestId(testid).first();
  await expect(el).toBeVisible({ timeout: 15_000 });
  return Number((await el.getAttribute("data-value")) ?? "NaN");
}

test.describe("CRM quote line items", () => {
  test("two lines at different GST rates produce a correct non-zero total; a zero quote is refused", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await gotoCrmTab(page, "Quotes");

    await page.getByRole("button", { name: /New Quote/i }).first().click();
    const dialog = page.getByTestId("new-quote-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // ── An empty quote is refused before anything is typed ──────────────────
    // One blank line at ₹0 — exactly what the old dialog used to SEND.
    await expect(page.getByTestId("quote-zero-warning")).toBeVisible();
    await expect(page.getByTestId("quote-create")).toBeDisabled();

    // ── Line 1 — ₹20,000 at 18% ─────────────────────────────────────────────
    const line = (i: number) => page.getByTestId("quote-line").nth(i);
    await line(0).getByTestId("quote-line-description").fill("Enterprise licence");
    await line(0).getByTestId("quote-line-qty").fill("2");
    await line(0).getByTestId("quote-line-price").fill("10000");
    await line(0).getByTestId("quote-line-gst").selectOption("18");

    // The line total is computed, never typed.
    await expect(line(0).getByTestId("quote-line-total")).toHaveAttribute("data-value", "20000");

    // ── Line 2 — ₹5,000 at 5% ───────────────────────────────────────────────
    await page.getByTestId("quote-add-line").click();
    await expect(page.getByTestId("quote-line")).toHaveCount(2);
    await line(1).getByTestId("quote-line-description").fill("Onboarding training");
    await line(1).getByTestId("quote-line-qty").fill("1");
    await line(1).getByTestId("quote-line-price").fill("5000");
    await line(1).getByTestId("quote-line-gst").selectOption("5");
    await expect(line(1).getByTestId("quote-line-total")).toHaveAttribute("data-value", "5000");

    // ── Totals, computed by the SERVER ──────────────────────────────────────
    // Subtotal 25,000. Tax: 20,000@18% = 3,600 and 5,000@5% = 250 → 3,850.
    // Total 28,850. The split depends on the seeded org's own GSTIN state, so
    // assert the SPLIT SHAPE rather than assuming intra- or inter-state.
    await expect
      .poll(() => rawValue(page, "quote-subtotal"), { timeout: 20_000 })
      .toBe(25000);
    expect(await rawValue(page, "quote-taxable")).toBe(25000);

    const taxTotal = await rawValue(page, "quote-tax-total");
    expect(taxTotal).toBe(3850);

    const grand = await rawValue(page, "quote-grand-total");
    expect(grand).toBe(28850);
    // Non-zero is the headline: every quote this dialog produced used to be ₹0.
    expect(grand).toBeGreaterThan(0);

    // Exactly one split is charged, and it accounts for the whole tax.
    const igstVisible = await page.getByTestId("quote-igst").count();
    if (igstVisible > 0) {
      expect(await rawValue(page, "quote-igst")).toBe(3850);
      await expect(page.getByTestId("quote-pos")).toContainText(/Inter-state/i);
    } else {
      const cgst = await rawValue(page, "quote-cgst");
      const sgst = await rawValue(page, "quote-sgst");
      expect(cgst).toBe(1925);
      expect(sgst).toBe(1925);
      expect(cgst + sgst).toBe(taxTotal);
    }

    // The place of supply is stated one way or the other — either the resolved
    // state, or a prominent warning that the account has none.
    const posShown = (await page.getByTestId("quote-pos").count()) + (await page.getByTestId("quote-pos-warning").count());
    expect(posShown).toBeGreaterThan(0);

    /*
     * A deal is now REQUIRED before a quote can be created — `quotes.create`
     * rejects a dealless quote, because a quote reaches its buyer only via
     * quote -> deal -> account. This spec never picked one, so Create stayed
     * disabled on the new gate.
     *
     * This is SETUP catching up with a contract change, not a weakened
     * assertion: every total asserted below is unchanged, and the intra/inter
     * branch already handles whichever state the chosen deal's account carries.
     */
    const firstDeal = await page.getByTestId("quote-deal").locator("option").evaluateAll(
      (opts) => (opts as HTMLOptionElement[]).find((o) => o.value !== "")?.value ?? "",
    );
    expect(firstDeal, "the org needs at least one deal to quote against").not.toBe("");
    await page.getByTestId("quote-deal").selectOption(firstDeal);

    // ── Create it ───────────────────────────────────────────────────────────
    await expect(page.getByTestId("quote-create")).toBeEnabled();
    await page.getByTestId("quote-create").click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // The stored quote carries the same total the editor showed.
    const cardTotals = page.getByTestId("quote-card-total");
    await expect(cardTotals.first()).toBeVisible({ timeout: 20_000 });
    const stored = await cardTotals.evaluateAll((els) =>
      (els as HTMLElement[]).map((e) => Number(e.dataset["value"] ?? 0)),
    );
    expect(stored).toContain(28850);

    // ── A zero-value quote is refused ───────────────────────────────────────
    await page.getByRole("button", { name: /New Quote/i }).first().click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // A described line with no price is still worth nothing — description alone
    // used to be enough to create a quote.
    await line(0).getByTestId("quote-line-description").fill("Something free");
    await expect(page.getByTestId("quote-zero-warning")).toBeVisible();
    await expect(page.getByTestId("quote-create")).toBeDisabled();
    await expect
      .poll(() => rawValue(page, "quote-grand-total"), { timeout: 20_000 })
      .toBe(0);
  });
});
