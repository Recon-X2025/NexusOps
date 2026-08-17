/**
 * CoheronConnect TAX INVOICE PDF Generator
 * ────────────────────────────────────────
 * PDFKit, same as `payslip-pdf.ts`, `form16-pdf.ts` and `quote-pdf.ts`. No second
 * PDF mechanism.
 *
 * ── Generate, do not file ───────────────────────────────────────────────────
 * This module RENDERS. It never contacts the IRP. E-invoicing already owns that
 * round-trip: `createGSTInvoice` enqueues onto the `coheronconnect-irn-generation`
 * BullMQ queue, `startIrnWorker` runs the job, and `clearTaxGstAdapter.send()`
 * posts to ClearTax, persisting `eInvoiceIrn` / `eInvoiceAckNumber` /
 * `eInvoiceAckDate` / `eInvoiceSignedQrCode` back onto the invoice row. This
 * document PRINTS whatever those columns hold and states plainly when they are
 * empty. Adding a second filing path here would duplicate a working loop.
 *
 * ── Rule 46 ─────────────────────────────────────────────────────────────────
 * Rule 46 of the CGST Rules 2017 enumerates what a tax invoice must contain.
 * This renders every particular the system HOLDS: supplier name/address/GSTIN
 * (a), serial number (b), date (c), recipient details (d), HSN (g), description
 * (h), quantity and unit (i), total and taxable value (j)(k), rate and amount of
 * tax (l)(m), place of supply (n), reverse-charge notation (p), and a signature
 * block (q). Where the system holds nothing — a delivery address different from
 * the place of supply (o) — the document omits it rather than inventing one.
 */

import PDFDocument from "pdfkit";
import {
  formatPdfInr,
  pctLabel,
  formatPdfDate,
  reconcileRateGroups,
  EMPTY_CELL,
  round2,
} from "./pdf-money";

export interface InvoicePdfLine {
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  discountPercent: number;
  taxableValue: number;
  gstRate: number;
}

export interface InvoicePdfInput {
  seller: {
    legalName: string;
    gstin: string;
    stateName: string | null;
    stateCode: string | null;
    address: string | null;
  };
  buyer: {
    name: string;
    address: string | null;
    gstin: string | null;
    stateName: string | null;
  };
  invoice: {
    number: string;
    date: Date;
    dueDate: Date | null;
    /** `tax_invoice` | `credit_note` | `debit_note` — drives the document title. */
    documentTitle: string;
    originalInvoiceNumber: string | null;
    originalInvoiceDate: Date | null;
    isReverseCharge: boolean;
  };
  lines: InvoicePdfLine[];
  totals: {
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    taxTotal: number;
    total: number;
    tdsDeducted: number;
  };
  placeOfSupply: string | null;
  isInterstate: boolean;
  eInvoice: {
    irn: string | null;
    ackNumber: string | null;
    ackDate: Date | null;
    status: string | null;
  };
}

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const CONTENT_W = PAGE_RIGHT - PAGE_LEFT;

