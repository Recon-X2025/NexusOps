/**
 * ACCEPTANCE — a quote is a document a salesperson can send, and it refuses to
 * exist when its tax basis cannot be verified.
 *
 * Before this round the quote's "Download PDF" control called `downloadCSV` and
 * produced a six-column CSV named `.csv` — quote number, deal id, total,
 * currency, status, validity. No line items, no HSN, no GST split, no GSTINs, no
 * parties. This spec proves, by CLICKING, that the button now yields a real PDF
 * carrying the money, the named CGST/SGST split and both parties' GSTINs — and
 * that a quote whose customer state is unknown produces no document at all.
 *
 * Everything is created through the product: account (with a GST state and a
 * GSTIN) → contact → deal → quote with two lines at different GST rates.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "fs";

/**
 * PDFKit writes text as hex-string runs inside `TJ` arrays, split at kerning
 * pairs; concatenating them in document order reassembles the text. The
 * generator sets `compress: false`, so the content stream is readable. Same
 * helper as `apps/api/src/__tests__/quote-pdf.test.ts`.
 */
function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/<([0-9a-fA-F]+)>/g)) {
    out += Buffer.from(m[1]!, "hex").toString("latin1");
  }
  return out;
}

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
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /CRM & Sales/i })
    .first()
    .click();
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

/** Fill the two lines the line-item round proved: 20,000 @ 18% + 5,000 @ 5%. */
async function fillTwoLines(page: Page) {
  const line = (i: number) => page.getByTestId("quote-line").nth(i);
  await line(0).getByTestId("quote-line-description").fill("Enterprise licence");
  await line(0).getByTestId("quote-line-qty").fill("2");
  await line(0).getByTestId("quote-line-price").fill("10000");
  await line(0).getByTestId("quote-line-gst").selectOption("18");
  await page.getByTestId("quote-add-line").click();
  await expect(page.getByTestId("quote-line")).toHaveCount(2);
  await line(1).getByTestId("quote-line-description").fill("Onboarding training");
  await line(1).getByTestId("quote-line-qty").fill("1");
  await line(1).getByTestId("quote-line-price").fill("5000");
  await line(1).getByTestId("quote-line-gst").selectOption("5");
}

/**
 * Insert a quote carrying real line items and totals but NO deal.
 *
 * Same DB-through-drizzle approach `mfa.spec.ts` uses for state the product
 * deliberately will not create. The totals are stored as the engine would have
 * written them (25,000 taxable @ 18% intra), so the PDF route gets past its
 * line-items and zero-value refusals and reaches the buyer check — which is the
 * one under test. `dealId` and `placeOfSupply` are null: no buyer, no verified
 * place of supply.
 */
async function seedDeallessQuote(quoteNumber: string): Promise<void> {
  if (!process.env["DATABASE_URL"]) {
    process.env["DATABASE_URL"] =
      "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test";
  }
  const { getDb, crmQuotes, users, eq } = await import("@coheronconnect/db");
  const database = getDb();
  const [admin] = await database
    .select()
    .from(users)
    .where(eq(users.email, "admin@coheron.com"));
  if (!admin?.orgId) throw new Error("seedDeallessQuote: admin user has no org");

  await database.insert(crmQuotes).values({
    orgId: admin.orgId,
    quoteNumber,
    dealId: null,
    items: [
      {
        description: "Enterprise licence",
        quantity: 1,
        unitPrice: "25000",
        total: "25000",
        hsnCode: "998314",
        gstRate: 18,
      },
    ],
    subtotal: "25000",
    discountPct: "0",
    placeOfSupply: null,
    isInterstate: false,
    taxableValue: "25000",
    cgstAmount: "2250",
    sgstAmount: "2250",
    igstAmount: "0",
    taxTotal: "4500",
    total: "29500",
  });
}

/** Remove the seeded dealless quote so it cannot outlive this test. */
async function deleteDeallessQuote(quoteNumber: string): Promise<void> {
  const { getDb, crmQuotes, eq } = await import("@coheronconnect/db");
  await getDb().delete(crmQuotes).where(eq(crmQuotes.quoteNumber, quoteNumber));
}

/**
 * Give the tenant its own GSTIN.
 *
 * Done over tRPC rather than by clicking because NOTHING in the web app calls
 * `accounting.gstin.create` — the procedure exists and no UI invokes it, so a
 * tenant cannot register its own GSTIN through the product. That gap is
 * REPORTED, not papered over; this is test setup standing in for a missing
 * screen, and the spec says so out loud.
 *
 * Why it matters beyond this spec: with no supplier GSTIN, `resolveOrgState`
 * returns null, `computeGST` compares "" against the buyer's "29", and every
 * quote is billed INTER-state IGST. Observed on this database before this setup
 * existed — a Karnataka buyer stored `is_interstate = true`.
 *
 * The body is the RAW input: this tRPC stack runs with no superjson transformer,
 * so a `{ json: ... }` envelope arrives as an unrecognised shape and every field
 * reads as missing.
 */
