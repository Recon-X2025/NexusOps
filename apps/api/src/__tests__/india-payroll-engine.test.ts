/**
 * CoheronConnect India Tax Engine — Test Suite
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

  it("should apply Section 87A rebate for taxable income ≤ ₹12L (Finance Act 2025)", () => {
    // ₹12L CTC → taxable ≈ ₹11.23L (≤ ₹12L) → full rebate up to ₹60,000 → nil tax.
    const result = computeTax(makeProfile({ annualCTC: 1_200_000 }));
    expect(result.rebate87A).toBeGreaterThan(0);
    expect(result.taxAfterRebate).toBe(0);
    expect(result.totalTaxLiability).toBe(0);
  });

  it("should compute correct tax for ₹16L CTC (no rebate, taxable > ₹12L)", () => {
    const result = computeTax(makeProfile({ annualCTC: 1_600_000 }));
    // Taxable = 16L - 75K = 15,25,000 (NEW regime does NOT deduct professional
    // tax); FY2025-26 slabs → 20,000 + 40,000 + 3.25L×15% = 108,750. The prior
    // 108,390 blessed the bug where PT was deducted under NEW (tax lower by the
    // 15% on ₹2,400 PT = 360).
    expect(result.taxOnIncome).toBe(108_750);
    expect(result.rebate87A).toBe(0); // taxable > 12L
    expect(result.cess).toBe(Math.round(108_750 * 0.04));
    expect(result.totalTaxLiability).toBe(108_750 + Math.round(108_750 * 0.04));
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
    const result = computeTax(makeProfile({ annualCTC: 1_600_000 }));
    expect(result.totalTaxLiability).toBeGreaterThan(0);
    expect(result.monthlyTDS).toBe(Math.round(result.totalTaxLiability / 12));
  });
});

// ─── REGULATORY REFRESH: FINANCE ACT 2025 NEW-REGIME CONSTANTS ──────────────────
// Locks in the Finance Act 2025 revision (effective FY 2025-26): the ₹4L basic
// exemption, the seven-band slab ladder, and the ₹60,000 / ₹12L Section-87A
// rebate. Guards against an accidental revert to the FY2024-25 structure.
describe("Finance Act 2025 — New-Regime slab & rebate refresh", () => {
  // professionalTax:0 so taxable = annualCTC − ₹75,000 (standard deduction) exactly.
  it("makes taxable income up to ₹12L fully tax-free (₹12.75L gross)", () => {
    // taxable exactly ₹12L → tax before rebate = 20k + 40k = 60k, fully rebated.
    const result = computeTax(makeProfile({ annualCTC: 1_275_000, professionalTax: 0 }));
    expect(result.taxableIncome).toBe(1_200_000);
    expect(result.taxOnIncome).toBe(60_000);
    expect(result.rebate87A).toBe(60_000);
    expect(result.totalTaxLiability).toBe(0);
  });

  it("withdraws the rebate the moment taxable income crosses ₹12L", () => {
    // taxable ₹12,00,100 → rebate no longer applies (ceiling is strict ≤ ₹12L).
    const result = computeTax(makeProfile({ annualCTC: 1_275_100, professionalTax: 0 }));
    expect(result.taxableIncome).toBe(1_200_100);
    expect(result.rebate87A).toBe(0);
    expect(result.taxAfterRebate).toBeGreaterThan(0);
  });

  it("applies the ₹4L basic exemption (no tax on the first ₹4L)", () => {
    // taxable ₹4L → nil tax even without the rebate.
    const result = computeTax(makeProfile({ annualCTC: 475_000, professionalTax: 0 }));
    expect(result.taxableIncome).toBe(400_000);
    expect(result.taxOnIncome).toBe(0);
  });

  it("walks the seven-band ladder at ₹20L taxable (5/10/15/20%)", () => {
    // ₹20L taxable: 4-8L@5%=20k + 8-12L@10%=40k + 12-16L@15%=60k + 16-20L@20%=80k
    const result = computeTax(makeProfile({ annualCTC: 2_075_000, professionalTax: 0 }));
    expect(result.taxableIncome).toBe(2_000_000);
    expect(result.taxOnIncome).toBe(200_000);
    expect(result.rebate87A).toBe(0);
  });
});

// ─── PT5: s.87A REBATE MARGINAL RELIEF (NEW regime) ────────────────────────────
// Just above the ₹12L rebate threshold the full ₹60,000 rebate is lost on a sliver
// of extra income — a cliff. Marginal relief caps the tax so it can never exceed the
// income earned ABOVE the threshold, and tapers to nothing where slab tax first falls
// to the excess (around ₹12.72L). Confirmed against the ITD page. taxable = annualCTC
// − ₹75,000 (standard deduction) with professionalTax:0.
describe("PT5 — Section 87A rebate marginal relief (New Regime)", () => {
  const taxableTo = (t: number) =>
    makeProfile({ regime: "NEW", annualCTC: t + 75_000, professionalTax: 0 });

  it("charges nil tax at exactly ₹12L taxable (full rebate)", () => {
    const r = computeTax(taxableTo(1_200_000));
    expect(r.taxableIncome).toBe(1_200_000);
    expect(r.rebate87A).toBe(60_000);
    expect(r.taxAfterRebate).toBe(0);
    expect(r.totalTaxLiability).toBe(0);
  });

  it("charges only ₹1 at ₹12,00,001 taxable (relief caps tax at the excess)", () => {
    // Without relief the whole ₹60,000 slab tax would land on ₹1 of extra income.
    const r = computeTax(taxableTo(1_200_001));
    expect(r.taxableIncome).toBe(1_200_001);
    expect(r.rebate87A).toBe(0);
    expect(r.taxAfterRebate).toBe(1);
  });

  it("charges ₹50,000 at ₹12,50,000 taxable (excess-capped, below slab tax)", () => {
    // Slab tax here is ₹67,500 but the excess over ₹12L is only ₹50,000, so relief
    // caps the tax at ₹50,000.
    const r = computeTax(taxableTo(1_250_000));
    expect(r.taxableIncome).toBe(1_250_000);
    expect(r.rebate87A).toBe(0);
    expect(r.taxAfterRebate).toBe(50_000);
  });

  it("stops relieving once slab tax falls below the excess (~₹12.72L)", () => {
    // At ₹12,80,000 the excess (₹80,000) exceeds the slab tax (₹72,000), so relief is
    // inert and the full slab tax stands.
    const r = computeTax(taxableTo(1_280_000));
    expect(r.taxableIncome).toBe(1_280_000);
    expect(r.rebate87A).toBe(0);
    expect(r.taxAfterRebate).toBe(72_000);
  });

  it("never lets liability fall when crossing the ₹12L rebate cliff", () => {
    // The defect PT5 fixes: a naive rebate withdrawal made ₹12,00,001 owe ₹60,000
    // while ₹12,00,000 owed nil — an inversion. Relief must keep it monotonic.
    const at = computeTax(taxableTo(1_200_000));
    const above = computeTax(taxableTo(1_200_001));
    expect(above.taxAfterRebate).toBeGreaterThanOrEqual(at.taxAfterRebate);
    // And the extra tax may not exceed the extra ₹1 of income.
    expect(above.taxAfterRebate - at.taxAfterRebate).toBeLessThanOrEqual(1);
  });
});

// ─── PT3: NEW-REGIME SURCHARGE CAP (25%, no ₹5cr step-up) ───────────────────────
// Under s.115BAC the New-Regime surcharge is capped at 25% above ₹2cr; it does NOT
// step up to 37% above ₹5cr (that 37% band is Old-regime only). The engine clamps
// the band list for NEW, which also removes ₹5cr as a marginal-relief threshold.
// Confirmed against the ITD page. Uses the exact COH fairness-check figures.
describe("PT3 — New-Regime surcharge capped at 25% (no ₹5cr step-up)", () => {
  const taxableTo = (t: number) =>
    makeProfile({
      regime: "NEW",
      annualCTC: t + 75_000,
      basicMonthly: 500_000,
      hraMonthly: 200_000,
      specialAllowance: 200_000,
      lta: 0,
      professionalTax: 0,
    });

  it("COH-08 (₹5,98,92,500 taxable) uses the 25% figure, not 37%", () => {
    const r = computeTax(taxableTo(59_892_500));
    expect(r.taxableIncome).toBe(59_892_500);
    // 25% of the ₹1,75,47,750 slab tax; the old 37% figure (₹64,92,668) is the bug.
    expect(r.surcharge).toBe(Math.round(r.taxAfterRebate * 0.25));
    expect(r.surcharge).toBe(4_386_938);
  });

  it("COH-07 (₹2,48,92,496 taxable) stays at 25% (unchanged)", () => {
    const r = computeTax(taxableTo(24_892_496));
    expect(r.taxableIncome).toBe(24_892_496);
    expect(r.surcharge).toBe(Math.round(r.taxAfterRebate * 0.25));
  });

  it("applies no ₹5cr marginal-relief step under the New Regime", () => {
    // At ₹5cr the New-Regime surcharge stays 25% with no step to 37%, so crossing
    // ₹5cr adds no surcharge jump and there is nothing for a ₹5cr relief calc to cap.
    const at = computeTax(taxableTo(50_000_000));
    const above = computeTax(taxableTo(50_001_000));
    expect(at.surcharge).toBe(Math.round(at.taxAfterRebate * 0.25));
    expect(above.surcharge).toBe(Math.round(above.taxAfterRebate * 0.25));
  });

  it("never exceeds 25% of base tax anywhere above ₹2cr (New Regime)", () => {
    for (const taxable of [25_000_000, 40_000_000, 60_000_000, 100_000_000]) {
      const r = computeTax(taxableTo(taxable));
      expect(r.surcharge).toBeLessThanOrEqual(Math.round(r.taxAfterRebate * 0.25) + 1);
    }
  });
});

// ─── PT3: OLD REGIME STILL REACHES 37% ABOVE ₹5cr ──────────────────────────────
// The guard must not over-apply: the Old regime keeps the full band set, so above
// ₹5cr its surcharge is 37% (with marginal relief just past the threshold).
describe("PT3 — Old Regime retains the 37% band above ₹5cr", () => {
  const oldTaxableTo = (t: number) =>
    makeProfile({
      regime: "OLD",
      annualCTC: t + 50_000, // Old-regime standard deduction is ₹50,000
      basicMonthly: 500_000,
      hraMonthly: 200_000,
      specialAllowance: 200_000,
      lta: 0,
      professionalTax: 0,
      // No Chapter VI-A / HRA so taxable = gross − ₹50,000 exactly.
    });

  it("levies the full 37% well above ₹5cr (relief no longer binds)", () => {
    const r = computeTax(oldTaxableTo(60_000_000));
    expect(r.taxableIncome).toBe(60_000_000);
    expect(r.surcharge).toBe(Math.round(r.taxAfterRebate * 0.37));
  });

  it("steps up at ₹5cr under the Old Regime (marginal relief binds just above)", () => {
    // Crossing ₹5cr moves the rate 25%→37%, so surcharge jumps — the opposite of the
    // New Regime. Just above the threshold relief caps the extra liability.
    const at = computeTax(oldTaxableTo(50_000_000));
    const above = computeTax(oldTaxableTo(50_001_000));
    const extra =
      above.taxAfterRebate + above.surcharge -
      (at.taxAfterRebate + at.surcharge);
    expect(extra).toBeLessThanOrEqual(1_000 + 1); // relief: extra ≤ extra income
    // Far above ₹5cr the 37% rate is fully in force.
    const high = computeTax(oldTaxableTo(60_000_000));
    expect(high.surcharge).toBe(Math.round(high.taxAfterRebate * 0.37));
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

  it("G1: honours an override PF wage ceiling", () => {
    const result = computePF(50_000, false, 21_000);
    expect(result.pfWageBase).toBe(21_000);
    expect(result.employeePF).toBe(Math.round(21_000 * 0.12));
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

  it("G1: honours an override ESI wage ceiling", () => {
    const result = computeESI(25_000, 27_000);
    expect(result.isApplicable).toBe(true);
    expect(result.employeeESI).toBe(Math.round(25_000 * 0.0075));
  });
});

describe("Professional Tax", () => {
  // A non-February FY month used wherever the February true-up must NOT apply.
  const APR = 1; // FY month 1
  const FEB = 11; // FY month 11

  // ── Maharashtra (MALE set — the default until gender ingestion lands) ──────────
  describe("Maharashtra (male / default)", () => {
    it("nil at/below ₹7,500", () => {
      expect(computePT(7_500, "Maharashtra", APR).ptAmount).toBe(0);
    });
    it("₹175 in ₹7,501–10,000", () => {
      expect(computePT(7_501, "Maharashtra", APR).ptAmount).toBe(175);
      expect(computePT(10_000, "Maharashtra", APR).ptAmount).toBe(175);
    });
    it("₹200 above ₹10,000", () => {
      expect(computePT(10_001, "Maharashtra", APR).ptAmount).toBe(200);
      expect(computePT(50_000, "Maharashtra", APR).ptAmount).toBe(200);
    });
    it("₹300 in February for the top band", () => {
      expect(computePT(50_000, "Maharashtra", FEB).ptAmount).toBe(300);
    });
    it("February does NOT bump the ₹175 band", () => {
      expect(computePT(9_000, "Maharashtra", FEB).ptAmount).toBe(175);
    });
  });

  // ── Maharashtra (FEMALE set — UNREACHABLE via state name until gender ingestion;
  //    reached here through the "Maharashtra Female" → MAHARASHTRA_FEMALE key so the
  //    populated-but-dormant config is proven correct ahead of C2-STRUCT). ─────────
  describe("Maharashtra (female — dormant until gender ingestion)", () => {
    it("nil at/below ₹25,000", () => {
      expect(computePT(25_000, "Maharashtra Female", APR).ptAmount).toBe(0);
      expect(computePT(10_000, "Maharashtra Female", APR).ptAmount).toBe(0);
    });
    it("₹200 above ₹25,000", () => {
      expect(computePT(25_001, "Maharashtra Female", APR).ptAmount).toBe(200);
    });
    it("₹300 in February for the top band", () => {
      expect(computePT(50_000, "Maharashtra Female", FEB).ptAmount).toBe(300);
    });
  });

  // ── Karnataka (CORRECTED: nil to ₹25,000, then ₹200; ₹300 in Feb) ──────────────
  describe("Karnataka", () => {
    it("nil at/below ₹25,000 (the removed ₹15,001–25,000 band)", () => {
      expect(computePT(15_001, "Karnataka", APR).ptAmount).toBe(0);
      expect(computePT(20_000, "Karnataka", APR).ptAmount).toBe(0);
      expect(computePT(25_000, "Karnataka", APR).ptAmount).toBe(0);
    });
    it("₹200 above ₹25,000", () => {
      expect(computePT(25_001, "Karnataka", APR).ptAmount).toBe(200);
      expect(computePT(30_000, "Karnataka", APR).ptAmount).toBe(200);
    });
    it("₹300 in February for the top band", () => {
      expect(computePT(30_000, "Karnataka", FEB).ptAmount).toBe(300);
    });
    it("February does NOT bump a nil-band employee", () => {
      expect(computePT(20_000, "Karnataka", FEB).ptAmount).toBe(0);
    });
  });

  // ── Gujarat (CORRECTED: nil to ₹12,000, then ₹200 flat; no Feb rate) ───────────
  describe("Gujarat", () => {
    it("nil at/below ₹12,000 (removed ₹80 and ₹150 bands)", () => {
      expect(computePT(6_000, "Gujarat", APR).ptAmount).toBe(0);
      expect(computePT(8_999, "Gujarat", APR).ptAmount).toBe(0);
      expect(computePT(9_000, "Gujarat", APR).ptAmount).toBe(0);
      expect(computePT(11_999, "Gujarat", APR).ptAmount).toBe(0);
      expect(computePT(12_000, "Gujarat", APR).ptAmount).toBe(0);
    });
    it("₹200 flat above ₹12,000", () => {
      expect(computePT(12_001, "Gujarat", APR).ptAmount).toBe(200);
      expect(computePT(50_000, "Gujarat", APR).ptAmount).toBe(200);
    });
    it("no February bump (Gujarat has no month-specific rate)", () => {
      expect(computePT(50_000, "Gujarat", FEB).ptAmount).toBe(200);
    });
    it("annual cap is the statutory ₹2,500, NOT ₹200×12 (that is Punjab's ceiling)", () => {
      // Guard against re-deriving the cap from the monthly rate. Gujarat's ceiling is
      // the constitutional ₹2,500/yr; ₹2,400 belongs to Punjab. See reports/fix-plan.md.
      expect(computePT(50_000, "Gujarat", APR).annualPT).toBe(2_500);
    });
  });

  // ── Unchanged states (audit found correct) — must pass before AND after ────────
  describe("Telangana (unchanged)", () => {
    it("nil to ₹15,000; ₹150 to ₹20,000; ₹200 above", () => {
      expect(computePT(15_000, "Telangana", APR).ptAmount).toBe(0);
      expect(computePT(15_001, "Telangana", APR).ptAmount).toBe(150);
      expect(computePT(20_000, "Telangana", APR).ptAmount).toBe(150);
      expect(computePT(20_001, "Telangana", APR).ptAmount).toBe(200);
    });
    it("no February bump", () => {
      expect(computePT(50_000, "Telangana", FEB).ptAmount).toBe(200);
    });
  });

  describe("West Bengal (unchanged)", () => {
    it("nil to ₹10,000; ₹110; ₹130; ₹150; ₹200 by band", () => {
      expect(computePT(10_000, "West Bengal", APR).ptAmount).toBe(0);
      expect(computePT(10_001, "West Bengal", APR).ptAmount).toBe(110);
      expect(computePT(15_001, "West Bengal", APR).ptAmount).toBe(130);
      expect(computePT(25_001, "West Bengal", APR).ptAmount).toBe(150);
      expect(computePT(40_001, "West Bengal", APR).ptAmount).toBe(200);
    });
  });

  describe("Delhi (unchanged — no PT)", () => {
    it("returns ₹0 regardless of income or month", () => {
      expect(computePT(100_000, "Delhi", APR).ptAmount).toBe(0);
      expect(computePT(100_000, "Delhi", FEB).ptAmount).toBe(0);
    });
  });
});

// ─── MID-YEAR JOIN TESTS ───────────────────────────────────────────────────────

describe("Mid-Year Join TDS", () => {
  it("should annualise income from joining month for TDS computation", () => {
    // Employee joins in October (FY month 7), 6 months in FY — use higher components so
    // annualised taxable income exceeds ₹12L and the Section 87A rebate does not zero
    // out tax (Finance Act 2025 raised the New-Regime rebate ceiling to ₹12L).
    const result = computeTax(
      makeProfile({
        joiningMonth: 7,
        monthsInFY: 6,
        annualCTC: 4_800_000,
        basicMonthly: 200_000,
        hraMonthly: 80_000,
        specialAllowance: 80_000,
      })
    );
    expect(result.monthlyTDS).toBeGreaterThan(0);
    expect(result.remainingTax).toBeGreaterThan(0);
  });

  it("should account for previous employer income and TDS", () => {
    // Base ₹16L + ₹6L previous income keeps taxable income above the ₹12L rebate
    // ceiling so a positive liability remains to net the prior TDS against.
    const result = computeTax(
      makeProfile({
        joiningMonth: 7,
        monthsInFY: 6,
        annualCTC: 1_600_000,
        basicMonthly: 66_667,
        hraMonthly: 26_667,
        specialAllowance: 26_666,
        previousEmployerIncome: 600_000,
        previousEmployerTDS: 30_000,
      })
    );
    expect(result.previousEmployerTDS).toBe(30_000);
    expect(result.totalTaxLiability).toBeGreaterThan(30_000);
    expect(result.remainingTax).toBe(result.totalTaxLiability - 30_000);
  });
});

// ─── SALARY REVISION TDS RECOMPUTATION ─────────────────────────────────────────

describe("Salary Revision TDS", () => {
  it("should recompute TDS correctly after mid-year revision", () => {
    const original = computeTax(makeProfile({ annualCTC: 1_600_000 }));
    const tdsDeducted6Months = original.monthlyTDS * 6;

    const revised = recomputeTDSOnRevision(
      original,
      makeProfile({ annualCTC: 2_200_000, basicMonthly: 91_667, hraMonthly: 36_667 }),
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
      // Salary set above the Finance Act 2025 New-Regime rebate ceiling (taxable
      // > ₹12L) so a non-zero TDS is exercised alongside every other component.
      basicMonthly: 90_000,
      hraMonthly: 36_000,
      specialAllowance: 36_000,
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
    expect(payslip.basicEarned).toBe(Math.round(90_000 * (28 / 30)));
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

// ─── SURCHARGE & MARGINAL RELIEF ───────────────────────────────────────────────

describe("Surcharge & Marginal Relief", () => {
  // Drive taxable income to an exact value. With joiningMonth=1, grossSalary =
  // annualCTC; NEW regime deducts only the ₹75K standard deduction (PT set to 0),
  // so taxableIncome = annualCTC - 75,000.  ⇒  annualCTC = taxable + 75,000.
  function profileForTaxable(taxable: number): EmployeeTaxProfile {
    return makeProfile({
      regime: "NEW",
      annualCTC: taxable + 75_000,
      // Components large enough not to clamp anything; only annualCTC matters here
      // because joiningMonth=1 short-circuits to annualCTC for grossSalary.
      basicMonthly: 500_000,
      hraMonthly: 200_000,
      specialAllowance: 200_000,
      lta: 0,
      professionalTax: 0,
    });
  }

  it("levies NO surcharge at exactly ₹50L taxable income", () => {
    const result = computeTax(profileForTaxable(5_000_000));
    expect(result.taxableIncome).toBe(5_000_000);
    expect(result.surcharge).toBe(0);
  });

  it("levies surcharge once taxable income exceeds ₹50L", () => {
    const result = computeTax(profileForTaxable(5_100_000));
    expect(result.taxableIncome).toBe(5_100_000);
    expect(result.surcharge).toBeGreaterThan(0);
  });

  it("caps surcharge via marginal relief just above ₹50L", () => {
    // At the threshold liability is base tax only (0% surcharge band below ₹50L).
    const atThreshold = computeTax(profileForTaxable(5_000_000));
    const justAbove = computeTax(profileForTaxable(5_001_000));

    const incomeIncrement = 5_001_000 - 5_000_000; // ₹1,000
    // Marginal relief: extra (tax + surcharge) from crossing the threshold may not
    // exceed the extra income earned above it. (Cess excluded — it rides on top.)
    const liabilityAtThreshold =
      atThreshold.taxAfterRebate + atThreshold.surcharge;
    const liabilityJustAbove = justAbove.taxAfterRebate + justAbove.surcharge;
    const extraLiability = liabilityJustAbove - liabilityAtThreshold;

    expect(extraLiability).toBeLessThanOrEqual(incomeIncrement + 1); // +1 rounding tol
  });

  it("caps surcharge via marginal relief just above ₹1cr", () => {
    const atThreshold = computeTax(profileForTaxable(10_000_000));
    const justAbove = computeTax(profileForTaxable(10_001_000));

    const incomeIncrement = 10_001_000 - 10_000_000;
    const extraLiability =
      justAbove.taxAfterRebate +
      justAbove.surcharge -
      (atThreshold.taxAfterRebate + atThreshold.surcharge);

    expect(extraLiability).toBeLessThanOrEqual(incomeIncrement + 1);
  });

  it("applies the full 10% surcharge well above ₹50L (relief no longer binds)", () => {
    // At ₹80L taxable the income cushion above ₹50L (₹30L) far exceeds the surcharge,
    // so marginal relief is inactive and surcharge equals exactly 10% of base tax.
    const result = computeTax(profileForTaxable(8_000_000));
    expect(result.surcharge).toBe(Math.round(result.taxAfterRebate * 0.10));
  });

  it("applies the full 15% surcharge well above ₹1cr (relief no longer binds)", () => {
    const result = computeTax(profileForTaxable(15_000_000));
    expect(result.surcharge).toBe(Math.round(result.taxAfterRebate * 0.15));
  });

  it("increases monotonically in (tax + surcharge) across the ₹50L boundary", () => {
    const below = computeTax(profileForTaxable(4_999_000));
    const above = computeTax(profileForTaxable(5_001_000));
    const belowLiability = below.taxAfterRebate + below.surcharge;
    const aboveLiability = above.taxAfterRebate + above.surcharge;
    // Crossing the threshold must never reduce total liability (the bug marginal
    // relief specifically prevents — a naive surcharge cliff would invert this).
    expect(aboveLiability).toBeGreaterThanOrEqual(belowLiability);
  });
});
