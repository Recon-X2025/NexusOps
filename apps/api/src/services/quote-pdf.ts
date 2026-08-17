/**
 * CoheronConnect Quotation PDF Generator
 * ──────────────────────────────────────
 * Uses PDFKit, exactly as `payslip-pdf.ts` and `form16-pdf.ts` do. This is
 * deliberately NOT a second PDF mechanism — same library, same buffer-returning
 * shape, same Fastify-route + Next-proxy delivery.
 *
 * What this replaces: the quote's "Download PDF" control called `downloadCSV`
 * and emitted a six-column CSV (quote number, deal id, total, currency, status,
 * validity) named `.csv`. No line items, no tax split, no GSTINs, no parties —
 * i.e. none of the things that make a quotation a document a customer can act on.
 *
 * ── Two rules this file exists to hold ──────────────────────────────────────
 *
 * 1. THE PRINTED TOTALS ARE THE STORED TOTALS. Every figure in the summary block
 *    comes from the `crm_quotes` columns the GST engine wrote. This module does
 *    not re-compute tax. It derives a rate-wise BREAKUP for presentation and
 *    then reconciles that breakup against the stored aggregate; if the two
 *    disagree by even a paisa the breakup is dropped and the stored split is
 *    printed alone. A document that contradicts the ledger is worse than a
 *    document with less detail on it.
 *
 * 2. "Rs." NOT "₹". PDFKit's standard 14 fonts are WinAnsi-encoded and have no
 *    U+20B9 glyph, so a rupee sign renders as a missing/garbled character.
 *    `payslip-pdf.ts:246` already prints "AMOUNT (Rs.)" for this reason. Money is
 *    otherwise formatted exactly as the on-screen statements format it — en-IN
 *    grouping, two decimals, full figures, never an abbreviated "250K".
 */

import PDFDocument from "pdfkit";
import {
  formatPdfInr,
  pctLabel,
  formatPdfDate,
  reconcileRateGroups,
  EMPTY_CELL,
  round2,
  type RateGroup,
} from "./pdf-money";

/** One line as it appears on the document. */
export interface QuotePdfLine {
  description: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  /** Line total as stored (already net of the per-line discount). */
  gross: number;
  gstRate: number;
}

export interface QuotePdfInput {
  seller: {
    legalName: string;
    gstin: string;
    stateCode: string | null;
    stateName: string | null;
    address: string | null;
  };
  buyer: {
    name: string;
    address: string | null;
    gstin: string | null;
    stateName: string | null;
  };
  quote: {
    number: string;
    date: Date;
    validUntil: Date | null;
    notes: string | null;
  };
  lines: QuotePdfLine[];
  totals: {
    subtotal: number;
    discountPct: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    taxTotal: number;
    total: number;
  };
  placeOfSupply: string | null;
  isInterstate: boolean;
}

/**
 * Money, percentages and dates all come from `pdf-money.ts` so the quotation and
 * the tax invoice for the same sale cannot print the same number differently.
 * The name is kept because `quote-pdf.test.ts` pins these exact output strings.
 */
export const formatQuoteInr = formatPdfInr;

const pct = pctLabel;
const fmtDate = formatPdfDate;

/**
 * Group the quote's lines by GST rate for the rate-wise summary.
 *
 * The per-line taxable value mirrors the engine's arithmetic (`quote-tax.ts`:
 * the stored line total scaled by the header discount factor); the grouping and
 * the reconciliation against the stored aggregate live in `pdf-money.ts` and are
 * shared with the tax invoice. Returns null when it does not reconcile, so the
 * caller falls back to the stored split.
 */
export function buildRateGroups(input: QuotePdfInput): RateGroup[] | null {
  const factor = 1 - (input.totals.discountPct || 0) / 100;
  return reconcileRateGroups(
    input.lines.map((l) => ({ taxable: round2(l.gross * factor), rate: l.gstRate })),
    { taxableValue: input.totals.taxableValue, taxTotal: input.totals.taxTotal },
    input.isInterstate,
  );
}

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545; // A4 595.28 minus the 50pt right margin
const CONTENT_W = PAGE_RIGHT - PAGE_LEFT;