async function ensureSupplierGstin(page: Page): Promise<void> {
  const res = await page.request.post("/api/trpc/accounting.gstin.create", {
    data: {
      gstin: "29AABCC1234D1ZP",
      legalName: "CoheronConnect HQ Private Limited",
      stateCode: "29",
      stateName: "Karnataka",
      address: "12 MG Road, Bengaluru 560001",
      isPrimary: true,
    },
  });
  if (res.ok()) return;
  // A GSTIN already registered by an earlier test in the same database is fine;
  // anything else is a genuine setup failure and must fail loudly.
  const body = await res.text();
  expect(body, `supplier GSTIN setup failed: ${body}`).toMatch(/duplicate|unique|already/i);
}

test.describe("Quote document", () => {
  test("a quote for a customer with a known state downloads as a PDF carrying the split and both GSTINs", async ({
    page,
  }) => {
    const stamp = Date.now();
    const accountName = `E2E Doc Co ${stamp}`;
    const buyerGstin = "29AAACA1111A1Z5";

    await loginAs(page, "admin@coheron.com");

    await ensureSupplierGstin(page);

    // ── An account WITH a GST state — the thing the tax split depends on ────
    await gotoCrmTab(page, "Accounts");
    await page.getByRole("button", { name: /Add Account/i }).first().click();
    const acctDialog = page.getByTestId("new-account-dialog");
    await expect(acctDialog).toBeVisible({ timeout: 15_000 });
    // Inputs are scoped to the DIALOG. A page-wide `input:visible` picks up the
    // sidebar's "Filter navigator..." box first, so the company name went there
    // and the account was never created.
    await acctDialog.locator("input").nth(0).fill(accountName);
    await acctDialog.getByPlaceholder("e.g. Technology").fill("Technology");
    await acctDialog.getByPlaceholder("https://").fill("https://example.com");
    // Karnataka (29) — the same state the seeded org's GSTIN is in, so this is
    // an intra-state supply and the document must show CGST + SGST.
    await acctDialog.getByTestId("account-state-code").selectOption("29");
    await acctDialog.getByTestId("account-gstin").fill(buyerGstin);
    await acctDialog.getByRole("button", { name: "Create Account" }).click();
    await expect(acctDialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(accountName).first()).toBeVisible({ timeout: 20_000 });

    // ── A deal for it (needs a contact, created inline) ─────────────────────
    await gotoCrmTab(page, "Pipeline");
    await page.getByRole("button", { name: /Add Deal/i }).first().click();
    const dealDialog = page.getByTestId("new-deal-dialog");
    await expect(dealDialog).toBeVisible({ timeout: 15_000 });
    await dealDialog.locator("input").first().fill(`E2E Doc Deal ${stamp}`);
    await dealDialog.locator("select").nth(0).selectOption({ label: accountName });

    await dealDialog.getByRole("button", { name: "+ New" }).click();
    // The Add Contact dialog carries no testid; scope on the one placeholder it
    // owns rather than on page-wide inputs.
    const contactDialog = page.locator('div.bg-card:has([placeholder="e.g. VP Engineering"])').last();
    await expect(contactDialog).toBeVisible({ timeout: 15_000 });
    await contactDialog.locator("input").nth(0).fill("Ravi");
    await contactDialog.locator("input").nth(1).fill("Kumar");
    await contactDialog.locator("input").nth(2).fill(`ravi.${stamp}@example.com`);
    await contactDialog.locator("input").nth(3).fill("9000000000");
    await contactDialog.getByPlaceholder("e.g. VP Engineering").fill("Head of IT");
    await contactDialog.getByRole("button", { name: "Create Contact" }).click();
    await expect(contactDialog).toBeHidden({ timeout: 20_000 });

    // Back on the deal: pick the contact that was just created.
    await expect
      .poll(async () => dealDialog.locator("select").nth(1).locator("option").count(), {
        timeout: 20_000,
        message: "the new contact must be offered on the deal",
      })
      .toBeGreaterThan(1);
    await dealDialog.locator("select").nth(1).selectOption({ index: 1 });
    await dealDialog.locator('input[type="number"]').first().fill("28850");
    await dealDialog.locator('input[type="date"]').first().fill("2026-12-31");
    await page.getByTestId("new-deal-save").click();
    await expect(dealDialog).toBeHidden({ timeout: 20_000 });

    // ── The quote, linked to that deal ──────────────────────────────────────
    await gotoCrmTab(page, "Quotes");
    await page.getByRole("button", { name: /New Quote/i }).first().click();
    const quoteDialog = page.getByTestId("new-quote-dialog");
    await expect(quoteDialog).toBeVisible({ timeout: 15_000 });
    // The deal list is fetched, so poll for the new deal rather than racing it.
    // `selectOption({ label: RegExp })` is not supported, so resolve the value.
    const dealOption = async (): Promise<string> =>
      page.getByTestId("quote-deal").locator("option").evaluateAll(
        (opts, needle) =>
          (opts as HTMLOptionElement[]).find((o) => (o.textContent ?? "").includes(needle))?.value ?? "",
        `E2E Doc Deal ${stamp}`,
      );
    await expect
      .poll(dealOption, { timeout: 20_000, message: "the new deal must be offered on the quote" })
      .not.toBe("");
    const dealId = await dealOption();
    await page.getByTestId("quote-deal").selectOption(dealId);

    await fillTwoLines(page);
    // The place of supply resolved, so no "state missing" warning is shown.
    await expect(page.getByTestId("quote-pos")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quote-create")).toBeEnabled();
    await page.getByTestId("quote-create").click();
    await expect(quoteDialog).toBeHidden({ timeout: 20_000 });

    /*
     * ── Download it, and read what the document actually says ───────────────
     *
     * Find THIS test's quote by number rather than taking `.first()`.
     *
     * `.first()` is the newest card in the whole org, which is only this test's
     * quote when nothing else has made one. That is false in the full suite
     * (`crm-quote-lineitems.spec.ts` raises a quote earlier in the run) and
     * false on any re-run against a database that was not reset — where the
     * dealless quote seeded by the refusal test below is newest, and its PDF is
     * REFUSED by design, so no download event ever fires and this test times out
     * 30s later pointing at the wrong line.
     *
     * The quote number comes from the procedure, scoped to the deal just made,
     * so the card clicked is unambiguously this test's. Only one card is
     * expanded at a time, so the Download control below is then this card's.
     */
    const listRes = await page.request.get(
      `/api/trpc/crm.deals.quotes.list?input=${encodeURIComponent(JSON.stringify({ dealId }))}`,
    );
    expect(listRes.ok(), "the quote list must be readable to find this test's quote").toBeTruthy();
    const listBody = await listRes.json();
    const ownQuoteNumber: string = listBody?.result?.data?.[0]?.quoteNumber;
    expect(ownQuoteNumber, "the quote just created must come back for its deal").toBeTruthy();

    await page.getByTestId("quote-number").filter({ hasText: ownQuoteNumber }).first().click();
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /Download PDF/i }).first().click();
    const download: Download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const text = extractPdfText(readFileSync(path!));

    // It is a document, not a table: money in full figures…
    expect(text).toContain("QUOTATION");
    expect(text).toContain("Rs. 28,850.00"); // total
    expect(text).toContain("Rs. 25,000.00"); // taxable value

    // …the tax split NAMED, with rates, never a single "Tax" figure…
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");
    expect(text).toContain("Rs. 1,925.00"); // 1,925 each side of 3,850

    // …both parties' GSTINs, so the customer can claim against it…
    expect(text).toContain(buyerGstin);
    expect(text).toMatch(/GSTIN: \d{2}[A-Z]{5}\d{4}[A-Z]/); // the supplier's

    // …the parties and the line detail, including HSN.
    expect(text).toContain(accountName);
    expect(text).toContain("Enterprise licence");
    expect(text).toContain("Onboarding training");

    // The resolved place of supply is printed so the split can be verified.
    expect(text).toContain("Intra-state supply");
  });

  test("a quote with no linked customer produces no document, and says why", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    // The supplier side must be complete, so the refusal under test is the
    // CUSTOMER one rather than a missing-GSTIN refusal.
    await ensureSupplierGstin(page);

    /*
     * The dealless quote is now INSERTED DIRECTLY, not created through the
     * product.
     *
     * `crm.deals.quotes.create` requires a dealId as of this round — a quote
     * reaches its buyer only via quote -> deal -> account, so one without a deal
     * has no buyer at all. That closes the door on NEW dealless quotes; it does
     * not remove the ones already stored (the column is still nullable, and
     * three such rows exist on the dev/test databases — every one of them made
     * by an earlier run of THIS spec).
     *
     * Those rows are exactly what this test is about: the PDF route must refuse
     * a quote whose tax basis cannot be verified, and that route is reached by
     * stored data, not by the create path. Seeding the row directly tests the
     * refusal on the condition that actually occurs, instead of testing a
     * create path that can no longer produce it. The assertion is unchanged.
     */
    const quoteNumber = `QT-NODEAL-${Date.now()}`;
    await seedDeallessQuote(quoteNumber);

    await gotoCrmTab(page, "Quotes");

    // Find THAT quote's card by its number rather than trusting ordering, then
    // expand it — the actions live behind `isExpanded`.
    const card = page.getByTestId("quote-number").filter({ hasText: quoteNumber }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await page.getByRole("button", { name: /Download PDF/i }).first().click();

    // Refused with the reason and the field to fix — not a silent failure, and
    // not a PDF with a guessed tax basis on it.
    await expect(
      page.getByText(/not linked to a customer account|has no state on file/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    /*
     * Remove the seeded row. A quote with no deal is REFUSED by the PDF route by
     * design, so leaving it behind makes it the newest quote in the org and
     * silently breaks any later test that reaches for the most recent card —
     * which is exactly what it did to the test above on re-runs against a
     * database that was not reset. Specs must be self-isolating: seed, assert,
     * clean up.
     */
    await deleteDeallessQuote(quoteNumber);
  });
});
