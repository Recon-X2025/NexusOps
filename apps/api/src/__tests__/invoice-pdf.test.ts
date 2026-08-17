/**
 * What the TAX INVOICE says, and what it refuses to say.
 *
 * A tax invoice is a statutory document under Rule 46 of the CGST Rules 2017.
 * Issuing a defective one is worse than issuing none, so half of these tests are
 * about refusal.
 *
 * Text is read back out of the generated PDF: PDFKit writes hex-string runs
 * inside `TJ` arrays split at kerning pairs, and the generator sets
 * `compress: false`, so concatenating the runs in document order reassembles the
 * page. A test asserting only `buffer.length > 0` would pass on a blank page.
 */
import { describe, it, expect } from "vitest";
import { generateInvoicePDF, type InvoicePdfInput } from "../services/invoice-pdf";
import { assertInvoiceDocumentBasis } from "../http/financial-invoice-pdf";
import { formatPdfInr, pctLabel, reconcileRateGroups } from "../services/pdf-money";

function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/<([0-9a-fA-F]+)>/g)) {
    out += Buffer.from(m[1]!, "hex").toString("latin1");
  }
  return out;
}

function baseInvoice(): InvoicePdfInput {
  return {
    seller: {
      legalName: "Coheron Technologies Private Limited",
      gstin: "29AABCC1234D1ZP",
      stateName: "Karnataka",
      stateCode: "29",
      address: "12 MG Road, Bengaluru 560001",
    },
    buyer: {
      name: "Acme Industries Pvt Ltd",
      address: "9 Nehru Nagar, Bengaluru 560002",
      gstin: "29AAACA1111A1Z5",
      stateName: "Karnataka",
    },
    invoice: {
      number: "INV-2026-00042",
      date: new Date("2026-08-17T00:00:00Z"),
      dueDate: new Date("2026-09-16T00:00:00Z"),
      documentTitle: "TAX INVOICE",
      originalInvoiceNumber: null,
      originalInvoiceDate: null,
      isReverseCharge: false,
    },
    lines: [
      { description: "Implementation services", hsnSacCode: "998313", quantity: 1, unit: "NOS", unitPrice: 20000, discountPercent: 0, taxableValue: 20000, gstRate: 18 },
      { description: "Annual support", hsnSacCode: "998314", quantity: 1, unit: "NOS", unitPrice: 5000, discountPercent: 0, taxableValue: 5000, gstRate: 5 },
    ],
    totals: {
      taxableValue: 25000,
      cgst: 1925,
      sgst: 1925,
      igst: 0,
      taxTotal: 3850,
      total: 28850,
      tdsDeducted: 0,
    },
    placeOfSupply: "Karnataka (29)",
    isInterstate: false,
    eInvoice: { irn: null, ackNumber: null, ackDate: null, status: null },
  };
}

describe("Tax invoice PDF — Rule 46 particulars the system holds", () => {
  it("carries supplier and recipient identity, the serial number and the date", async () => {
    const text = extractPdfText(await generateInvoicePDF(baseInvoice()));
    expect(text).toContain("TAX INVOICE");
    // (a) supplier name, address, GSTIN
    expect(text).toContain("Coheron Technologies Private Limited");
    expect(text).toContain("12 MG Road, Bengaluru 560001");
    expect(text).toContain("29AABCC1234D1ZP");
    // (b) serial number  (c) date
    expect(text).toContain("INV-2026-00042");
    expect(text).toContain("17 Aug 2026");
    // (d) recipient name, address, GSTIN
    expect(text).toContain("Acme Industries Pvt Ltd");
    expect(text).toContain("29AAACA1111A1Z5");
  });

  it("carries HSN, description, quantity and unit for every line", async () => {
    const text = extractPdfText(await generateInvoicePDF(baseInvoice()));
    // (g) HSN/SAC  (h) description  (i) quantity + UQC
    expect(text).toContain("998313");
    expect(text).toContain("998314");
    expect(text).toContain("Implementation services");
    expect(text).toContain("Annual support");
    expect(text).toContain("NOS");
    expect(text).toContain("HSN/SAC");
    expect(text).toContain("UOM");
  });

  it("names the tax split with its rate, and states the place of supply", async () => {
    const text = extractPdfText(await generateInvoicePDF(baseInvoice()));
    // (l) rate  (m) amount of tax  (n) place of supply
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");
    expect(text).toContain("Rs. 1,925.00");
    expect(text).toContain("Rs. 25,000.00"); // taxable value
    expect(text).toContain("Rs. 28,850.00"); // total
    expect(text).toContain("Karnataka (29)");
    expect(text).toContain("Intra-state supply");
    // rate-wise: 18% and 5% on the lines, 9% and 2.5% on the split
    expect(text).toContain("9%");
    expect(text).toContain("2.5%");
  });

  it("states reverse charge either way — Rule 46(p)", async () => {
    const no = extractPdfText(await generateInvoicePDF(baseInvoice()));
    expect(no).toContain("Reverse charge: No");

    const rc = baseInvoice();
    rc.invoice.isReverseCharge = true;
    expect(extractPdfText(await generateInvoicePDF(rc))).toContain("Reverse charge: Yes");
  });

  it("carries a signature block — Rule 46(q) — with no invented signatory", async () => {
    const text = extractPdfText(await generateInvoicePDF(baseInvoice()));
    expect(text).toContain("Authorised Signatory");
    expect(text).toContain("For Coheron Technologies Private Limited");
  });

  it("switches to IGST with its rate on an inter-state supply", async () => {
    const inv = baseInvoice();
    inv.isInterstate = true;
    inv.placeOfSupply = "Maharashtra (27)";
    inv.lines = [inv.lines[0]!];
    inv.totals = { ...inv.totals, taxableValue: 20000, cgst: 0, sgst: 0, igst: 3600, taxTotal: 3600, total: 23600 };

    const text = extractPdfText(await generateInvoicePDF(inv));
    expect(text).toContain("IGST @ 18%");
    expect(text).toContain("Inter-state supply");
    expect(text).toContain("Rs. 23,600.00");
    // No half-tax lines. NOT a bare `not.toContain("CGST")` — the footer cites
    // "the CGST Rules 2017", which is the statute's name, not a tax charged.
    expect(text).not.toContain("SGST");
    expect(text).not.toMatch(/CGST\s*@/);
  });

  it("shows TDS when some was deducted", async () => {
    const inv = baseInvoice();
    inv.totals.tdsDeducted = 2000;
    const text = extractPdfText(await generateInvoicePDF(inv));
    expect(text).toContain("TDS deducted");
    expect(text).toContain("Rs. 2,000.00");
  });

  it("names the original invoice on a credit note", async () => {
    const inv = baseInvoice();
    inv.invoice.documentTitle = "CREDIT NOTE";
    inv.invoice.originalInvoiceNumber = "INV-2026-00010";
    inv.invoice.originalInvoiceDate = new Date("2026-07-01T00:00:00Z");
    const text = extractPdfText(await generateInvoicePDF(inv));
    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("INV-2026-00010");
  });
});

