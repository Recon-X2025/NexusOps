/**
 * India GST Engine
 *
 * Implements:
 *  - CGST+SGST vs IGST determination (intra-state vs inter-state)
 *  - All 5 GST rates: 0, 5, 12, 18, 28
 *  - ITC utilisation sequence (per CGST Act rules)
 *  - Reverse Charge Mechanism (RCM) detection
 *  - GSTR-2B reconciliation matching
 *  - E-invoice eligibility check
 *  - E-way bill eligibility check
 */

// ── Types ─────────────────────────────────────────────────────────────────
export type GSTRate = 0 | 5 | 12 | 18 | 28;

export interface GSTResult {
  taxableValue: number;
  isInterstate: boolean;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  invoiceTotal: number;
}

export interface ITCBalance {
  igst: number;
  cgst: number;
  sgst: number;
}

export interface ITCLiability {
  igst: number;
  cgst: number;
  sgst: number;
}

export interface ITCUtilisationResult {
  igstPaid: number;
  cgstPaid: number;
  sgstPaid: number;
  cashToBeDepositedIgst: number;
  cashToBeDepositedCgst: number;
  cashToBeDepositedSgst: number;
  remainingBalance: ITCBalance;
}

// ── GST Computation ───────────────────────────────────────────────────────
export function computeGST(params: {
  taxableValue: number;
  gstRate: GSTRate;
  supplierState: string;
  buyerState: string;
}): GSTResult {
  const { taxableValue, gstRate, supplierState, buyerState } = params;

  const isInterstate =
    supplierState.trim().toLowerCase() !== buyerState.trim().toLowerCase();

  const halfRate = gstRate / 2;

  const cgstAmount = isInterstate ? 0 : Math.round(taxableValue * halfRate) / 100;
  const sgstAmount = isInterstate ? 0 : Math.round(taxableValue * halfRate) / 100;
  const igstAmount = isInterstate ? Math.round(taxableValue * gstRate) / 100 : 0;

  const totalTaxAmount = cgstAmount + sgstAmount + igstAmount;

  return {
    taxableValue,
    isInterstate,
    cgstRate: isInterstate ? 0 : halfRate,
    sgstRate: isInterstate ? 0 : halfRate,
    igstRate: isInterstate ? gstRate : 0,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTaxAmount,
    invoiceTotal: taxableValue + totalTaxAmount,
  };
}

// ── ITC Utilisation Sequence ──────────────────────────────────────────────
/**
 * ITC utilisation rules per CGST Act Section 49:
 * 1. IGST ITC → IGST liability (first)
 * 2. IGST ITC (remaining) → CGST liability
 * 3. IGST ITC (remaining) → SGST liability
 * 4. CGST ITC → CGST liability
 * 5. CGST ITC (remaining) → IGST liability
 * 6. SGST ITC → SGST liability
 * 7. SGST ITC (remaining) → IGST liability
 * RULE: CGST cannot offset SGST; SGST cannot offset CGST.
 */
