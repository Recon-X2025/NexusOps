/**
 * ESI six-month contribution-period rule (C3, CA-ruled) — pure money-math tests.
 *
 * The rule is ASYMMETRIC:
 *   ENTRY  — assessed EVERY month; a non-member joins the moment eligibility wages
 *            fall to/under ₹21,000 (not at a boundary).
 *   EXIT   — assessed ONLY at a boundary (1 Apr / 1 Oct); a member is retained for
 *            the rest of the period on ACTUAL uncapped gross.
 * The eligibility threshold uses the FULL-MONTH pay scale (overtime excluded, a
 * part-month joiner grossed up); the contribution is on actual earned gross.
 */
import { describe, it, expect } from "vitest";
import { computeESI } from "./statutory-deductions";

const E = 0.0075, R = 0.0325;
// monthInFY: 1 = April (boundary), 3 = June (mid), 7 = October (boundary)

describe("ESI six-month contribution period", () => {
  it("CASE 1 (retention) — member at ₹19k in April stays a member at ₹25k in June, on ₹25k", () => {
    const apr = computeESI(19000, undefined, { monthInFY: 1 });
    expect(apr.memberForPeriod).toBe(true);
    const jun = computeESI(25000, undefined, { monthInFY: 3, memberAtPeriodStart: true });
    expect(jun.isApplicable).toBe(true);
    expect(jun.employeeESI).toBe(Math.round(25000 * E)); // on actual gross, not capped, not 0
    expect(jun.employerESI).toBe(Math.round(25000 * R));
  });

  it("CASE 2 (exit at boundary) — a member at ₹25k on 1 October exits, no contribution", () => {
    const oct = computeESI(25000, undefined, { monthInFY: 7, memberAtPeriodStart: true });
    expect(oct.isApplicable).toBe(false);
    expect(oct.employeeESI).toBe(0);
  });

  it("CASE 3 (ENTRY, corrected) — non-member at ₹25k in April JOINS in June when gross falls to ₹19k", () => {
    const apr = computeESI(25000, undefined, { monthInFY: 1 });
    expect(apr.memberForPeriod).toBe(false);
    // June: entry is assessed monthly — joins THIS month, not at the next boundary.
    const jun = computeESI(19000, undefined, { monthInFY: 3, memberAtPeriodStart: false });
    expect(jun.isApplicable).toBe(true);
    expect(jun.employeeESI).toBe(Math.round(19000 * E));
  });

  it("CASE 4 (boundary join) — gross below the ceiling on 1 October becomes a member", () => {
    const oct = computeESI(19000, undefined, { monthInFY: 7, memberAtPeriodStart: false });
    expect(oct.isApplicable).toBe(true);
  });

  it("a non-member stays out while eligibility wages remain above the ceiling mid-period", () => {
    const jun = computeESI(25000, undefined, { monthInFY: 3, memberAtPeriodStart: false });
    expect(jun.isApplicable).toBe(false);
    expect(jun.employeeESI).toBe(0);
  });

  it("MID-MONTH JOINER — assessed on grossed-up scale, not the prorated fragment", () => {
    // Joined on the 20th: actual earned ₹14,000 (under ceiling) but full-month scale
    // ₹28,000 (over ceiling). Eligibility uses the scale → EXCLUDED.
    const r = computeESI(14000, undefined, { monthInFY: 3, memberAtPeriodStart: null, eligibilityGross: 28000 });
    expect(r.isApplicable).toBe(false);
    expect(r.employeeESI).toBe(0);
  });

  it("MID-MONTH JOINER — a genuine low earner joins part-month; contribution on ACTUAL earned gross", () => {
    // Grossed-up scale ₹18,000 (under ceiling) → member; earned only ₹9,000 that month.
    const r = computeESI(9000, undefined, { monthInFY: 3, memberAtPeriodStart: null, eligibilityGross: 18000 });
    expect(r.isApplicable).toBe(true);
    expect(r.employeeESI).toBe(Math.round(9000 * E)); // on actual earned, not the scale
  });

  it("flags ONLY a mid-period above-ceiling employee with no membership history (retention unconfirmable)", () => {
    const above = computeESI(25000, undefined, { monthInFY: 3, memberAtPeriodStart: null });
    expect(above.memberStateUnknown).toBe(true);
    expect(above.isApplicable).toBe(false); // defaulted to non-member, flagged for boundary verify
    const below = computeESI(19000, undefined, { monthInFY: 3, memberAtPeriodStart: null });
    expect(below.memberStateUnknown).toBe(false); // below ceiling → definite entry, no approximation
    expect(below.isApplicable).toBe(true);
  });

  it("with no period context, falls back to the month-by-month ceiling test (legacy callers)", () => {
    expect(computeESI(20000).isApplicable).toBe(true);
    expect(computeESI(25000).isApplicable).toBe(false);
    expect(computeESI(25000, 27000).isApplicable).toBe(true);
  });
});
