/**
 * Formatting shared by every generated PDF document (quotation, tax invoice).
 *
 * It lives in one module because the alternative is a copy per document, and the
 * two would drift — the quotation and the invoice for the same sale must print
 * the same number the same way.
 *
 * ── Two rules the whole surface depends on ──────────────────────────────────
 *
 * 1. "Rs." NOT "₹". PDFKit's standard 14 fonts are WinAnsi-encoded and have no
 *    U+20B9 glyph, so a rupee sign renders as a missing/garbled character.
 *    `payslip-pdf.ts:246` already prints "AMOUNT (Rs.)" for exactly this reason.
 *
 * 2. ASCII ONLY, for the same reason. An em-dash (U+2014) silently renders as
 *    blank space — the quotation's first draft printed "Intra-state supply
 *      CGST + SGST apply" with a hole where the dash should have been. If a glyph
 *    is not in the font, the document quietly loses it rather than failing.
 *
 * Otherwise this mirrors `formatStatementInr` (apps/web/src/lib/format-money.ts)
 * exactly — en-IN grouping, two decimals, `-0` guard. It is duplicated rather
 * than imported because that helper lives in `apps/web` and this runs in
 * `apps/api`, with no shared workspace between them today.
 */

/** `28850` → `"Rs. 28,850.00"`. Full figures, never an abbreviated "250K". */
export function formatPdfInr(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const safe = n === 0 ? 0 : n;
  const sign = safe < 0 ? "-" : "";
  return `${sign}Rs. ${Math.abs(safe).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * `12.5` → `"12.5%"`, `18` → `"18%"`, `2.5` → `"2.5%"`.
 * `toFixed(2)` was wrong here: a 5% line's half-rate printed as "2.50%".
 */
export function pctLabel(n: number): string {
  return `${Math.round(n * 100) / 100}%`;
}

/** ASCII placeholder for an absent value — see rule 2 above. */
export const EMPTY_CELL = "-";

export function formatPdfDate(d: Date | null | undefined): string {
  if (!d) return EMPTY_CELL;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** One row of a rate-wise GST breakup, as a GST document presents it. */
export interface RateGroup {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Group taxable value by GST rate for the rate-wise summary, then RECONCILE the
 * result against the authoritative stored aggregate. Returns null when the two
 * disagree by even a paisa, which makes the caller fall back to printing the
 * stored split alone.
 *
 * The point: a document that contradicts the ledger is worse than a document
 * with less detail on it. This never throws — a presentation flourish must not
 * be able to stop a document being produced.
 */
export function reconcileRateGroups(
  lines: Array<{ taxable: number; rate: number }>,
  stored: { taxableValue: number; taxTotal: number },
  isInterstate: boolean,
): RateGroup[] | null {
  if (lines.length === 0) return null;

  const byRate = new Map<number, number>();
  for (const l of lines) {
    if (!(l.taxable > 0)) continue;
    byRate.set(l.rate, round2((byRate.get(l.rate) ?? 0) + l.taxable));
  }
  if (byRate.size === 0) return null;

  const groups: RateGroup[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, taxable]) => {
      const tax = round2(taxable * (rate / 100));
      const half = round2(tax / 2);
      return isInterstate
        ? { rate, taxable, cgst: 0, sgst: 0, igst: tax }
        : { rate, taxable, cgst: half, sgst: round2(tax - half), igst: 0 };
    });

  const sum = (f: (g: RateGroup) => number): number => round2(groups.reduce((a, g) => a + f(g), 0));
  if (Math.abs(sum((g) => g.taxable) - stored.taxableValue) > 0.01) return null;
  const derivedTax = round2(sum((g) => g.cgst) + sum((g) => g.sgst) + sum((g) => g.igst));
  if (Math.abs(derivedTax - stored.taxTotal) > 0.01) return null;

  return groups;
}
