import { describe, it, expect } from "vitest";
import { computeStructureArrears, arrearsPeriodsCovered } from "./arrears";

describe("computeStructureArrears", () => {
  it("sums the per-period shortfall of a backdated rise", () => {
    const r = computeStructureArrears([
      { month: 4, year: 2026, paidGross: 50_000, revisedGross: 60_000 },
      { month: 5, year: 2026, paidGross: 50_000, revisedGross: 60_000 },
    ]);
    expect(r.totalDelta).toBe(20_000);
    expect(r.payable).toBe(20_000);
    expect(r.recovery).toBe(0);
    expect(r.hasRecovery).toBe(false);
    expect(r.periods.map((p) => p.delta)).toEqual([10_000, 10_000]);
  });

  it("returns zeroes for no covered periods — a revision effective this month is not an error", () => {
    const r = computeStructureArrears([]);
    expect(r.totalDelta).toBe(0);
    expect(r.payable).toBe(0);
    expect(r.periods).toEqual([]);
    expect(r.hasRecovery).toBe(false);
  });

  it("reports a downward revision as a recovery, never as negative payable", () => {
    const r = computeStructureArrears([
      { month: 4, year: 2026, paidGross: 60_000, revisedGross: 50_000 },
    ]);
    expect(r.totalDelta).toBe(-10_000);
    expect(r.payable).toBe(0);
    expect(r.recovery).toBe(10_000);
    expect(r.hasRecovery).toBe(true);
  });

  it("flags a period that fell even when the net is positive — a fall must not net away silently", () => {
    const r = computeStructureArrears([
      { month: 4, year: 2026, paidGross: 50_000, revisedGross: 65_000 },
      { month: 5, year: 2026, paidGross: 50_000, revisedGross: 48_000 },
    ]);
    expect(r.totalDelta).toBe(13_000);
    expect(r.payable).toBe(13_000);
    expect(r.hasRecovery).toBe(true);
  });

  it("rounds each period before summing, so the total reconciles line by line", () => {
    const r = computeStructureArrears([
      { month: 4, year: 2026, paidGross: 50_000.4, revisedGross: 60_000.9 },
      { month: 5, year: 2026, paidGross: 50_000.4, revisedGross: 60_000.9 },
    ]);
    // Each delta is 10_000.5 → rounds to 10_001; the sum of visible figures is 20_002,
    // NOT round(20_001) = 20_001.
    expect(r.periods.map((p) => p.delta)).toEqual([10_001, 10_001]);
    expect(r.totalDelta).toBe(20_002);
  });

  it("honours the LOP basis it is given — arrears never pays back deducted LOP", () => {
    // May had 3 LOP days of 31. Paid gross was pro-rated; the revised figure must be
    // pro-rated on the same basis, so the delta is the RISE only, not the rise + the LOP.
    const factor = 28 / 31;
    const r = computeStructureArrears([
      {
        month: 5,
        year: 2026,
        paidGross: Math.round(50_000 * factor),
        revisedGross: Math.round(60_000 * factor),
        paidDays: 28,
        daysInMonth: 31,
      },
    ]);
    // ~9_032, decisively not the full-month 10_000, and nowhere near 60_000 − 45_161.
    expect(r.payable).toBe(Math.round(60_000 * factor) - Math.round(50_000 * factor));
    expect(r.payable).toBeLessThan(10_000);
    expect(r.periods[0]!.paidDays).toBe(28);
  });
});

describe("arrearsPeriodsCovered", () => {
  it("covers effective month through the month BEFORE the paid-in period", () => {
    // Effective 1 Apr 2026, paid in Jul 2026 → Apr, May, Jun. July is excluded because
    // the July run already prices the revised structure.
    expect(arrearsPeriodsCovered(new Date(2026, 3, 1), 7, 2026)).toEqual([
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
    ]);
  });

  it("treats a mid-month effective date as covering that whole month", () => {
    expect(arrearsPeriodsCovered(new Date(2026, 3, 17), 6, 2026)).toEqual([
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
    ]);
  });

  it("returns nothing when the revision is not backdated", () => {
    expect(arrearsPeriodsCovered(new Date(2026, 6, 1), 7, 2026)).toEqual([]);
    // Effective AFTER the paid-in period covers nothing either.
    expect(arrearsPeriodsCovered(new Date(2026, 8, 1), 7, 2026)).toEqual([]);
  });

  it("reads LOCAL calendar fields, matching versionHasPayslips and the structure resolver", () => {
    // A structure effective 1 Jul stored at local midnight is 30 Jun 18:30Z in IST. Reading UTC
    // fields would yield June and propose a month of arrears that is not owed.
    expect(arrearsPeriodsCovered(new Date(2026, 6, 1), 7, 2026)).toEqual([]);
  });

  it("crosses a year boundary", () => {
    expect(arrearsPeriodsCovered(new Date(2025, 10, 1), 2, 2026)).toEqual([
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
    ]);
  });

  it("is bounded — a nonsense effective date cannot spin", () => {
    const out = arrearsPeriodsCovered(new Date(1900, 0, 1), 1, 2026);
    expect(out.length).toBeLessThanOrEqual(120);
  });
});
