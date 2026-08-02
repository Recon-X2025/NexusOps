import { TRPCError } from "@trpc/server";
import { computeGST, type GSTRate } from "./india/gst-engine";

/**
 * Invoice line items — CA-ruled tax model (2026-08-02).
 *
 * The design question the CA settled: when an invoice has multiple lines,
 * WHICH figure is authoritative — the header total or the per-line amounts?
 *
 * Ruling:
 *  - Lines are authoritative; the header is DERIVED from them.
 *  - Each line's tax is rounded to 2dp, half-up, independently.
 *  - The header equals the SUM of the already-rounded line values.
 *  - Never compute tax on a gross header and reverse it into lines.
 *  - A mismatch between the sum of the lines and a caller-supplied header is a
 *    HARD ERROR, not a tolerance. Even ₹0.01 makes the IRN (e-invoice) generator
 *    or the GSTR-1 offline tool reject the whole payload, so we refuse to persist
 *    a divergent invoice rather than emit one that fails downstream.
 *
 * This is the single source of truth for both the financial.ts create paths and
 * the ingest.ts bulk path, so they cannot drift.
 */

/** One line as supplied by a caller. `taxableValue` is authoritative (accepted directly). */
export interface InvoiceLineInput {
  description: string;
  taxableValue: number;
  gstRate: GSTRate;
  hsnSacCode?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
}

/** A fully-computed line, ready to insert into `invoice_line_items` (string columns). */
export interface ComputedInvoiceLine {
  lineItemNumber: number;
  description: string;
  hsnSacCode: string | null;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxableValue: string;
  gstRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
}

/** Header totals derived by summing the rounded lines — the numbers that hit `invoices`. */
export interface DerivedInvoiceHeader {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  invoiceTotal: number;
  isInterstate: boolean;
}

export interface ComputedInvoice {
  header: DerivedInvoiceHeader;
  lines: ComputedInvoiceLine[];
}

/**
 * Sum a list of 2dp money values without accumulating binary-float drift.
 * Work in integer paise, then divide back — so 0.1 + 0.2 is exactly 0.30.
 */
function sumMoney(values: number[]): number {
  const paise = values.reduce((acc, v) => acc + Math.round(v * 100), 0);
  return paise / 100;
}

/**
 * Compute an invoice from its authoritative lines.
 *
 * @param lines               caller lines; `taxableValue` accepted as-is (CA ruling).
 * @param orgState/counterpartyState  drive the intra-vs-inter-state CGST/SGST-vs-IGST split.
 * @param expectedHeader      optional caller-supplied header total; if present it must
 *                            equal the summed lines EXACTLY or we throw (hard error).
 */
export function computeInvoiceFromLines(params: {
  lines: InvoiceLineInput[];
  orgState: string | null;
  counterpartyState: string | null;
  expectedHeader?: number;
}): ComputedInvoice {
  const { lines, orgState, counterpartyState, expectedHeader } = params;

  if (lines.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must have at least one line" });
  }

  // A line is inter-state if org and counterparty states differ. This is a
  // per-invoice property (same states for every line), but computeGST decides it
  // per call — consistent because the states are identical across lines.
  const supplierState = orgState ?? "";
  const buyerState = counterpartyState ?? supplierState;

  const computed: ComputedInvoiceLine[] = [];
  const taxable: number[] = [];
  const cgst: number[] = [];
  const sgst: number[] = [];
  const igst: number[] = [];
  const lineTotals: number[] = [];
  let isInterstate = false;

  lines.forEach((ln, idx) => {
    // computeGST rounds each component half-up to 2dp via Math.round(v)/100.
    //
    // C7 CAUTION: Math.round is half-up for POSITIVE amounts only —
    // Math.round(-0.5) === -0 (i.e. 0), NOT -1. Every taxableValue here is a
    // positive sale value, so the ruling holds. Credit notes / negative lines
    // (C7) will need an explicit away-from-zero rounder before they can reuse
    // this path; do not feed negative taxableValues through here until then.
    const gst = computeGST({
      taxableValue: ln.taxableValue,
      gstRate: ln.gstRate,
      supplierState,
      buyerState,
    });
    isInterstate = gst.isInterstate;

    const lineTotal = gst.invoiceTotal; // taxableValue + this line's rounded tax
    computed.push({
      lineItemNumber: idx + 1,
      description: ln.description,
      hsnSacCode: ln.hsnSacCode ?? null,
      quantity: String(ln.quantity ?? 1),
      unit: ln.unit ?? null,
      unitPrice: String(ln.unitPrice ?? ln.taxableValue),
      discountPercent: String(ln.discountPercent ?? 0),
      discountAmount: String(ln.discountAmount ?? 0),
      taxableValue: String(gst.taxableValue),
      gstRate: String(ln.gstRate),
      cgstAmount: String(gst.cgstAmount),
      sgstAmount: String(gst.sgstAmount),
      igstAmount: String(gst.igstAmount),
      lineTotal: String(lineTotal),
    });

    taxable.push(gst.taxableValue);
    cgst.push(gst.cgstAmount);
    sgst.push(gst.sgstAmount);
    igst.push(gst.igstAmount);
    lineTotals.push(lineTotal);
  });

  // Header = sum of the ALREADY-ROUNDED lines (never re-derive from a gross).
  const header: DerivedInvoiceHeader = {
    taxableValue: sumMoney(taxable),
    cgstAmount: sumMoney(cgst),
    sgstAmount: sumMoney(sgst),
    igstAmount: sumMoney(igst),
    totalTaxAmount: sumMoney([...cgst, ...sgst, ...igst]),
    invoiceTotal: sumMoney(lineTotals),
    isInterstate,
  };

  // If the caller also supplied a header total, it must match the summed lines
  // to the paise. A ₹0.01 gap is rejected outright (IRN / GSTR-1 tool would too).
  if (expectedHeader !== undefined) {
    const expectedPaise = Math.round(expectedHeader * 100);
    const actualPaise = Math.round(header.invoiceTotal * 100);
    if (expectedPaise !== actualPaise) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          `Invoice header total ${header.invoiceTotal.toFixed(2)} does not equal the sum of lines ` +
          `${(actualPaise / 100).toFixed(2)} (supplied ${(expectedPaise / 100).toFixed(2)}). ` +
          `Lines are authoritative; the header must equal their rounded sum exactly.`,
      });
    }
  }

  return { header, lines: computed };
}
