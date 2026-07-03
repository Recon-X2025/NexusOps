/**
 * Depreciation engine tests (Sprint 2.1).
 * Pure money-math; no DB. SLM + WDV, schedule tie-out, book value.
 */
import { describe, it, expect } from "vitest";
import {
  computePeriodDepreciation,
  generateDepreciationSchedule,
  deriveWdvRate,
  bookValueAfter,
} from "./depreciation";

describe("generateDepreciationSchedule — SLM", () => {
  it("charges an equal amount each year down to salvage", () => {
    // cost 100,000, salvage 10,000, life 5 → (100k-10k)/5 = 18,000/yr
    const s = generateDepreciationSchedule({
      cost: 100_000,
      salvageValue: 10_000,
      usefulLifeYears: 5,
      method: "SLM",
    });
    expect(s.periods).toHaveLength(5);
    expect(s.periods.every((p) => p.depreciation === 18_000)).toBe(true);
    expect(s.periods[0]!.openingBookValue).toBe(100_000);
    expect(s.periods[4]!.closingBookValue).toBe(10_000);
  });

  it("accumulates to exactly the depreciable base", () => {
    const s = generateDepreciationSchedule({
      cost: 100_000,
      salvageValue: 10_000,
      usefulLifeYears: 5,
    });
    const last = s.periods[s.periods.length - 1]!;
    expect(last.accumulatedDepreciation).toBe(90_000);
    expect(s.depreciableBase).toBe(90_000);
  });

  it("trues up the final period so closing book value lands on salvage despite rounding", () => {
    // (100000-1)/3 = 33333.0 → rounds to 33333 for the first two, final trued-up.
    const s = generateDepreciationSchedule({
      cost: 100_000,
      salvageValue: 1,
      usefulLifeYears: 3,
      method: "SLM",
    });
    expect(s.periods[2]!.closingBookValue).toBe(1);
    const sum = s.periods.reduce((a, p) => a + p.depreciation, 0);
    expect(sum).toBe(99_999);
  });

  it("defaults salvage to zero", () => {
    const s = generateDepreciationSchedule({ cost: 60_000, usefulLifeYears: 3 });
    expect(s.salvageValue).toBe(0);
    expect(s.periods[0]!.depreciation).toBe(20_000);
    expect(s.periods[2]!.closingBookValue).toBe(0);
  });
});

describe("generateDepreciationSchedule — WDV", () => {
  it("applies the rate to the declining opening book value", () => {
    // explicit 40% WDV on 100,000 → 40,000 / 24,000 / 14,400 ...
    const s = generateDepreciationSchedule({
      cost: 100_000,
      salvageValue: 0,
      usefulLifeYears: 3,
      method: "WDV",
      wdvRate: 0.4,
    });
    expect(s.periods[0]!.depreciation).toBe(40_000);
    expect(s.periods[1]!.depreciation).toBe(24_000);
    // final period trues up whatever remains to salvage (0)
    expect(s.periods[2]!.closingBookValue).toBe(0);
  });

  it("never depreciates below salvage", () => {
    const s = generateDepreciationSchedule({
      cost: 100_000,
      salvageValue: 30_000,
      usefulLifeYears: 5,
      method: "WDV",
      wdvRate: 0.5,
    });
    expect(s.periods.every((p) => p.closingBookValue >= 30_000)).toBe(true);
    expect(s.periods[s.periods.length - 1]!.closingBookValue).toBe(30_000);
  });

  it("derives the Schedule-II rate from cost/salvage/life", () => {
    // rate = 1 - (salvage/cost)^(1/life); 10k salvage on 100k over 5y
    const rate = deriveWdvRate(100_000, 10_000, 5);
    expect(rate).toBeCloseTo(1 - Math.pow(0.1, 1 / 5), 6);
    const s = generateDepreciationSchedule({
      cost: 100_000,
      salvageValue: 10_000,
      usefulLifeYears: 5,
      method: "WDV",
    });
    expect(s.rate).toBeCloseTo(rate, 6);
    expect(s.periods[s.periods.length - 1]!.closingBookValue).toBe(10_000);
  });

  it("uses a notional 5% residual for rate derivation when salvage is zero", () => {
    const rate = deriveWdvRate(100_000, 0, 5);
    expect(rate).toBeCloseTo(1 - Math.pow(0.05, 1 / 5), 6);
  });
});

describe("computePeriodDepreciation — incremental single-period charge", () => {
  it("SLM charges (cost-salvage)/life regardless of opening value", () => {
    const c = computePeriodDepreciation(
      { cost: 100_000, salvageValue: 10_000, usefulLifeYears: 5, method: "SLM" },
      82_000,
    );
    expect(c).toBe(18_000);
  });

  it("WDV charges opening × rate", () => {
    const c = computePeriodDepreciation(
      { cost: 100_000, salvageValue: 0, usefulLifeYears: 3, method: "WDV", wdvRate: 0.4 },
      60_000,
    );
    expect(c).toBe(24_000);
  });

  it("clamps the charge so book value never dips below salvage", () => {
    const c = computePeriodDepreciation(
      { cost: 100_000, salvageValue: 30_000, usefulLifeYears: 5, method: "WDV", wdvRate: 0.9 },
      35_000,
    );
    // 35,000 × 0.9 = 31,500 would breach salvage → clamp to 5,000
    expect(c).toBe(5_000);
  });

  it("returns 0 once fully depreciated to salvage", () => {
    const c = computePeriodDepreciation(
      { cost: 100_000, salvageValue: 10_000, usefulLifeYears: 5 },
      10_000,
    );
    expect(c).toBe(0);
  });
});

describe("bookValueAfter", () => {
  it("returns cost at year 0 and salvage at end of life", () => {
    const input = { cost: 100_000, salvageValue: 10_000, usefulLifeYears: 5, method: "SLM" as const };
    expect(bookValueAfter(input, 0)).toBe(100_000);
    expect(bookValueAfter(input, 2)).toBe(64_000); // 100k - 2×18k
    expect(bookValueAfter(input, 5)).toBe(10_000);
    expect(bookValueAfter(input, 99)).toBe(10_000); // clamped past life
  });
});
