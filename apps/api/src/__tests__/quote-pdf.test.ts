/**
 * What the quotation PDF SAYS — not that bytes came back.
 *
 * A test that asserted only `buffer.length > 0` would pass on a blank page, which
 * is exactly the failure this round exists to prevent: the control it replaces
 * was labelled "Download PDF" and emitted a six-column CSV. So these tests read
 * the text layer out of the generated PDF and assert the figures, the named tax
 * split and both parties' GSTINs are on it.
 *
 * PDFKit writes text as hex-string runs inside `TJ` arrays, split at kerning
 * pairs (`<436f686572> 20 <6f6e>` for "Coheron"). Concatenating the runs in
 * document order reassembles the text. The generator sets `compress: false`, so
 * the content stream is not Flate-encoded and the runs are readable.
 */
import { describe, it, expect } from "vitest";
import {
  generateQuotePDF,
  buildRateGroups,
  formatQuoteInr,
  type QuotePdfInput,
} from "../services/quote-pdf";
import { assertQuoteDocumentBasis } from "../http/crm-quote-pdf";

function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/<([0-9a-fA-F]+)>/g)) {
    out += Buffer.from(m[1]!, "hex").toString("latin1");
  }
  return out;
}

/**
 * The worked example from the line-item editor round: two lines at 18% and 5%,
 * subtotal 25,000, tax 3,850, total 28,850. The document must carry those exact
 * figures — the stored ones — not a re-computation.
 */
function baseInput(): QuotePdfInput {
  return {
    seller: {
      legalName: "Coheron Technologies Private Limited",
      gstin: "29AABCC1234D1ZP",
      stateCode: "29",
      stateName: "Karnataka",
      address: "12 MG Road, Bengaluru 560001",
    },
    buyer: {
      name: "Acme Industries Pvt Ltd",
      address: "9 Nehru Nagar, Bengaluru 560002",
      gstin: "29AAACA1111A1Z5",
      stateName: "Karnataka",
    },
    quote: {
      number: "QT-0007",
      date: new Date("2026-08-17T00:00:00Z"),
      validUntil: new Date("2026-09-16T00:00:00Z"),
      notes: "Delivery in 4 weeks.",
    },
    lines: [
      { description: "Implementation services", hsnCode: "998313", quantity: 1, unitPrice: 20000, discountPct: 0, gross: 20000, gstRate: 18 },
      { description: "Annual support", hsnCode: "998314", quantity: 1, unitPrice: 5000, discountPct: 0, gross: 5000, gstRate: 5 },
    ],
    totals: {
      subtotal: 25000,
      discountPct: 0,
      taxableValue: 25000,
      cgst: 1925,
      sgst: 1925,
      igst: 0,
      taxTotal: 3850,
      total: 28850,
    },
    placeOfSupply: "Karnataka (29)",
    isInterstate: false,
  };
}

describe("Quotation PDF — the document's contents", () => {
  it("carries the total, the CGST/SGST split and BOTH parties' GSTINs", async () => {
    const text = extractPdfText(await generateQuotePDF(baseInput()));

    // The money, in full figures — never an abbreviated "Rs. 28.85K".
    expect(text).toContain("Rs. 28,850.00"); // total
    expect(text).toContain("Rs. 25,000.00"); // taxable value
    expect(text).toContain("Rs. 1,925.00"); // CGST and SGST are 1,925 each

    // The split is NAMED, not a single "Tax" figure.
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");

    // Both GSTINs — the supplier's and the customer's.
    expect(text).toContain("29AABCC1234D1ZP");
    expect(text).toContain("29AAACA1111A1Z5");

    // Identity and the terms of the offer.
    expect(text).toContain("QUOTATION");
    expect(text).toContain("QT-0007");
    expect(text).toContain("Acme Industries Pvt Ltd");
    expect(text).toContain("Coheron Technologies Private Limited");
    expect(text).toContain("Valid until: 16 Sept 2026");

    // Line detail, including the HSN codes a GST document is read against.
    expect(text).toContain("Implementation services");
    expect(text).toContain("998313");
    expect(text).toContain("998314");
  });

  it("prints the resolved place of supply so the split can be checked", async () => {
    const text = extractPdfText(await generateQuotePDF(baseInput()));
    expect(text).toContain("Karnataka (29)");
    expect(text).toContain("Intra-state supply");
  });

  it("shows a rate-wise breakup when the lines carry different GST rates", async () => {
    const text = extractPdfText(await generateQuotePDF(baseInput()));
    // 18% and 5% are on the lines; the halves 9% and 2.5% are on the CGST/SGST
    // rows. `toFixed(2)` used to render the latter as "2.50%".
    expect(text).toContain("18%");
    expect(text).toContain("5%");
    expect(text).toContain("9%");
    expect(text).toContain("2.5%");
  });

  it("names IGST with its rate on an inter-state supply, and drops CGST/SGST", async () => {
    const input = baseInput();
    input.isInterstate = true;
    input.placeOfSupply = "Maharashtra (27)";
    input.buyer.stateName = "Maharashtra";
    input.lines = [input.lines[0]!]; // single rate, so the label carries "@ 18%"
    input.totals = { ...input.totals, subtotal: 20000, taxableValue: 20000, cgst: 0, sgst: 0, igst: 3600, taxTotal: 3600, total: 23600 };

    const text = extractPdfText(await generateQuotePDF(input));
    expect(text).toContain("IGST @ 18%");
    expect(text).toContain("Rs. 3,600.00");
    expect(text).toContain("Rs. 23,600.00");
    expect(text).toContain("Inter-state supply");
    expect(text).not.toContain("CGST");
    expect(text).not.toContain("SGST");
  });

  it("states plainly that no terms are recorded rather than inventing any", async () => {
    const text = extractPdfText(await generateQuotePDF(baseInput()));
    expect(text).toContain("No terms and conditions are recorded");
    // A signature AREA, with the org's real legal name and no invented signatory.
    expect(text).toContain("Authorised Signatory");
    expect(text).toContain("For Coheron Technologies Private Limited");
  });

  it("says it is a quotation and not a tax invoice", async () => {
    const text = extractPdfText(await generateQuotePDF(baseInput()));
    expect(text).toContain("not a tax invoice");
  });
});