export function computeITCUtilisation(
  balance: ITCBalance,
  liability: ITCLiability,
): ITCUtilisationResult {
  let { igst: igstBal, cgst: cgstBal, sgst: sgstBal } = { ...balance };
  let { igst: igstLiab, cgst: cgstLiab, sgst: sgstLiab } = { ...liability };

  // Step 1: IGST ITC → IGST liability
  const igstFromIgst = Math.min(igstBal, igstLiab);
  igstBal -= igstFromIgst;
  igstLiab -= igstFromIgst;

  // Step 2: IGST ITC → CGST liability
  const cgstFromIgst = Math.min(igstBal, cgstLiab);
  igstBal -= cgstFromIgst;
  cgstLiab -= cgstFromIgst;

  // Step 3: IGST ITC → SGST liability
  const sgstFromIgst = Math.min(igstBal, sgstLiab);
  igstBal -= sgstFromIgst;
  sgstLiab -= sgstFromIgst;

  // Step 4: CGST ITC → CGST liability
  const cgstFromCgst = Math.min(cgstBal, cgstLiab);
  cgstBal -= cgstFromCgst;
  cgstLiab -= cgstFromCgst;

  // Step 5: CGST ITC → IGST liability
  const igstFromCgst = Math.min(cgstBal, igstLiab);
  cgstBal -= igstFromCgst;
  igstLiab -= igstFromCgst;

  // Step 6: SGST ITC → SGST liability
  const sgstFromSgst = Math.min(sgstBal, sgstLiab);
  sgstBal -= sgstFromSgst;
  sgstLiab -= sgstFromSgst;

  // Step 7: SGST ITC → IGST liability
  const igstFromSgst = Math.min(sgstBal, igstLiab);
  sgstBal -= igstFromSgst;
  igstLiab -= igstFromSgst;

  return {
    igstPaid: igstFromIgst + igstFromCgst + igstFromSgst,
    cgstPaid: cgstFromIgst + cgstFromCgst,
    sgstPaid: sgstFromIgst + sgstFromSgst,
    cashToBeDepositedIgst: Math.max(0, igstLiab),
    cashToBeDepositedCgst: Math.max(0, cgstLiab),
    cashToBeDepositedSgst: Math.max(0, sgstLiab),
    remainingBalance: { igst: igstBal, cgst: cgstBal, sgst: sgstBal },
  };
}

// ── Blocked ITC (Section 17(5)) ───────────────────────────────────────────
const BLOCKED_ITC_CATEGORIES = new Set([
  "motor_vehicle",
  "food_and_beverage",
  "outdoor_catering",
  "health_services",
  "membership_club",
  "travel_benefits",
  "works_contract_immovable",
  "construction_immovable",
  "personal_consumption",
]);

export function isBlockedITC(itemCategory: string): boolean {
  return BLOCKED_ITC_CATEGORIES.has(itemCategory.toLowerCase().replace(/\s+/g, "_"));
}

// ── Reverse Charge Mechanism ──────────────────────────────────────────────
export interface RCMSupply {
  serviceCategory: string;
  isRegisteredSupplier: boolean;
}

const RCM_SERVICES: Record<string, string> = {
  "goods_transport_agency": "GTA providing services to registered persons",
  "legal_services": "Advocate services to registered business entity",
  "security_services": "Security personnel supply to registered person",
  "import_of_services": "Services from overseas supplier",
  "renting_of_motor_vehicle": "Renting non-AC contract carriage",
  "business_facilitator": "By a banking company",
};

export function checkRCMApplicability(supply: RCMSupply): {
  isRCM: boolean;
  description?: string;
} {
  const key = supply.serviceCategory.toLowerCase().replace(/\s+/g, "_");
  const desc = RCM_SERVICES[key];
  if (desc) return { isRCM: true, description: desc };
  return { isRCM: false };
}

// ── E-Invoice Eligibility ─────────────────────────────────────────────────
// Mandatory for org annual turnover > ₹5 Cr (as of Oct 2023)
const E_INVOICE_TURNOVER_THRESHOLD = 50000000; // ₹5 Cr

export function isEInvoiceRequired(annualTurnover: number): boolean {
  return annualTurnover >= E_INVOICE_TURNOVER_THRESHOLD;
}

// ── E-Way Bill Eligibility ────────────────────────────────────────────────
// Required for goods movement where consignment value > ₹50,000
const EWAY_BILL_THRESHOLD = 50000;

export function isEWayBillRequired(params: {
  isGoods: boolean;
  consignmentValue: number;
  isExemptedGoods?: boolean;
}): boolean {
  if (!params.isGoods || params.isExemptedGoods) return false;
  return params.consignmentValue > EWAY_BILL_THRESHOLD;
}

