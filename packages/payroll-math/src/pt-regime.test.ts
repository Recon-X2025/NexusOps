/**
 * HIGH regression: professional tax is an income-tax deduction ONLY under the
 * OLD regime. computeTax added it unconditionally, so the default NEW regime
 * deducted it too, lowering taxable income and under-withholding TDS.
 */
import { describe, it, expect } from "vitest";
import { computeTax, type EmployeeTaxProfile } from "./tax-engine";

const base: EmployeeTaxProfile = {
  regime: "NEW",
  annualCTC: 1_200_000,
  basicMonthly: 50_000,
  hraMonthly: 20_000,
  specialAllowance: 0,
  lta: 0,
  section80C: 0,
  section80D: 0,
  section80CCD1B: 0,
  section80TTA: 0,
  section24b: 0,
  hraExemption: 0,
  otherExemptions: 0,
  employeePFMonthly: 0,
  employerPFMonthly: 0,
  professionalTax: 2_400,
  joiningMonth: 1,
  monthsInFY: 12,
  previousEmployerIncome: 0,
  previousEmployerTDS: 0,
};

const mk = (regime: "OLD" | "NEW", pt: number) => computeTax({ ...base, regime, professionalTax: pt });

describe("professional tax is deductible only under the OLD regime (HIGH regression)", () => {
  it("does NOT reduce taxable income under the NEW regime", () => {
    const withPt = mk("NEW", 2_400);
    const withoutPt = mk("NEW", 0);
    // Pre-fix these differed by 2,400 (PT wrongly deducted under NEW).
    expect(withPt.taxableIncome).toBe(withoutPt.taxableIncome);
  });

  it("still reduces taxable income by the PT amount under the OLD regime", () => {
    const withPt = mk("OLD", 2_400);
    const withoutPt = mk("OLD", 0);
    expect(withoutPt.taxableIncome - withPt.taxableIncome).toBe(2_400);
  });
});
