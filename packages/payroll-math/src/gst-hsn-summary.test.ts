/**
 * GSTR-1 HSN summary (Table 12) — pure money-math tests. No DB.
 *
 * Fairness checks for C7 item 1:
 *   - the AATO digit rule: 4 up to ₹5cr, 6 above (boundary at exactly ₹5cr);
 *   - HSN aggregation groups turnover + tax by HSN × rate;
 *   - digit validation flags HSN codes shorter than the AATO-driven minimum.
 * Red-before: none of buildHsnSummary/hsnMinDigits/findHsnDigitViolations existed.
 */
import { describe, it, expect } from "vitest";
import {
  hsnMinDigits,
  buildHsnSummary,
  findHsnDigitViolations,
  HSN_SIX_DIGIT_TURNOVER_THRESHOLD,
  type HsnSummaryLine,
} from "./gst-engine";

describe("hsnMinDigits — AATO-driven digit rule", () => {
  it("requires 4 digits up to ₹5 crore (inclusive)", () => {
    expect(hsnMinDigits(0)).toBe(4);
    expect(hsnMinDigits(10_00_000)).toBe(4);
    expect(hsnMinDigits(HSN_SIX_DIGIT_TURNOVER_THRESHOLD)).toBe(4); // exactly ₹5cr → 4
    expect(HSN_SIX_DIGIT_TURNOVER_THRESHOLD).toBe(50_000_000);
  });

  it("requires 6 digits above ₹5 crore", () => {
    expect(hsnMinDigits(HSN_SIX_DIGIT_TURNOVER_THRESHOLD + 1)).toBe(6);
    expect(hsnMinDigits(12_00_00_000)).toBe(6); // ₹12 crore
  });
});

describe("buildHsnSummary — aggregate by HSN × rate", () => {
  const lines: HsnSummaryLine[] = [
    // two lines, same HSN + rate → collapse
    { hsnSacCode: "998314", description: "Consulting", unit: "NOS", quantity: 1, taxableValue: 1000, gstRate: 18, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 },
    { hsnSacCode: "998314", description: "Consulting", unit: "NOS", quantity: 2, taxableValue: 2000, gstRate: 18, cgstAmount: 180, sgstAmount: 180, igstAmount: 0 },
    // same HSN, different rate → separate row
    { hsnSacCode: "998314", description: "Consulting", unit: "NOS", quantity: 1, taxableValue: 500, gstRate: 5, cgstAmount: 12.5, sgstAmount: 12.5, igstAmount: 0 },
    // different HSN, inter-state (IGST)
    { hsnSacCode: "8471", description: "Laptop", unit: "NOS", quantity: 3, taxableValue: 9000, gstRate: 18, cgstAmount: 0, sgstAmount: 0, igstAmount: 1620 },
  ];

  it("collapses same HSN+rate, splits different rates, and sums tax", () => {
    const rows = buildHsnSummary(lines);
    // 998314@18, 998314@5, 8471@18 → 3 rows
    expect(rows).toHaveLength(3);

    const c18 = rows.find((r) => r.hsn_sc === "998314" && r.rt === 18)!;
    expect(c18.txval).toBe(3000);
    expect(c18.camt).toBe(270);
    expect(c18.samt).toBe(270);
    expect(c18.qty).toBe(3);

    const c5 = rows.find((r) => r.hsn_sc === "998314" && r.rt === 5)!;
    expect(c5.txval).toBe(500);
    expect(c5.camt).toBe(12.5);

    const laptop = rows.find((r) => r.hsn_sc === "8471")!;
    expect(laptop.txval).toBe(9000);
    expect(laptop.iamt).toBe(1620);
    expect(laptop.uqc).toBe("NOS");
  });

  it("assigns sequential num and defaults an absent unit to NA", () => {
    const rows = buildHsnSummary([
      { hsnSacCode: "1001", taxableValue: 100, gstRate: 5, cgstAmount: 2.5, sgstAmount: 2.5, igstAmount: 0 },
    ]);
    expect(rows[0]!.num).toBe(1);
    expect(rows[0]!.uqc).toBe("NA");
  });
});

describe("findHsnDigitViolations — enforce the minimum", () => {
  const rows = buildHsnSummary([
    { hsnSacCode: "8471", taxableValue: 100, gstRate: 18, cgstAmount: 0, sgstAmount: 0, igstAmount: 18 },   // 4 digits
    { hsnSacCode: "998314", taxableValue: 100, gstRate: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0 },  // 6 digits
    { hsnSacCode: "99", taxableValue: 100, gstRate: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0 },      // 2 digits (too short)
    { hsnSacCode: null, taxableValue: 100, gstRate: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0 },       // missing
  ]);

  it("at a 4-digit minimum (AATO ≤ ₹5cr), flags the 2-digit and the missing HSN only", () => {
    const v = findHsnDigitViolations(rows, hsnMinDigits(10_00_000));
    expect(v.map((x) => x.hsn).sort()).toEqual(["", "99"]);
    expect(v.every((x) => x.required === 4)).toBe(true);
  });

  it("at a 6-digit minimum (AATO > ₹5cr), the 4-digit HSN is ALSO flagged", () => {
    const v = findHsnDigitViolations(rows, hsnMinDigits(12_00_00_000));
    // 8471 (4), 99 (2), "" (0) fail; 998314 (6) passes.
    expect(v.map((x) => x.hsn).sort()).toEqual(["", "8471", "99"]);
    expect(v.every((x) => x.required === 6)).toBe(true);
  });
});
