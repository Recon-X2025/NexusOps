/**
 * ESI contribution-period boundary helper (C3) — pure, no DB.
 *
 * `esiContributionPeriodStart` decides which six-month period (1 Apr / 1 Oct) a
 * calendar month belongs to, so the run knows whether an employee's stored ESI
 * membership is for the current period (carry it) or stale (re-assess).
 */
import { describe, it, expect } from "vitest";
import { esiContributionPeriodStart } from "../services/payroll-run-aggregates";

describe("esiContributionPeriodStart", () => {
  it("Apr–Sep map to 1 April of that year", () => {
    expect(esiContributionPeriodStart(4, 2026)).toEqual(new Date(2026, 3, 1));
    expect(esiContributionPeriodStart(6, 2026)).toEqual(new Date(2026, 3, 1));
    expect(esiContributionPeriodStart(9, 2026)).toEqual(new Date(2026, 3, 1));
  });

  it("Oct–Dec map to 1 October of that year", () => {
    expect(esiContributionPeriodStart(10, 2026)).toEqual(new Date(2026, 9, 1));
    expect(esiContributionPeriodStart(12, 2026)).toEqual(new Date(2026, 9, 1));
  });

  it("Jan–Mar map to 1 October of the PREVIOUS year (same Oct–Mar period)", () => {
    expect(esiContributionPeriodStart(1, 2027)).toEqual(new Date(2026, 9, 1));
    expect(esiContributionPeriodStart(3, 2027)).toEqual(new Date(2026, 9, 1));
  });
});
