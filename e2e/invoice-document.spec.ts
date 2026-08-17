/**
 * ACCEPTANCE — a receivable invoice can be downloaded as a statutory tax
 * invoice, and a defective one cannot be issued at all.
 *
 * Before this round the invoice detail page offered only `window.print()`, which
 * prints the SCREEN — sidebar, nav and buttons — because there is no print
 * stylesheet. There was no invoice PDF anywhere in the codebase.
 *
 * Generate, do not file: this asserts the DOCUMENT. The IRN round-trip belongs
 * to the existing `coheronconnect-irn-generation` BullMQ pipeline
 * (`startIrnWorker` → `clearTaxGstAdapter` → ClearTax), which this spec does not
 * touch; the document prints whatever that pipeline stored.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "fs";

/** PDFKit writes hex-string runs inside `TJ`; concatenating them rebuilds the text. */
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

/**
 * Setup over tRPC rather than by clicking.
 *
 * The AR invoice form carries no test ids, so driving it would mean positional
 * selectors over a dialog that is not addressable — brittle in a way that would
 * fail for reasons unrelated to the document. What this spec is FOR is the
 * document: that the control exists on the invoice, produces a real PDF, and
 * that the PDF carries the Rule 46 particulars. Those are all exercised by
 * clicking below. The body is the raw input — this tRPC stack has no superjson
 * transformer, so a `{ json: ... }` envelope reads as every field missing.
 */
async function trpcPost(page: Page, path: string, data: unknown): Promise<any> {
  const res = await page.request.post(`/api/trpc/${path}`, { data });
  const body = await res.text();
  expect(res.ok(), `${path} failed: ${body}`).toBeTruthy();
  return JSON.parse(body)?.result?.data ?? null;
}

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
  const body = await res.text();
  expect(body, `supplier GSTIN setup failed: ${body}`).toMatch(/duplicate|unique|already/i);
}

/**
 * Reach a Financial tab by clicking. The page defaults to the FIRST permitted
 * tab (IT Budget), so the invoice lists are not on screen until the tab is
 * selected — a spec that skipped this looked for a row that was never rendered.
 * Receivables and payables are separate tabs.
 */
async function gotoFinancialTab(page: Page, tabLabel: string): Promise<void> {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill("Financial");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /Financial Management/i })
    .first()
    .click();
  await page.waitForURL(/\/app\/financial/, { timeout: 20_000 });
  await page.getByRole("button", { name: tabLabel, exact: true }).first().click();
  await page.waitForLoadState("networkidle");
}

test.describe("Tax invoice document", () => {
  test("a receivable with line items downloads as a tax invoice carrying Rule 46 particulars", async ({
    page,
  }) => {
    const stamp = Date.now();
    const invoiceNumber = `INV-E2E-${stamp}`;
    const customerName = `E2E Customer ${stamp}`;

    await loginAs(page, "admin@coheron.com");
    await ensureSupplierGstin(page);

    // A customer in Karnataka (29) — same state as the supplier, so the split
    // must come out CGST + SGST rather than IGST.
    const vendor = await trpcPost(page, "vendors.create", {
      name: customerName,
      gstin: "29AAACA1111A1Z5",
      state: "29",
      address: "9 Nehru Nagar, Bengaluru 560002",
    });
    expect(vendor?.id).toBeTruthy();

    // 20,000 @ 18% + 5,000 @ 5% = 25,000 taxable, 3,850 tax, 28,850 total.
    await trpcPost(page, "financial.createReceivableInvoice", {
      customerVendorId: vendor.id,
      invoiceNumber,
      amount: "25000",
      gstRate: 18,
      lines: [
        { description: "Implementation services", taxableValue: 20000, gstRate: 18, hsnSacCode: "998313", quantity: 1, unit: "NOS", unitPrice: 20000 },
        { description: "Annual support", taxableValue: 5000, gstRate: 5, hsnSacCode: "998314", quantity: 1, unit: "NOS", unitPrice: 5000 },
      ],
    });

    // ── Reach the invoice by CLICKING ───────────────────────────────────────
    await gotoFinancialTab(page, "Accounts Receivable");

    const row = page.locator("tr", { hasText: invoiceNumber });
    await expect(row).toBeVisible({ timeout: 20_000 });
    // Receivable rows carry a Details action; the row itself is not clickable
    // (payables are). Without it the document had no route from the AR list.
    await row.first().getByTestId("ar-invoice-details").click();
    await page.waitForURL(/\/app\/financial\/invoices\//, { timeout: 20_000 });

    // ── Download the document ───────────────────────────────────────────────
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByTestId("invoice-download-pdf").click();
    const download: Download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const text = extractPdfText(readFileSync(path!));

    // It is a tax invoice, not a screenshot of a screen.
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain(invoiceNumber);

    // Rule 46(a)/(d): both parties' GSTINs.
    expect(text).toContain("29AABCC1234D1ZP");
    expect(text).toContain("29AAACA1111A1Z5");
    expect(text).toContain(customerName);

    // Rule 46(g)(h)(i): HSN, description, quantity/unit.
    expect(text).toContain("998313");
    expect(text).toContain("998314");
    expect(text).toContain("Implementation services");
    expect(text).toContain("NOS");

    // Rule 46(l)(m)(n): named split with rates, and the place of supply. Same
    // state on both sides, so CGST + SGST — this is exactly what was billed as
    // IGST while the supplier had no resolvable state.
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).toContain("Rs. 1,925.00");
    expect(text).toContain("Rs. 25,000.00");
    expect(text).toContain("Rs. 28,850.00");
    expect(text).toContain("Karnataka (29)");
    expect(text).toContain("Intra-state supply");

    // Rule 46(p)/(q).
    expect(text).toContain("Reverse charge: No");
    expect(text).toContain("Authorised Signatory");
  });

  test("a payable (vendor) invoice cannot be issued as our tax invoice", async ({ page }) => {
    const stamp = Date.now();
    const invoiceNumber = `BILL-E2E-${stamp}`;

    await loginAs(page, "admin@coheron.com");
    await ensureSupplierGstin(page);

    const vendor = await trpcPost(page, "vendors.create", {
      name: `E2E Supplier ${stamp}`,
      gstin: "29AAACA2222A1Z5",
      state: "29",
    });

    // A bill the VENDOR issued to us. Printing "our" tax invoice for it would be
    // fabricating someone else's statutory document under our letterhead.
    await trpcPost(page, "financial.createInvoice", {
      vendorId: vendor.id,
      invoiceNumber,
      amount: "10000",
      gstRate: 18,
    });

    await gotoFinancialTab(page, "Accounts Payable");

    const row = page.locator("tr", { hasText: invoiceNumber });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.first().click();
    await page.waitForURL(/\/app\/financial\/invoices\//, { timeout: 20_000 });

    await page.getByTestId("invoice-download-pdf").click();

    // Refused, with the reason — not a silent failure and not a document.
    await expect(
      page.getByText(/issued by your supplier|payable \(vendor\) invoice/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