/**
 * Generate, do not file. The IRN comes from the ClearTax pipeline
 * (`coheronconnect-irn-generation` → `startIrnWorker` → `clearTaxGstAdapter`);
 * this document only prints what that pipeline stored.
 */
describe("Tax invoice PDF — e-invoicing is printed, never performed", () => {
  it("prints the IRN and acknowledgement when the IRP has registered it", async () => {
    const inv = baseInvoice();
    inv.eInvoice = {
      irn: "a".repeat(64),
      ackNumber: "112010000123456",
      ackDate: new Date("2026-08-17T10:30:00Z"),
      status: "generated",
    };
    const text = extractPdfText(await generateInvoicePDF(inv));
    expect(text).toContain("IRN: " + "a".repeat(64));
    expect(text).toContain("112010000123456");
    expect(text).toContain("e-INVOICE");
  });

  it("says the IRN is absent rather than printing a document that looks complete", async () => {
    const inv = baseInvoice();
    inv.eInvoice = { irn: null, ackNumber: null, ackDate: null, status: "failed" };
    const text = extractPdfText(await generateInvoicePDF(inv));
    expect(text).toContain("not yet registered with the IRP");
    expect(text).toContain("failed");
  });

  it("stays silent about e-invoicing when it was never attempted", async () => {
    const text = extractPdfText(await generateInvoicePDF(baseInvoice()));
    expect(text).not.toContain("e-INVOICE");
    expect(text).not.toContain("not yet registered");
  });
});

describe("Tax invoice PDF — what it refuses to issue", () => {
  const issuable = {
    invoiceFlow: "receivable",
    supplierGstin: "29AABCC1234D1ZP",
    placeOfSupply: "29",
    lineCount: 2,
  };

  it("issues a receivable invoice that has everything", () => {
    expect(assertInvoiceDocumentBasis(issuable)).toBeNull();
  });

  it("refuses a payable invoice — that document belongs to the vendor", () => {
    const block = assertInvoiceDocumentBasis({ ...issuable, invoiceFlow: "payable" });
    expect(block?.field).toBe("invoice.invoiceFlow");
    expect(block?.message).toMatch(/issued by your supplier/i);
  });

  it("refuses without a supplier GSTIN — Rule 46(a)", () => {
    const block = assertInvoiceDocumentBasis({ ...issuable, supplierGstin: null });
    expect(block?.field).toBe("invoice.supplierGstin");
    expect(block?.message).toMatch(/GST Registrations/i);
  });

  it("refuses without a place of supply — Rule 46(n)", () => {
    const block = assertInvoiceDocumentBasis({ ...issuable, placeOfSupply: null });
    expect(block?.field).toBe("invoice.placeOfSupply");
    expect(block?.message).toMatch(/CGST\/SGST-vs-IGST split/i);
  });

  /**
   * The live gap this surfaces: `lines` is an OPTIONAL input on
   * `financial.createGSTInvoice` and the web invoice form never sends it, so
   * invoices created by clicking have no lines at all. Printing them would issue
   * an invoice with no HSN, description or quantity.
   */
  it("refuses with no line items — Rule 46(g)(h)(i)", () => {
    const block = assertInvoiceDocumentBasis({ ...issuable, lineCount: 0 });
    expect(block?.field).toBe("invoice.lines");
    expect(block?.message).toMatch(/HSN\/SAC, description or quantity/i);
  });
});

describe("Shared PDF formatting", () => {
  it("formats full en-IN figures to two decimals", () => {
    expect(formatPdfInr(250000)).toBe("Rs. 2,50,000.00");
    expect(formatPdfInr(-0)).toBe("Rs. 0.00");
  });

  it("renders half-rates without a trailing zero", () => {
    expect(pctLabel(2.5)).toBe("2.5%");
    expect(pctLabel(18)).toBe("18%");
  });

  it("drops the rate-wise breakup when it cannot reconcile with the stored split", () => {
    const lines = [{ taxable: 20000, rate: 18 }];
    expect(reconcileRateGroups(lines, { taxableValue: 20000, taxTotal: 3600 }, false)).not.toBeNull();
    // Stored tax says something this module cannot derive → do not contradict it.
    expect(reconcileRateGroups(lines, { taxableValue: 20000, taxTotal: 9999 }, false)).toBeNull();
  });
});
