/**
 * HIGH regression: Form 16 (Part B) must take the standard deduction and taxable
 * income from computeTax — the same engine that produces the printed tax — not a
 * hardcoded ₹50,000. The constant was wrong for the NEW regime (₹75,000 for
 * FY2025-26) and the hand-rolled taxable income disagreed with the basis the
 * printed tax was computed on.
 */
import { describe, it, expect } from "vitest";
import { buildForm16Input } from "../lib/india/form16-aggregator";

const slip = (over: Record<string, unknown> = {}) =>
  ({
    grossEarnings: "100000",
    basic: "50000",
    hra: "20000",
    specialAllowance: "0",
    lta: "0",
    pfEmployee: "0",
    professionalTax: "200",
    tds: "0",
    ...over,
  }) as never;

const build = (regime: "old" | "new") =>
  buildForm16Input({
    org: { name: "Org", settings: {} } as never,
    employee: { name: "Emp", pan: "ABCDE1234F", title: "Engineer", taxRegime: regime } as never,
    fySlips: Array.from({ length: 12 }, () => slip()),
    financialYear: "2025-2026",
  });

describe("Form 16 Part B sources deductions from the engine (HIGH regression)", () => {
  it("uses the NEW-regime ₹75,000 standard deduction, not a hardcoded ₹50,000", () => {
    expect(build("new").standardDeduction).toBe(75_000);
  });

  it("uses the OLD-regime ₹50,000 standard deduction", () => {
    expect(build("old").standardDeduction).toBe(50_000);
  });

  it("prints a taxable income consistent with the engine (net − standard deduction basis)", () => {
    // grossSalary = 12 x 100000 = 12,00,000; NEW regime std deduction 75,000;
    // no chapter-VI-A, PT not deductible under NEW → taxable = 11,25,000.
    expect(build("new").taxableIncome).toBe(1_125_000);
  });
});
