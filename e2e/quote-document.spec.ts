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
  await page.getByRole("button", { name: tab, exact: true }).first().click();
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
    await page.getByTestId("quote-deal").selectOption(await dealOption());

    await fillTwoLines(page);
    // The place of supply resolved, so no "state missing" warning is shown.
    await expect(page.getByTestId("quote-pos")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quote-create")).toBeEnabled();
    await page.getByTestId("quote-create").click();
    await expect(quoteDialog).toBeHidden({ timeout: 20_000 });

    // ── Download it, and read what the document actually says ───────────────
    // The card's actions live behind `isExpanded` — click the card to open it.
    await page.getByTestId("quote-number").first().click();
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
    await gotoCrmTab(page, "Quotes");

    // A quote with no deal selected has no account, so no buyer state — the
    // stored split would silently take the SELLER's state and bill CGST/SGST on
    // an unverified basis. The document must not exist in that condition.
    await page.getByRole("button", { name: /New Quote/i }).first().click();
    const quoteDialog = page.getByTestId("new-quote-dialog");
    await expect(quoteDialog).toBeVisible({ timeout: 15_000 });
    await fillTwoLines(page);
    await expect(page.getByTestId("quote-create")).toBeEnabled();
    await page.getByTestId("quote-create").click();
    await expect(quoteDialog).toBeHidden({ timeout: 20_000 });

    // The newest quote card is the one just made; expand it, then its Download
    // must refuse.
    await page.getByTestId("quote-number").first().click();
    await page.getByRole("button", { name: /Download PDF/i }).first().click();

    // Refused with the reason and the field to fix — not a silent failure, and
    // not a PDF with a guessed tax basis on it.
    await expect(
      page.getByText(/not linked to a customer account|has no state on file/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
