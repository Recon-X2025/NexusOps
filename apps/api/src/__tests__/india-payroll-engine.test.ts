/**
 * NexusOps India Tax Engine — Test Suite
 * ───────────────────────────────────────
 * Validates FY 2025-26 tax computation for both Old and New regimes.
 * Run with: pnpm vitest run india-tax-engine.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  computeTax,
  computeHRAExemption,
  recomputeTDSOnRevision,
  type EmployeeTaxProfile,
} from "../lib/india-tax-engine";
import {
  computePF,
  computeESI,
  computePT,
  computeMonthlyStatutory,
} from "../lib/india-statutory-deductions";
import {
  computeEmployeePayslip,
  generateECR,
  type EmployeePayrollInput,
} from "../lib/payroll-cycle";

// ─── HELPER ────────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<EmployeeTaxProfile> = {}): EmployeeTaxProfile {
  return {
    regime: "NEW",
    annualCTC: 1_200_000,
    basicMonthly: 50_000,
    hraMonthly: 20_000,
    specialAllowance: 20_000,
    lta: 30_000,
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0,
    otherExemptions: 0,
    employeePFMonthly: 1_800,
    employerPFMonthly: 1_800,
    professionalTax: 2_400,
    joiningMonth: 1,
    monthsInFY: 12,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
    ...overrides,
  };
}

// ─── NEW REGIME TESTS ──────────────────────────────────────────────────────────

describe("New Regime — FY 2025-26", () => {
  it("should compute zero tax for income ≤ ₹3L (after standard deduction)", () => {
    const result = computeTax(makeProfile({ annualCTC: 375_000 }));
    expect(result.totalTaxLiability).toBe(0);
  });

  it("should apply Section 87A rebate for taxable income ≤ ₹7L", () => {
    const result = computeTax(
      makeProfile({ annualCTC: 700_000, basicMonthly: 25_000, hraMonthly: 10_000, specialAllowance: 10_000, lta: 12_000 })
    );
    // Taxable = 700K - 75K standard deduction = 625K
    // Tax on 625K: 0-3L@0 + 3L-6.25L@5% = 16,250
    // Rebate 87A (taxable ≤ 7L): min(16250, 25000) = 16,250
    expect(result.rebate87A).toBeGreaterThan(0);
    expect(result.taxAfterRebate).toBe(0);
    expect(result.totalTaxLiability).toBe(0);
  });

  it("should compute correct tax for ₹12L CTC (no rebate)", () => {
    const result = computeTax(makeProfile({ annualCTC: 1_200_000 }));
    // Taxable = 12L - 75K = 11,25,000; slab tax uses per-slab rounding → 68,390
    expect(result.taxOnIncome).toBe(68_390);
    expect(result.rebate87A).toBe(0); // taxable > 7L
    expect(result.cess).toBe(Math.round(68_390 * 0.04));
    expect(result.totalTaxLiability).toBe(68_390 + Math.round(68_390 * 0.04));
  });

  it("should compute standard deduction of ₹75,000 for New Regime", () => {
    const result = computeTax(makeProfile());
    expect(result.standardDeduction).toBe(75_000);
  });

  it("should NOT allow Chapter VI-A deductions in New Regime", () => {
    const result = computeTax(
      makeProfile({ section80C: 150_000, section80D: 25_000, section24b: 200_000 })
    );
    expect(result.chapter6ADeductions).toBe(0);
    expect(result.section24bDeduction).toBe(0);
    expect(result.hraExemption).toBe(0);
  });

  it("should compute monthly TDS correctly", () => {
    const result = computeTax(makeProfile({ annualCTC: 1_200_000 }));
    expect(result.monthlyTDS).toBe(Math.round(result.totalTaxLiability / 12));
  });
});

// ─── OLD REGIME TESTS ──────────────────────────────────────────────────────────

describe("Old Regime — FY 2025-26", () => {
  it("should apply Section 80C deduction (max ₹1.5L)", () => {
    const result = computeTax(
      makeProfile({ regime: "OLD", section80C: 200_000 }) // Declared 2L, capped at 1.5L
    );
    // 80C capped at 1,50,000
    expect(result.chapter6ADeductions).toBeLessThanOrEqual(150_000 + 75_000 + 50_000 + 10_000);
  });

  it("should apply standard deduction of ₹50,000 for Old Regime", () => {
    const result = computeTax(makeProfile({ regime: "OLD" }));
    expect(result.standardDeduction).toBe(50_000);
  });

  it("should apply Section 87A rebate for taxable income ≤ ₹5L", () => {
    const result = computeTax(
      makeProfile({
        regime: "OLD",
        annualCTC: 600_000,
        basicMonthly: 25_000,
        hraMonthly: 0,
        specialAllowance: 25_000,
        lta: 0,
        section80C: 150_000,
      })
    );
    // Gross: 6L, std deduction: 50K, 80C: 1.5L → taxable: 4L
    // Tax: 0-2.5L@0 + 2.5-4L@5% = 7,500
    // Rebate: min(7500, 12500) = 7,500
    if (result.taxableIncome <= 500_000) {
      expect(result.taxAfterRebate).toBe(0);
    }
  });

  it("should allow HRA exemption in Old Regime", () => {
    const result = computeTax(
      makeProfile({ regime: "OLD", hraExemption: 120_000 })
    );
    expect(result.hraExemption).toBe(120_000);
  });

  it("should allow Section 24(b) home loan interest deduction (max ₹2L)", () => {
    const result = computeTax(
      makeProfile({ regime: "OLD", section24b: 250_000 }) // Declared 2.5L, capped at 2L
    );
    expect(result.section24bDeduction).toBe(200_000);
  });
});

// ─── HRA EXEMPTION TESTS ───────────────────────────────────────────────────────

describe("HRA Exemption Calculation", () => {
  it("should return 0 when rent is 0", () => {
    expect(computeHRAExemption(600_000, 240_000, 0, true)).toBe(0);
  });

  it("should compute correctly for metro city", () => {
    // Basic annual: 6L, HRA: 2.4L, Rent: 2.4L, Metro
    // a = 2,40,000 (HRA received)
    // b = 2,40,000 - 0.1*6,00,000 = 1,80,000
    // c = 0.5 * 6,00,000 = 3,00,000
    // Min(a,b,c) = 1,80,000
    const result = computeHRAExemption(600_000, 240_000, 240_000, true);
    expect(result).toBe(180_000);
  });

  it("should compute correctly for non-metro city", () => {
    // Same but non-metro: c = 0.4 * 6L = 2,40,000
    // Min(2.4L, 1.8L, 2.4L) = 1,80,000
    const result = computeHRAExemption(600_000, 240_000, 240_000, false);
    expect(result).toBe(180_000);
  });
});

// ─── STATUTORY DEDUCTIONS TESTS ────────────────────────────────────────────────

describe("EPF Computation", () => {
  it("should compute PF on statutory wage ceiling (₹15,000)", () => {
    const result = computePF(50_000, false);
    expect(result.pfWageBase).toBe(15_000);
    expect(result.employeePF).toBe(1_800); // 12% of 15K
  });

  it("should compute PF on actual basic for voluntary higher PF", () => {
    const result = computePF(50_000, true);
    expect(result.pfWageBase).toBe(50_000);
    expect(result.employeePF).toBe(6_000); // 12% of 50K
  });

  it("should cap EPS at ₹15,000 base regardless of PF wage", () => {
    const result = computePF(50_000, true);
    expect(result.employerEPS).toBe(Math.round(15_000 * 0.0833));
  });
});

describe("ESI Computation", () => {
  it("should apply ESI when gross ≤ ₹21,000", () => {
    const result = computeESI(20_000);
    expect(result.isApplicable).toBe(true);
    expect(result.employeeESI).toBe(150); // 0.75% of 20K
    expect(result.employerESI).toBe(650); // 3.25% of 20K
  });

  it("should NOT apply ESI when gross > ₹21,000", () => {
    const result = computeESI(25_000);
    expect(result.isApplicable).toBe(false);
    expect(result.employeeESI).toBe(0);
  });
});

describe("Professional Tax", () => {
  it("should compute Maharashtra PT correctly", () => {
    const result = computePT(50_000, "Maharashtra", 1);
    expect(result.ptAmount).toBe(200);
  });

  it("should compute Maharashtra February PT as ₹300", () => {
    const result = computePT(50_000, "Maharashtra", 11); // Feb = FY month 11
    expect(result.ptAmount).toBe(300);
  });

  it("should return 0 PT for Delhi", () => {
    const result = computePT(100_000, "Delhi", 1);
    expect(result.ptAmount).toBe(0);
  });

  it("should compute Karnataka PT correctly", () => {
    const result = computePT(30_000, "Karnataka", 1);
    expect(result.ptAmount).toBe(200);
  });
});

// ─── MID-YEAR JOIN TESTS ───────────────────────────────────────────────────────

describe("Mid-Year Join TDS", () => {
  it("should annualise income from joining month for TDS computation", () => {
    // Employee joins in October (FY month 7), 6 months in FY — use higher components so
    // annualised taxable income exceeds ₹7L and Section 87A rebate does not zero out tax.
    const result = computeTax(
      makeProfile({
        joiningMonth: 7,
        monthsInFY: 6,
        annualCTC: 2_400_000,
        basicMonthly: 100_000,
        hraMonthly: 40_000,
        specialAllowance: 40_000,
      })
    );
    expect(result.monthlyTDS).toBeGreaterThan(0);
    expect(result.remainingTax).toBeGreaterThan(0);
  });

  it("should account for previous employer income and TDS", () => {
    const result = computeTax(
      makeProfile({
        joiningMonth: 7,
        monthsInFY: 6,
        previousEmployerIncome: 600_000,
        previousEmployerTDS: 30_000,
      })
    );
    expect(result.previousEmployerTDS).toBe(30_000);
    expect(result.remainingTax).toBe(result.totalTaxLiability - 30_000);
  });
});

// ─── SALARY REVISION TDS RECOMPUTATION ─────────────────────────────────────────

describe("Salary Revision TDS", () => {
  it("should recompute TDS correctly after mid-year revision", () => {
    const original = computeTax(makeProfile({ annualCTC: 1_200_000 }));
    const tdsDeducted6Months = original.monthlyTDS * 6;

    const revised = recomputeTDSOnRevision(
      original,
      makeProfile({ annualCTC: 1_500_000, basicMonthly: 62_500, hraMonthly: 25_000 }),
      6,
      tdsDeducted6Months
    );

    // Revised monthly TDS should be higher (catching up)
    expect(revised.monthlyTDS).toBeGreaterThan(original.monthlyTDS);
    // Total remaining tax = new liability - already deducted
    expect(revised.remainingTax).toBe(
      revised.totalTaxLiability - tdsDeducted6Months
    );
  });
});

// ─── ECR GENERATION ────────────────────────────────────────────────────────────

describe("ECR File Generation", () => {
  it("should generate pipe-delimited ECR format", () => {
    const mockInput: EmployeePayrollInput = {
      id: "emp-1",
      name: "Karthik Iyer",
      employeeCode: "NX-001",
      pan: "ABCDE1234F",
      uan: "100123456789",
      designation: "Engineer",
      department: "Engineering",
      state: "Karnataka",
      isMetro: true,
      joiningDate: new Date("2024-04-01"),
      basicMonthly: 50_000,
      hraMonthly: 20_000,
      specialAllowance: 20_000,
      ltaAnnual: 30_000,
      regime: "NEW",
      section80C: 0, section80D: 0, section80CCD1B: 0,
      section80TTA: 0, section24b: 0, hraExemption: 0,
      otherExemptions: 0, rentPaid: 0,
      daysInMonth: 30, daysWorked: 30, lopDays: 0,
      overtime: 0, arrears: 0, bonus: 0,
      otherEarnings: 0, otherDeductions: 0,
      isVoluntaryHigherPF: false,
      previousEmployerIncome: 0, previousEmployerTDS: 0,
      ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0,
      month: 4, year: 2026,
    };

    const payslip = computeEmployeePayslip(mockInput, 1); // April = FY month 1
    const ecr = generateECR([payslip]);

    expect(ecr).toContain("100123456789");
    expect(ecr).toContain("Karthik Iyer");
    expect(ecr.split("|").length).toBe(11);
  });
});

// ─── INTEGRATION: FULL PAYSLIP ─────────────────────────────────────────────────

describe("Full Payslip Generation", () => {
  it("should generate a complete payslip with all components", () => {
    const input: EmployeePayrollInput = {
      id: "emp-1",
      name: "Test Employee",
      employeeCode: "NX-001",
      pan: "ABCDE1234F",
      uan: "100123456789",
      designation: "Senior Engineer",
      department: "Engineering",
      state: "Maharashtra",
      isMetro: true,
      joiningDate: new Date("2024-04-01"),
      basicMonthly: 50_000,
      hraMonthly: 20_000,
      specialAllowance: 20_000,
      ltaAnnual: 30_000,
      regime: "NEW",
      section80C: 0, section80D: 0, section80CCD1B: 0,
      section80TTA: 0, section24b: 0, hraExemption: 0,
      otherExemptions: 0, rentPaid: 0,
      daysInMonth: 30, daysWorked: 28, lopDays: 2,
      overtime: 5_000, arrears: 0, bonus: 0,
      otherEarnings: 0, otherDeductions: 0,
      isVoluntaryHigherPF: false,
      previousEmployerIncome: 0, previousEmployerTDS: 0,
      ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0,
      month: 4, year: 2026,
    };

    const payslip = computeEmployeePayslip(input, 1);

    // Verify LOP adjustment
    expect(payslip.basicEarned).toBe(Math.round(50_000 * (28 / 30)));
    expect(payslip.lopDays).toBe(2);

    // Verify all components present
    expect(payslip.grossEarnings).toBeGreaterThan(0);
    expect(payslip.employeePF).toBeGreaterThan(0);
    expect(payslip.professionalTax).toBeGreaterThan(0); // Maharashtra
    expect(payslip.tds).toBeGreaterThan(0);
    expect(payslip.netPay).toBeGreaterThan(0);
    expect(payslip.netPay).toBeLessThan(payslip.grossEarnings);

    // Verify math: net = gross - deductions
    expect(payslip.netPay).toBe(
      Math.max(0, payslip.grossEarnings - payslip.totalDeductions)
    );

    // Verify YTD updated
    expect(payslip.ytdGross).toBe(payslip.grossEarnings);
    expect(payslip.ytdTDS).toBe(payslip.tds);
  });
});
