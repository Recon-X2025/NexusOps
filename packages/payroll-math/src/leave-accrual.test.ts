/**
 * Leave accrual engine tests (Sprint 1.5). Pure day/money-math; no DB.
 */
import { describe, it, expect } from "vitest";
import {
  computeMonthlyLeaveAccrual,
  computeCarryForward,
  computeLeaveEncashment,
  roundDays,
  type LeavePolicyConfig,
} from "./leave-accrual";

const policy: LeavePolicyConfig = {
  annualEntitlementDays: 18,
  maxCarryForwardDays: 30,
  encashable: true,
};

describe("computeMonthlyLeaveAccrual", () => {
  it("spreads the annual entitlement evenly across 12 months", () => {
    // 18/12 = 1.5 days/month
    expect(computeMonthlyLeaveAccrual(policy)).toBe(1.5);
  });

  it("uses an explicit monthly rate when configured", () => {
    expect(computeMonthlyLeaveAccrual({ ...policy, monthlyAccrualDays: 2 })).toBe(2);
  });

  it("pro-rates by days worked in the month", () => {
    // 1.5 × (15/30) = 0.75
    expect(
      computeMonthlyLeaveAccrual(policy, { daysWorked: 15, daysInMonth: 30 }),
    ).toBe(0.8); // 0.75 rounds to nearest 0.1 → 0.8
  });

  it("clamps the worked fraction to [0,1]", () => {
    expect(
      computeMonthlyLeaveAccrual(policy, { daysWorked: 40, daysInMonth: 30 }),
    ).toBe(1.5);
    expect(
      computeMonthlyLeaveAccrual(policy, { daysWorked: 0, daysInMonth: 30 }),
    ).toBe(0);
  });
});

describe("computeCarryForward", () => {
  it("carries the whole balance when under the cap", () => {
    const r = computeCarryForward(12, policy);
    expect(r.carriedForward).toBe(12);
    expect(r.lapsed).toBe(0);
  });

  it("caps carry-forward and lapses the excess", () => {
    const r = computeCarryForward(45, policy); // cap 30
    expect(r.carriedForward).toBe(30);
    expect(r.lapsed).toBe(15);
  });

  it("handles a zero-cap policy (use-it-or-lose-it)", () => {
    const r = computeCarryForward(10, { ...policy, maxCarryForwardDays: 0 });
    expect(r.carriedForward).toBe(0);
    expect(r.lapsed).toBe(10);
  });

  it("treats a negative balance as zero", () => {
    const r = computeCarryForward(-5, policy);
    expect(r.carriedForward).toBe(0);
    expect(r.lapsed).toBe(0);
  });
});

describe("computeLeaveEncashment", () => {
  it("values unused days at (Basic+DA)/26 by default", () => {
    // 10 days × (26000/26 = 1000) = 10,000
    const r = computeLeaveEncashment(10, 26_000);
    expect(r.perDayWage).toBe(1_000);
    expect(r.encashableDays).toBe(10);
    expect(r.amount).toBe(10_000);
  });

  it("accepts a direct per-day wage", () => {
    const r = computeLeaveEncashment(5, 1_200, { perDayIsWage: true });
    expect(r.perDayWage).toBe(1_200);
    expect(r.amount).toBe(6_000);
  });

  it("returns zero when not encashable or nothing to encash", () => {
    expect(computeLeaveEncashment(10, 26_000, { encashable: false }).amount).toBe(0);
    expect(computeLeaveEncashment(0, 26_000).amount).toBe(0);
    expect(computeLeaveEncashment(10, 0).amount).toBe(0);
  });
});

describe("roundDays", () => {
  it("rounds to one decimal", () => {
    expect(roundDays(1.25)).toBe(1.3);
    expect(roundDays(1.24)).toBe(1.2);
    expect(roundDays(1)).toBe(1);
  });
});