describe("Quotation PDF — the rate-wise breakup never contradicts the stored split", () => {
  it("reconciles against the stored aggregate on the happy path", () => {
    const groups = buildRateGroups(baseInput());
    expect(groups).not.toBeNull();
    expect(groups!.map((g) => g.rate)).toEqual([5, 18]);
    // 5% of 5,000 = 250 → 125 CGST + 125 SGST; 18% of 20,000 = 3,600 → 1,800 each.
    expect(groups!.find((g) => g.rate === 18)!.cgst).toBe(1800);
    expect(groups!.find((g) => g.rate === 5)!.cgst).toBe(125);
  });

  it("returns null when the derived tax disagrees with what the engine stored", () => {
    const input = baseInput();
    // The stored tax says 3,850; pretend the engine stored something else (a
    // rounding rule this module does not know about, a rate change mid-edit).
    input.totals.taxTotal = 3900;
    expect(buildRateGroups(input)).toBeNull();
  });

  it("returns null when the derived taxable value disagrees with the stored one", () => {
    const input = baseInput();
    input.totals.taxableValue = 24000;
    expect(buildRateGroups(input)).toBeNull();
  });

  it("falls back to the stored split on the document when it cannot reconcile", async () => {
    const input = baseInput();
    input.totals.taxableValue = 24000; // forces buildRateGroups → null
    const text = extractPdfText(await generateQuotePDF(input));
    // No rate-wise table…
    expect(text).not.toContain("TAX SUMMARY (RATE-WISE)");
    // …but the authoritative stored figures are still on the page.
    expect(text).toContain("CGST");
    expect(text).toContain("Rs. 1,925.00");
    expect(text).toContain("Rs. 28,850.00");
  });
});

describe("Quotation PDF — money formatting", () => {
  it("renders full en-IN figures to two decimals, never an abbreviation", () => {
    expect(formatQuoteInr(28850)).toBe("Rs. 28,850.00");
    expect(formatQuoteInr(250000)).toBe("Rs. 2,50,000.00"); // lakh grouping, not "250K"
    expect(formatQuoteInr(1234567.5)).toBe("Rs. 12,34,567.50");
    expect(formatQuoteInr(0)).toBe("Rs. 0.00");
  });

  it("never renders a negative zero", () => {
    expect(formatQuoteInr(-0)).toBe("Rs. 0.00");
  });
});

/**
 * The refusal. A quote whose buyer state is missing takes the SELLER's state as
 * place of supply and bills CGST/SGST — a confident split on an unverified
 * basis. On a document mailed to a customer that is the failure this round
 * exists to prevent, so the route blocks rather than warns.
 */
describe("Quotation PDF — the tax basis must be verified before a document exists", () => {
  const ok = {
    sellerGstin: "29AABCC1234D1ZP",
    sellerStateCode: "29",
    hasAccount: true,
    accountName: "Acme Industries Pvt Ltd",
    buyerRawState: "29",
    buyerStateCode: "29",
  };

  it("allows a quote whose both sides resolve", () => {
    expect(assertQuoteDocumentBasis(ok)).toBeNull();
  });

  it("blocks when the org has no active GSTIN", () => {
    const block = assertQuoteDocumentBasis({ ...ok, sellerGstin: null, sellerStateCode: null });
    expect(block?.field).toBe("org.gstin");
    expect(block?.message).toMatch(/no active GSTIN/i);
  });

  it("blocks when the quote is linked to no customer account", () => {
    const block = assertQuoteDocumentBasis({ ...ok, hasAccount: false, accountName: null, buyerRawState: null, buyerStateCode: null });
    expect(block?.field).toBe("quote.account");
    expect(block?.message).toMatch(/not linked to a customer account/i);
  });

  it("blocks when the account has no state, naming the account and the fix", () => {
    const block = assertQuoteDocumentBasis({ ...ok, buyerRawState: null, buyerStateCode: null });
    expect(block?.field).toBe("account.stateCode");
    expect(block?.message).toContain("Acme Industries Pvt Ltd");
    expect(block?.message).toMatch(/intra-state \(CGST \+ SGST\) unverified/i);
  });

  it("blocks when the account's state is not a recognised GST state", () => {
    const block = assertQuoteDocumentBasis({ ...ok, buyerRawState: "Bangalore", buyerStateCode: null });
    expect(block?.field).toBe("account.stateCode");
    expect(block?.message).toContain("Bangalore");
    expect(block?.message).toMatch(/not a recognised GST state/i);
  });
});