export async function generateQuotePDF(input: QuotePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: PAGE_LEFT, right: 50 },
      // Uncompressed so the text layer is directly readable — it makes the
      // document searchable/copyable for the recipient, and it is what lets
      // `quote-pdf.test.ts` assert what the page SAYS rather than that bytes
      // came back. A one-page quote is small enough that the size cost is noise.
      compress: false,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 40;

    // ── Letterhead ──────────────────────────────────────────────────────────
    // No logo: `organizations.logoUrl` exists but is a URL, nothing in the
    // codebase renders it into any PDF, and the deployed stack ships no object
    // storage to fetch it from. Shipping without one is a decision, not a miss.
    doc.fontSize(15).font("Helvetica-Bold").fillColor("#111111");
    doc.text(input.seller.legalName, PAGE_LEFT, y, { width: CONTENT_W - 150 });
    y = doc.y + 2;

    doc.fontSize(8).font("Helvetica").fillColor("#444444");
    if (input.seller.address) {
      doc.text(input.seller.address, PAGE_LEFT, y, { width: CONTENT_W - 170 });
      y = doc.y;
    }
    doc.text(`GSTIN: ${input.seller.gstin}`, PAGE_LEFT, y);
    y = doc.y;
    if (input.seller.stateName || input.seller.stateCode) {
      doc.text(
        `State: ${input.seller.stateName ?? EMPTY_CELL}${input.seller.stateCode ? ` (${input.seller.stateCode})` : ""}`,
        PAGE_LEFT,
        y,
      );
      y = doc.y;
    }

    // Title block, right-aligned against the letterhead.
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#111111");
    doc.text("QUOTATION", PAGE_RIGHT - 200, 40, { width: 200, align: "right" });
    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    doc.text(`No: ${input.quote.number}`, PAGE_RIGHT - 200, 64, { width: 200, align: "right" });
    doc.text(`Date: ${fmtDate(input.quote.date)}`, PAGE_RIGHT - 200, 76, { width: 200, align: "right" });
    doc.text(`Valid until: ${fmtDate(input.quote.validUntil)}`, PAGE_RIGHT - 200, 88, {
      width: 200,
      align: "right",
    });

    y = Math.max(y, 104) + 10;
    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(1).strokeColor("#cccccc").stroke();
    y += 12;

    // ── Bill to / place of supply ───────────────────────────────────────────
    const billTop = y;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#666666").text("BILL TO", PAGE_LEFT, y);
    y = doc.y + 2;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#111111").text(input.buyer.name, PAGE_LEFT, y, {
      width: 280,
    });
    y = doc.y + 1;
    doc.fontSize(8).font("Helvetica").fillColor("#444444");
    if (input.buyer.address) {
      doc.text(input.buyer.address, PAGE_LEFT, y, { width: 280 });
      y = doc.y;
    }
    doc.text(`GSTIN: ${input.buyer.gstin ?? "Not on file"}`, PAGE_LEFT, y, { width: 280 });
    y = doc.y;

    // The resolved place of supply, printed so the split below can be verified
    // by the person receiving it rather than taken on trust.
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#666666").text("PLACE OF SUPPLY", 330, billTop);
    doc.fontSize(9).font("Helvetica").fillColor("#111111");
    doc.text(input.placeOfSupply ?? EMPTY_CELL, 330, billTop + 12, { width: 215 });
    doc.fontSize(8).fillColor("#444444");
    doc.text(
      input.isInterstate ? "Inter-state supply - IGST applies" : "Intra-state supply - CGST + SGST apply",
      330,
      billTop + 26,
      { width: 215 },
    );

    y = Math.max(y, billTop + 44) + 12;

    // ── Line items ──────────────────────────────────────────────────────────
    const cols = {
      sn: PAGE_LEFT,
      desc: PAGE_LEFT + 22,
      hsn: PAGE_LEFT + 210,
      qty: PAGE_LEFT + 268,
      rate: PAGE_LEFT + 300,
      disc: PAGE_LEFT + 372,
      gst: PAGE_LEFT + 408,
      amt: PAGE_LEFT + 440,
    };
    const amtW = PAGE_RIGHT - cols.amt;

    doc.rect(PAGE_LEFT, y, CONTENT_W, 18).fillColor("#f0f0f0").fill();
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#333333");
    doc.text("#", cols.sn + 4, y + 6);
    doc.text("DESCRIPTION", cols.desc, y + 6);
    doc.text("HSN/SAC", cols.hsn, y + 6);
    doc.text("QTY", cols.qty, y + 6);
    doc.text("UNIT PRICE", cols.rate, y + 6, { width: 66, align: "right" });
    doc.text("DISC%", cols.disc, y + 6, { width: 30, align: "right" });
    doc.text("GST%", cols.gst, y + 6, { width: 26, align: "right" });
    doc.text("AMOUNT (Rs.)", cols.amt, y + 6, { width: amtW, align: "right" });
    y += 18;

    doc.fontSize(8).font("Helvetica").fillColor("#222222");
    input.lines.forEach((l, i) => {
      const h = Math.max(
        16,
        doc.heightOfString(l.description, { width: cols.hsn - cols.desc - 6 }) + 6,
      );
      if (i % 2 === 1) {
        doc.rect(PAGE_LEFT, y, CONTENT_W, h).fillColor("#fafafa").fill();
      }
      doc.fillColor("#222222");
      doc.text(String(i + 1), cols.sn + 4, y + 4);
      doc.text(l.description, cols.desc, y + 4, { width: cols.hsn - cols.desc - 6 });
      doc.text(l.hsnCode ?? EMPTY_CELL, cols.hsn, y + 4, { width: 52 });
      doc.text(String(l.quantity), cols.qty, y + 4, { width: 28 });
      doc.text(formatQuoteInr(l.unitPrice), cols.rate, y + 4, { width: 66, align: "right" });
      doc.text(l.discountPct ? pct(l.discountPct) : EMPTY_CELL, cols.disc, y + 4, { width: 30, align: "right" });
      doc.text(pct(l.gstRate), cols.gst, y + 4, { width: 26, align: "right" });
      doc.text(formatQuoteInr(l.gross), cols.amt, y + 4, { width: amtW, align: "right" });
      y += h;
    });

    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    y += 10;

    // ── Rate-wise GST breakup ───────────────────────────────────────────────
    const groups = buildRateGroups(input);
    if (groups && groups.length > 0) {
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#666666");
      doc.text("TAX SUMMARY (RATE-WISE)", PAGE_LEFT, y);
      y = doc.y + 4;
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#333333");
      doc.text("GST RATE", PAGE_LEFT, y);
      doc.text("TAXABLE VALUE", PAGE_LEFT + 70, y, { width: 90, align: "right" });
      if (input.isInterstate) {
        doc.text("IGST", PAGE_LEFT + 170, y, { width: 90, align: "right" });
      } else {
        doc.text("CGST", PAGE_LEFT + 170, y, { width: 90, align: "right" });
        doc.text("SGST", PAGE_LEFT + 270, y, { width: 90, align: "right" });
      }
      y = doc.y + 3;
      doc.fontSize(8).font("Helvetica").fillColor("#222222");
      for (const g of groups) {
        doc.text(pct(g.rate), PAGE_LEFT, y);
        doc.text(formatQuoteInr(g.taxable), PAGE_LEFT + 70, y, { width: 90, align: "right" });
        if (input.isInterstate) {
          doc.text(`${pct(g.rate)}  ${formatQuoteInr(g.igst)}`, PAGE_LEFT + 170, y, {
            width: 90,
            align: "right",
          });
        } else {
          doc.text(`${pct(g.rate / 2)}  ${formatQuoteInr(g.cgst)}`, PAGE_LEFT + 170, y, {
            width: 90,
            align: "right",
          });
          doc.text(`${pct(g.rate / 2)}  ${formatQuoteInr(g.sgst)}`, PAGE_LEFT + 270, y, {
            width: 90,
            align: "right",
          });
        }
        y = doc.y + 2;
      }
      y += 6;
    }

    // ── Totals (the stored, authoritative figures) ──────────────────────────
    const labelX = PAGE_RIGHT - 250;
    const valueX = PAGE_RIGHT - 130;
    const row = (label: string, value: string, bold = false): void => {
      doc.fontSize(bold ? 9.5 : 8.5).font(bold ? "Helvetica-Bold" : "Helvetica");
      doc.fillColor(bold ? "#111111" : "#333333");
      doc.text(label, labelX, y, { width: 115, align: "right" });
      doc.text(value, valueX, y, { width: 130, align: "right" });
      y = doc.y + 3;
    };

    row("Subtotal", formatQuoteInr(input.totals.subtotal));
    if (input.totals.discountPct > 0) {
      row(`Discount (${pct(input.totals.discountPct)})`, `- ${formatQuoteInr(
        round2(input.totals.subtotal - input.totals.taxableValue),
      )}`);
    }
    row("Taxable value", formatQuoteInr(input.totals.taxableValue));

    // 2c: never a single "Tax" figure. The split is named, and the rate is on it.
    const rates = [...new Set(input.lines.filter((l) => l.gross > 0).map((l) => l.gstRate))];
    const rateSuffix = rates.length === 1 ? ` @ ${pct(rates[0]! / 2)}` : " (rate-wise above)";
    const igstSuffix = rates.length === 1 ? ` @ ${pct(rates[0]!)}` : " (rate-wise above)";
    if (input.isInterstate) {
      row(`IGST${igstSuffix}`, formatQuoteInr(input.totals.igst));
    } else {
      row(`CGST${rateSuffix}`, formatQuoteInr(input.totals.cgst));
      row(`SGST${rateSuffix}`, formatQuoteInr(input.totals.sgst));
    }

    y += 2;
    doc.moveTo(labelX, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor("#999999").stroke();
    y += 5;
    row("TOTAL", formatQuoteInr(input.totals.total), true);
    y += 10;

    // ── Notes ───────────────────────────────────────────────────────────────
    if (input.quote.notes) {
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#666666").text("NOTES", PAGE_LEFT, y);
      y = doc.y + 2;
      doc.fontSize(8).font("Helvetica").fillColor("#333333");
      doc.text(input.quote.notes, PAGE_LEFT, y, { width: CONTENT_W - 200 });
      y = doc.y + 10;
    }

    /*
     * Terms & conditions and payment terms are NOT printed, because the system
     * holds no such field — there is no terms column anywhere in the CRM schema.
     * Inventing standard-sounding terms would put clauses the customer never
     * agreed onto a document they may rely on, so the document says plainly that
     * none are recorded instead of quietly looking complete.
     */
    doc.fontSize(7.5).font("Helvetica-Oblique").fillColor("#777777");
    doc.text(
      "No terms and conditions are recorded against this quotation.",
      PAGE_LEFT,
      y,
      { width: CONTENT_W - 200 },
    );
    y = doc.y + 24;

    // ── Signature area ──────────────────────────────────────────────────────
    // The org's legal name is real data. No signatory NAME is printed because
    // none is stored — the line is left blank for a human to sign.
    doc.fontSize(8.5).font("Helvetica").fillColor("#333333");
    doc.text(`For ${input.seller.legalName}`, PAGE_RIGHT - 200, y, { width: 200, align: "right" });
    y = doc.y + 30;
    doc.moveTo(PAGE_RIGHT - 180, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor("#999999").stroke();
    doc.fontSize(7.5).fillColor("#777777");
    doc.text("Authorised Signatory", PAGE_RIGHT - 200, y + 4, { width: 200, align: "right" });

    doc.fontSize(7).fillColor("#999999");
    doc.text(
      "This is a quotation, not a tax invoice. Prices valid until the date shown above.",
      PAGE_LEFT,
      800,
      { width: CONTENT_W, align: "center" },
    );

    doc.end();
  });
}