// ── HSN Summary (GSTR-1 Table 12) ─────────────────────────────────────────
// Table 12 is mandatory on every GSTR-1: turnover and tax aggregated by HSN/SAC
// code. The required minimum HSN digit length is driven by Annual Aggregate
// Turnover (AATO): a 4-digit minimum up to ₹5 crore, a 6-digit minimum above it.
// (The threshold value coincides with the e-invoice one but is a legally distinct
// rule, so it carries its own named constant.)
export const HSN_SIX_DIGIT_TURNOVER_THRESHOLD = 50000000; // ₹5 Cr

/** Minimum HSN digit length required for a taxpayer at the given AATO (rupees). */
export function hsnMinDigits(annualAggregateTurnover: number): 4 | 6 {
  return annualAggregateTurnover > HSN_SIX_DIGIT_TURNOVER_THRESHOLD ? 6 : 4;
}

/** One invoice line, reduced to the fields Table 12 aggregates. */
export interface HsnSummaryLine {
  hsnSacCode: string | null | undefined;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount?: number | null;
}

/** One GSTR-1 Table 12 (`hsn.data[]`) row — one per distinct HSN × rate. */
export interface HsnSummaryRow {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

/** An HSN code that fails the AATO-driven digit-length minimum. */
export interface HsnDigitViolation {
  hsn: string;
  digits: number;
  required: 4 | 6;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Aggregate invoice lines into the GSTR-1 Table 12 HSN summary — one row per
 * distinct HSN/SAC code × GST rate, summing quantity, taxable value and tax.
 * Lines with a missing HSN aggregate under an empty code so the digit validator
 * can surface them (rather than silently dropping them from the return).
 */
export function buildHsnSummary(lines: HsnSummaryLine[]): HsnSummaryRow[] {
  const byKey = new Map<
    string,
    {
      hsn: string;
      rt: number;
      desc: string;
      uqc: string;
      qty: number;
      txval: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }
  >();
  for (const ln of lines) {
    const hsn = (ln.hsnSacCode ?? "").trim();
    const rt = Number(ln.gstRate ?? 0);
    const key = `${hsn}|${rt}`;
    const agg = byKey.get(key) ?? {
      hsn,
      rt,
      desc: "",
      uqc: "",
      qty: 0,
      txval: 0,
      iamt: 0,
      camt: 0,
      samt: 0,
      csamt: 0,
    };
    if (!agg.desc && ln.description) agg.desc = ln.description.trim();
    if (!agg.uqc && ln.unit) agg.uqc = ln.unit.trim();
    agg.qty += Number(ln.quantity ?? 0);
    agg.txval += Number(ln.taxableValue ?? 0);
    agg.iamt += Number(ln.igstAmount ?? 0);
    agg.camt += Number(ln.cgstAmount ?? 0);
    agg.samt += Number(ln.sgstAmount ?? 0);
    agg.csamt += Number(ln.cessAmount ?? 0);
    byKey.set(key, agg);
  }
  return Array.from(byKey.values())
    .sort((a, b) => (a.hsn === b.hsn ? a.rt - b.rt : a.hsn.localeCompare(b.hsn)))
    .map((v, idx) => ({
      num: idx + 1,
      hsn_sc: v.hsn,
      desc: v.desc,
      uqc: v.uqc || "NA",
      qty: round2(v.qty),
      rt: v.rt,
      txval: round2(v.txval),
      iamt: round2(v.iamt),
      camt: round2(v.camt),
      samt: round2(v.samt),
      csamt: round2(v.csamt),
    }));
}

/**
 * Flag HSN codes in a summary that are shorter than the AATO-driven minimum
 * (an empty/missing code counts as 0 digits). Returns one violation per
 * offending HSN row so the caller can surface them before filing.
 */
export function findHsnDigitViolations(
  rows: HsnSummaryRow[],
  minDigits: 4 | 6,
): HsnDigitViolation[] {
  const violations: HsnDigitViolation[] = [];
  for (const r of rows) {
    const digits = r.hsn_sc.replace(/\s+/g, "").length;
    if (digits < minDigits) {
      violations.push({ hsn: r.hsn_sc, digits, required: minDigits });
    }
  }
  return violations;
}

// ── GSTR-2B Reconciliation ────────────────────────────────────────────────
export type ReconciliationStatus = "matched" | "mismatch" | "missing_in_2b" | "missing_in_books";

export interface GSTR2BLine {
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export interface BookInvoice {
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export interface ReconciliationLine {
  invoiceNumber: string;
  supplierGstin: string;
  status: ReconciliationStatus;
  bookValues?: BookInvoice;
  gstr2bValues?: GSTR2BLine;
  difference?: { taxableValue: number; igst: number; cgst: number; sgst: number };
}

export function reconcileGSTR2B(
  bookInvoices: BookInvoice[],
  gstr2bLines: GSTR2BLine[],
  tolerancePct: number = 0.01,
): ReconciliationLine[] {
  const results: ReconciliationLine[] = [];
  const gstr2bMap = new Map(gstr2bLines.map((l) => [`${l.supplierGstin}::${l.invoiceNumber}`, l]));
  const bookMap = new Map(bookInvoices.map((b) => [`${b.supplierGstin}::${b.invoiceNumber}`, b]));

  for (const book of bookInvoices) {
    const key = `${book.supplierGstin}::${book.invoiceNumber}`;
    const gstr = gstr2bMap.get(key);
    if (!gstr) {
      results.push({ invoiceNumber: book.invoiceNumber, supplierGstin: book.supplierGstin, status: "missing_in_2b", bookValues: book });
      continue;
    }
    const tol = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1) <= tolerancePct;
    if (tol(book.taxableValue, gstr.taxableValue) && tol(book.igst, gstr.igst) && tol(book.cgst, gstr.cgst) && tol(book.sgst, gstr.sgst)) {
      results.push({ invoiceNumber: book.invoiceNumber, supplierGstin: book.supplierGstin, status: "matched", bookValues: book, gstr2bValues: gstr });
    } else {
      results.push({
        invoiceNumber: book.invoiceNumber,
        supplierGstin: book.supplierGstin,
        status: "mismatch",
        bookValues: book,
        gstr2bValues: gstr,
        difference: {
          taxableValue: book.taxableValue - gstr.taxableValue,
          igst: book.igst - gstr.igst,
          cgst: book.cgst - gstr.cgst,
          sgst: book.sgst - gstr.sgst,
        },
      });
    }
  }

  for (const gstr of gstr2bLines) {
    const key = `${gstr.supplierGstin}::${gstr.invoiceNumber}`;
    if (!bookMap.has(key)) {
      results.push({ invoiceNumber: gstr.invoiceNumber, supplierGstin: gstr.supplierGstin, status: "missing_in_books", gstr2bValues: gstr });
    }
  }

  return results;
}

// ── GST Filing Calendar ───────────────────────────────────────────────────
export interface GSTFilingDue {
  returnType: string;
  period: string;
  dueDate: string;
  description: string;
}

export function getGSTFilingCalendar(month: number, year: number): GSTFilingDue[] {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const pad = (n: number) => String(n).padStart(2, "0");
  const periodStr = `${pad(month)}/${year}`;

  return [
    {
      returnType: "GSTR-1",
      period: periodStr,
      dueDate: `${pad(11)}/${pad(nextMonth)}/${nextYear}`,
      description: "Outward supplies return — due 11th of following month",
    },
    {
      returnType: "GSTR-3B",
      period: periodStr,
      dueDate: `${pad(20)}/${pad(nextMonth)}/${nextYear}`,
      description: "Summary return with self-assessment — due 20th of following month",
    },
    {
      returnType: "GSTR-2B",
      period: periodStr,
      dueDate: `${pad(14)}/${pad(nextMonth)}/${nextYear}`,
      description: "Auto-drafted ITC statement — available 14th of following month",
    },
  ];
}