export async function generateInvoicePDF(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: PAGE_LEFT, right: 50 },
      // Uncompressed, so the text layer stays readable: the recipient can search
      // and copy from it, and `invoice-pdf.test.ts` can assert what the page SAYS
      // rather than that bytes came back.
      compress: false,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 40;

    // ── Letterhead ──────────────────────────────────────────────────────────
    doc.fontSize(15).font("Helvetica-Bold").fillColor("#111111");
    doc.text(input.seller.legalName, PAGE_LEFT, y, { width: CONTENT_W - 190 });
    y = doc.y + 2;
    doc.fontSize(8).font("Helvetica").fillColor("#444444");
    if (input.seller.address) {
      doc.text(input.seller.address, PAGE_LEFT, y, { width: CONTENT_W - 200 });
      y = doc.y;
    }
    doc.text(`GSTIN: ${input.seller.gstin}`, PAGE_LEFT, y);
    y = doc.y;
    doc.text(
      `State: ${input.seller.stateName ?? EMPTY_CELL}${input.seller.stateCode ? ` (${input.seller.stateCode})` : ""}`,
      PAGE_LEFT,
      y,
    );
    y = doc.y;

    doc.fontSize(16).font("Helvetica-Bold").fillColor("#111111");
    doc.text(input.invoice.documentTitle, PAGE_RIGHT - 220, 40, { width: 220, align: "right" });
    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    doc.text(`No: ${input.invoice.number}`, PAGE_RIGHT - 220, 62, { width: 220, align: "right" });
    doc.text(`Date: ${formatPdfDate(input.invoice.date)}`, PAGE_RIGHT - 220, 74, { width: 220, align: "right" });
    if (input.invoice.dueDate) {
      doc.text(`Due: ${formatPdfDate(input.invoice.dueDate)}`, PAGE_RIGHT - 220, 86, { width: 220, align: "right" });
    }
    // CDNR: a credit/debit note must name the invoice it adjusts.
    if (input.invoice.originalInvoiceNumber) {
      doc.text(
        `Against invoice: ${input.invoice.originalInvoiceNumber}${
          input.invoice.originalInvoiceDate ? ` dt ${formatPdfDate(input.invoice.originalInvoiceDate)}` : ""
        }`,
        PAGE_RIGHT - 220,
        98,
        { width: 220, align: "right" },
      );
    }

    y = Math.max(y, 112) + 8;
    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(1).strokeColor("#cccccc").stroke();
    y += 10;

    // ── e-Invoice details (printed, never generated here) ───────────────────
    if (input.eInvoice.irn) {
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#666666").text("e-INVOICE", PAGE_LEFT, y);
      y = doc.y + 2;
      doc.fontSize(7.5).font("Helvetica").fillColor("#222222");
      doc.text(`IRN: ${input.eInvoice.irn}`, PAGE_LEFT, y, { width: CONTENT_W });
      y = doc.y;
      if (input.eInvoice.ackNumber) {
        doc.text(
          `Ack No: ${input.eInvoice.ackNumber}${
            input.eInvoice.ackDate ? `   Ack Date: ${formatPdfDate(input.eInvoice.ackDate)}` : ""
          }`,
          PAGE_LEFT,
          y,
        );
        y = doc.y;
      }
      y += 6;
    } else if (input.eInvoice.status === "failed" || input.eInvoice.status === "pending") {
      // Say so rather than printing a document that merely looks complete.
      doc.fontSize(7.5).font("Helvetica-Oblique").fillColor("#a15c00");
      doc.text(
        `e-Invoice not yet registered with the IRP (status: ${input.eInvoice.status}). This copy carries no IRN.`,
        PAGE_LEFT,
        y,
        { width: CONTENT_W },
      );
      y = doc.y + 6;
    }

    // ── Bill to / place of supply ───────────────────────────────────────────
    const billTop = y;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#666666").text("BILL TO", PAGE_LEFT, y);
    y = doc.y + 2;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#111111");
    doc.text(input.buyer.name, PAGE_LEFT, y, { width: 280 });
    y = doc.y + 1;
    doc.fontSize(8).font("Helvetica").fillColor("#444444");
    if (input.buyer.address) {
      doc.text(input.buyer.address, PAGE_LEFT, y, { width: 280 });
      y = doc.y;
    }
    doc.text(`GSTIN: ${input.buyer.gstin ?? "Unregistered"}`, PAGE_LEFT, y, { width: 280 });
    y = doc.y;

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
    // Rule 46(p): reverse charge must be stated either way.
    doc.text(
      `Reverse charge: ${input.invoice.isReverseCharge ? "Yes" : "No"}`,
      330,
      billTop + 40,
      { width: 215 },
    );

    y = Math.max(y, billTop + 56) + 10;

    // ── Line items ──────────────────────────────────────────────────────────
    const cols = {
      sn: PAGE_LEFT,
      desc: PAGE_LEFT + 20,
      hsn: PAGE_LEFT + 196,
      qty: PAGE_LEFT + 250,
      unit: PAGE_LEFT + 282,
      rate: PAGE_LEFT + 312,
      disc: PAGE_LEFT + 378,
      gst: PAGE_LEFT + 412,
      amt: PAGE_LEFT + 442,
    };
    const amtW = PAGE_RIGHT - cols.amt;

    doc.rect(PAGE_LEFT, y, CONTENT_W, 18).fillColor("#f0f0f0").fill();
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#333333");
    doc.text("#", cols.sn + 3, y + 6);
    doc.text("DESCRIPTION", cols.desc, y + 6);
    doc.text("HSN/SAC", cols.hsn, y + 6);
    doc.text("QTY", cols.qty, y + 6);
    doc.text("UOM", cols.unit, y + 6);
    doc.text("RATE", cols.rate, y + 6, { width: 60, align: "right" });
    doc.text("DISC%", cols.disc, y + 6, { width: 28, align: "right" });
    doc.text("GST%", cols.gst, y + 6, { width: 26, align: "right" });
    doc.text("TAXABLE (Rs.)", cols.amt, y + 6, { width: amtW, align: "right" });
    y += 18;

    doc.fontSize(8).font("Helvetica").fillColor("#222222");
    input.lines.forEach((l, i) => {
      const h = Math.max(16, doc.heightOfString(l.description, { width: cols.hsn - cols.desc - 6 }) + 6);
      if (i % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_W, h).fillColor("#fafafa").fill();
      doc.fillColor("#222222");
      doc.text(String(i + 1), cols.sn + 3, y + 4);
      doc.text(l.description, cols.desc, y + 4, { width: cols.hsn - cols.desc - 6 });
      doc.text(l.hsnSacCode ?? EMPTY_CELL, cols.hsn, y + 4, { width: 50 });
      doc.text(String(l.quantity), cols.qty, y + 4, { width: 28 });
      doc.text(l.unit ?? EMPTY_CELL, cols.unit, y + 4, { width: 28 });
      doc.text(formatPdfInr(l.unitPrice), cols.rate, y + 4, { width: 60, align: "right" });
      doc.text(l.discountPercent ? pctLabel(l.discountPercent) : EMPTY_CELL, cols.disc, y + 4, { width: 28, align: "right" });
      doc.text(pctLabel(l.gstRate), cols.gst, y + 4, { width: 26, align: "right" });
      doc.text(formatPdfInr(l.taxableValue), cols.amt, y + 4, { width: amtW, align: "right" });
      y += h;
    });

    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    y += 10;

    // ── Rate-wise GST breakup ───────────────────────────────────────────────
    const groups = reconcileRateGroups(
      input.lines.map((l) => ({ taxable: l.taxableValue, rate: l.gstRate })),
      { taxableValue: input.totals.taxableValue, taxTotal: input.totals.taxTotal },
      input.isInterstate,
    );
    if (groups && groups.length > 0) {
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#666666").text("TAX SUMMARY (RATE-WISE)", PAGE_LEFT, y);
      y = doc.y + 4;
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#333333");
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
        doc.text(pctLabel(g.rate), PAGE_LEFT, y);
        doc.text(formatPdfInr(g.taxable), PAGE_LEFT + 70, y, { width: 90, align: "right" });
        if (input.isInterstate) {
          doc.text(`${pctLabel(g.rate)}  ${formatPdfInr(g.igst)}`, PAGE_LEFT + 170, y, { width: 90, align: "right" });
        } else {
          doc.text(`${pctLabel(g.rate / 2)}  ${formatPdfInr(g.cgst)}`, PAGE_LEFT + 170, y, { width: 90, align: "right" });
          doc.text(`${pctLabel(g.rate / 2)}  ${formatPdfInr(g.sgst)}`, PAGE_LEFT + 270, y, { width: 90, align: "right" });
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

    row("Taxable value", formatPdfInr(input.totals.taxableValue));

    // Never a single "Tax" figure: the split is named, with its rate.
    const rates = [...new Set(input.lines.filter((l) => l.taxableValue > 0).map((l) => l.gstRate))];
    const halfSuffix = rates.length === 1 ? ` @ ${pctLabel(rates[0]! / 2)}` : " (rate-wise above)";
    const fullSuffix = rates.length === 1 ? ` @ ${pctLabel(rates[0]!)}` : " (rate-wise above)";
    if (input.isInterstate) {
      row(`IGST${fullSuffix}`, formatPdfInr(input.totals.igst));
    } else {
      row(`CGST${halfSuffix}`, formatPdfInr(input.totals.cgst));
      row(`SGST${halfSuffix}`, formatPdfInr(input.totals.sgst));
    }
    if (input.totals.tdsDeducted > 0) {
      row("TDS deducted", `- ${formatPdfInr(input.totals.tdsDeducted)}`);
    }

    y += 2;
    doc.moveTo(labelX, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor("#999999").stroke();
    y += 5;
    row("TOTAL", formatPdfInr(input.totals.total), true);
    y += 14;

    // ── Signature block — Rule 46(q) ────────────────────────────────────────
    // The legal name is real data. No signatory NAME is printed because none is
    // stored; the line is left blank for a human to sign.
    doc.fontSize(8.5).font("Helvetica").fillColor("#333333");
    doc.text(`For ${input.seller.legalName}`, PAGE_RIGHT - 200, y, { width: 200, align: "right" });
    y = doc.y + 28;
    doc.moveTo(PAGE_RIGHT - 180, y).lineTo(PAGE_RIGHT, y).lineWidth(0.5).strokeColor("#999999").stroke();
    doc.fontSize(7.5).fillColor("#777777");
    doc.text("Authorised Signatory", PAGE_RIGHT - 200, y + 4, { width: 200, align: "right" });

    doc.fontSize(7).fillColor("#999999");
    doc.text(
      `${input.invoice.documentTitle} issued under the CGST Rules 2017. Amounts in Indian Rupees.`,
      PAGE_LEFT,
      800,
      { width: CONTENT_W, align: "center" },
    );

    doc.end();
  });
}

/** Exported for the route: the sum a caller should print as the invoice total. */
export function invoiceGrandTotal(taxable: number, taxTotal: number): number {
  return round2(taxable + taxTotal);
}
