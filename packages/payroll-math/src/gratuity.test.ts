/**
 * Gratuity engine tests (Sprint 1.4) — Payment of Gratuity Act, 1972.
 * Pure money-math; no DB.
 */
import { describe, it, expect } from "vitest";
import {
  computeGratuity,
  computeMonthlyGratuityAccrual,
  roundGratuityYears,
  GRATUITY_CEILING,
} from "./gratuity";

describe("computeGratuity (Payment of Gratuity Act 1972)", () => {
  it("applies the 15/26 × wages × years formula", () => {
    // 10 years, ₹26,000 Basic+DA → (15/26)*26000*10 = 150,000
    const g = computeGratuity({ lastDrawnBasicPlusDA: 26_000, completedYears: 10 });
    expect(g.eligible).toBe(true);
    expect(g.countedYears).toBe(10);
    expect(g.gratuity).toBe(150_000);
    expect(g.grossGratuity).toBe(150_000);
    expect(g.cappedAtCeiling).toBe(false);
  });

  it("rounds a trailing part-year of ≥ 6 months up, < 6 months down", () => {
    // 7y 6m → 8 counted years
    const up = computeGratuity({
      lastDrawnBasicPlusDA: 26_000,
      completedYears: 7,
      trailingMonths: 6,
    });
    expect(up.countedYears).toBe(8);
    // 7y 5m → 7 counted years
    const down = computeGratuity({
      lastDrawnBasicPlusDA: 26_000,
      completedYears: 7,
      trailingMonths: 5,
    });
    expect(down.countedYears).toBe(7);
  });

  it("enforces the 5-year minimum service (on completed years, not rounded)", () => {
    // 4y 8m: rounds to 5 for the formula, but 4 completed < 5 → ineligible
    const g = computeGratuity({
      lastDrawnBasicPlusDA: 30_000,
      completedYears: 4,
      trailingMonths: 8,
    });
    expect(g.eligible).toBe(false);
    expect(g.ineligibleReason).toBe("min-service");
    expect(g.gratuity).toBe(0);
  });

  it("waives the minimum on death / disablement", () => {
    const g = computeGratuity({
      lastDrawnBasicPlusDA: 30_000,
      completedYears: 2,
      waiveMinimumService: true,
    });
    expect(g.eligible).toBe(true);
    // (15/26)*30000*2 = 34,615 (rounded)
    expect(g.gratuity).toBe(Math.round((15 / 26) * 30_000 * 2));
  });

  it("caps the payout at the statutory ceiling (₹20L)", () => {
    // very high wages × long service exceeds the cap
    const g = computeGratuity({ lastDrawnBasicPlusDA: 500_000, completedYears: 30 });
    expect(g.grossGratuity).toBeGreaterThan(GRATUITY_CEILING);
    expect(g.gratuity).toBe(GRATUITY_CEILING);
    expect(g.cappedAtCeiling).toBe(true);
  });

  it("GRATUITY_CEILING is the 2018 amendment cap of ₹20,00,000", () => {
    expect(GRATUITY_CEILING).toBe(2_000_000);
  });
});

describe("roundGratuityYears", () => {
  it("floors completed years and rounds trailing ≥6m up", () => {
    expect(roundGratuityYears(5, 0)).toBe(5);
    expect(roundGratuityYears(5, 6)).toBe(6);
    expect(roundGratuityYears(5, 5)).toBe(5);
    expect(roundGratuityYears(5, 11)).toBe(6);
    expect(roundGratuityYears(0, 0)).toBe(0);
  });
});

describe("computeMonthlyGratuityAccrual", () => {
  it("provisions (15/26 × Basic+DA) / 12 per month", () => {
    // ₹26,000 → yearly (15/26)*26000 = 15,000 → /12 = 1,250
    expect(computeMonthlyGratuityAccrual(26_000)).toBe(1_250);
  });

  it("12 months of accrual ≈ one year of gratuity liability", () => {
    const monthly = computeMonthlyGratuityAccrual(26_000);
    const oneYearGratuity = computeGratuity({
      lastDrawnBasicPlusDA: 26_000,
      completedYears: 1,
      waiveMinimumService: true,
    }).gratuity;
    expect(monthly * 12).toBe(oneYearGratuity);
  });

  it("returns 0 for non-positive wages", () => {
    expect(computeMonthlyGratuityAccrual(0)).toBe(0);
    expect(computeMonthlyGratuityAccrual(-100)).toBe(0);
  });
});
