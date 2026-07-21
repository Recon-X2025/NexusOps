/**
 * G2 — Labour Codes 2025 wage-base + bonus-eligibility tests.
 *
 * Covers the Code on Wages, 2019 s.2(y) "50%-inclusion proviso" and the Payment
 * of Bonus Act eligibility gate, in three layers:
 *
 *   1. Pure math (`calculateLabourCodeWageBase`, `computeStatutoryBonusEligibility`).
 *   2. Payslip wire-in (`computeEmployeePayslip`): the proviso lifts the PF base
 *      only when a `bonusEligibilityCeiling` is resolved, and clamps at the PF
 *      ceiling. Two scenarios per the requirement:
 *        (a) skewed low Basic → base scales UP but CLAMPS at ₹15k PF ceiling;
 *        (b) mid Basic where the add-back is VISIBLE below the ceiling.
 *   3. Resolver round-trip (`resolveStatutoryCeilings`) for the new
 *      `bonus_eligibility_ceiling` metric + effective-date selection (Dec-2025).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, testDb } from "./helpers";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { statutoryCeilings, eq } from "@coheronconnect/db";
import {
  calculateLabourCodeWageBase,
  computeStatutoryBonusEligibility,
  computeEmployeePayslip,
  type EmployeePayrollInput,
  type StatutoryCeilingOverrides,
} from "@coheronconnect/payroll-math";

// A skewed salary: total remuneration ₹40,000/mo with Basic only ₹12,000 (30%)
// and ₹28,000 (70%) in excluded allowances — the exact pattern the Labour Codes
// proviso targets.
function skewedInput(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    id: "emp-lc",
    name: "Skewed Salary",
    employeeCode: "LC-001",
    pan: "ABCDE1234F",
    uan: "100123456789",
    designation: "Analyst",
    department: "Ops",
    state: "Karnataka",
    isMetro: true,
    joiningDate: new Date("2024-04-01"),
    basicMonthly: 12_000,
    hraMonthly: 18_000,
    specialAllowance: 10_000,
    ltaAnnual: 0,
    regime: "NEW",
    section80C: 0, section80D: 0, section80CCD1B: 0,
    section80TTA: 0, section24b: 0, hraExemption: 0,
    otherExemptions: 0, rentPaid: 0,
    daysInMonth: 31, daysWorked: 31, lopDays: 0,
    overtime: 0, arrears: 0, bonus: 0,
    otherEarnings: 0, otherDeductions: 0,
    isVoluntaryHigherPF: false,
    previousEmployerIncome: 0, previousEmployerTDS: 0,
    ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0,
    month: 12, year: 2025,
    ...overrides,
  };
}

// Labour Codes in force: the payslip only applies the proviso + bonus gate when a
// bonus-eligibility ceiling is resolved (see payroll-cycle wire-in).
const LABOUR_CODE_CEILINGS: StatutoryCeilingOverrides = {
  pfWageCeiling: 15_000,
  esiWageCeiling: 21_000,
  bonusEligibilityCeiling: 21_000,
};

describe("G2: calculateLabourCodeWageBase (Code on Wages s.2(y))", () => {
  it("adds back the excess of exclusions over 50% of total remuneration", () => {
    // core 12,000 + excluded 28,000 = 40,000 total; 50% = 20,000;
    // exclusions 28,000 exceed the half by 8,000 → clawed back into wages.
    const r = calculateLabourCodeWageBase(12_000, 28_000);
    expect(r.totalRemuneration).toBe(40_000);
    expect(r.halfOfTotal).toBe(20_000);
    expect(r.addBack).toBe(8_000);
    expect(r.statutoryWageBase).toBe(20_000); // == 50% floor
  });

  it("is a no-op when exclusions are at or below 50% (conventional structure)", () => {
    // core 25,000 + excluded 15,000 = 40,000; exclusions (15k) < 20k half.
    const r = calculateLabourCodeWageBase(25_000, 15_000);
    expect(r.addBack).toBe(0);
    expect(r.statutoryWageBase).toBe(25_000);
  });

  it("floors negative inputs at zero", () => {
    const r = calculateLabourCodeWageBase(-5_000, -1_000);
    expect(r.coreWages).toBe(0);
    expect(r.exclusions).toBe(0);
    expect(r.statutoryWageBase).toBe(0);
  });

  it("lifts the base to exactly 50% of total when Basic is skewed low", () => {
    // Any skew where exclusions > 50% lands the base on the 50% floor.
    const r = calculateLabourCodeWageBase(10_000, 90_000);
    expect(r.statutoryWageBase).toBe(50_000);
  });
});

describe("G2: computeStatutoryBonusEligibility (Payment of Bonus Act)", () => {
  it("is eligible at or below the ceiling", () => {
    expect(computeStatutoryBonusEligibility(21_000).isEligible).toBe(true);
    expect(computeStatutoryBonusEligibility(15_000).isEligible).toBe(true);
  });

  it("is ineligible above the ceiling", () => {
    expect(computeStatutoryBonusEligibility(21_001).isEligible).toBe(false);
    expect(computeStatutoryBonusEligibility(50_000).isEligible).toBe(false);
  });

  it("honours a custom ceiling", () => {
    expect(computeStatutoryBonusEligibility(25_000, 30_000).isEligible).toBe(true);
  });
});

describe("G2: payslip wire-in — 50% proviso lifts + clamps the PF base", () => {
  it("(a) skewed low Basic: base scales UP but CLAMPS at ₹15k PF ceiling", () => {
    // Under Labour Codes: core 12k, excluded 28k → wage base lifts to 20k (50%),
    // then computePF clamps at the 15k PF ceiling → employeePF = 12% * 15,000.
    const payslip = computeEmployeePayslip(skewedInput(), 9, LABOUR_CODE_CEILINGS);
    expect(payslip.statutoryDeductions.pf.pfWageBase).toBe(15_000);
    expect(payslip.employeePF).toBe(Math.round(15_000 * 0.12)); // 1,800
  });

  it("without Labour-Code ceilings the raw Basic base is used (unchanged behaviour)", () => {
    // No bonusEligibilityCeiling ⇒ proviso NOT applied: PF base = raw Basic 12k.
    const payslip = computeEmployeePayslip(skewedInput(), 9, {
      pfWageCeiling: 15_000,
      esiWageCeiling: 21_000,
    });
    expect(payslip.statutoryDeductions.pf.pfWageBase).toBe(12_000);
    expect(payslip.employeePF).toBe(Math.round(12_000 * 0.12)); // 1,440
  });

  it("(b) sub-ceiling: the add-back is VISIBLE below the PF ceiling", () => {
    // core 8,000 + excluded 6,000 = 14,000 total; 50% = 7,000; exclusions 6,000
    // are BELOW half → NO add-back, base stays 8,000 (proviso inert). To make the
    // add-back visible we skew harder: core 8,000 + excluded 12,000 = 20,000;
    // 50% = 10,000; add-back 2,000 → base 10,000, still < 15k ceiling.
    const input = skewedInput({
      basicMonthly: 8_000,
      hraMonthly: 8_000,
      specialAllowance: 4_000,
    });
    const payslip = computeEmployeePayslip(input, 9, LABOUR_CODE_CEILINGS);
    // base = 10,000 (below the 15k ceiling), so pfWageBase is the lifted value.
    expect(payslip.statutoryDeductions.pf.pfWageBase).toBe(10_000);
    expect(payslip.employeePF).toBe(Math.round(10_000 * 0.12)); // 1,200
  });

  it("gates statutory bonus for an employee above the bonus ceiling", () => {
    // Basic 25,000 > 21,000 ceiling ⇒ statutory bonus not payable ⇒ removed from
    // gross and zeroed on the payslip.
    const input = skewedInput({
      basicMonthly: 25_000,
      hraMonthly: 10_000,
      specialAllowance: 5_000,
      bonus: 5_000,
    });
    const payslip = computeEmployeePayslip(input, 9, LABOUR_CODE_CEILINGS);
    expect(payslip.bonus).toBe(0);
  });

  it("pays statutory bonus for an eligible employee (Basic ≤ ceiling)", () => {
    const input = skewedInput({ bonus: 5_000 }); // Basic 12,000 ≤ 21,000
    const payslip = computeEmployeePayslip(input, 9, LABOUR_CODE_CEILINGS);
    expect(payslip.bonus).toBe(5_000);
  });
});

describe("G2: resolver round-trip for bonus_eligibility_ceiling", () => {
  let orgId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });

  afterEach(async () => {
    await testDb().delete(statutoryCeilings).where(eq(statutoryCeilings.orgId, orgId));
  });

  it("resolves an org-scoped bonus ceiling for a Dec-2025 cycle, honouring the effective date", async () => {
    // Self-isolated: seed an org-scoped bonus ceiling effective 2025-11-21 (the
    // Labour-Code date). A Dec-2025 pay period is after it; an Oct-2025 period is
    // before it. Kept org-scoped so the test never mutates platform-default seed.
    await testDb().insert(statutoryCeilings).values({
      orgId,
      metricKey: "bonus_eligibility_ceiling",
      value: "21000",
      effectiveFrom: new Date("2025-11-21T00:00:00Z"),
    });
    const dec = await resolveStatutoryCeilings(testDb(), orgId, new Date("2025-12-01"));
    expect(dec.bonusEligibilityCeiling).toBe(21000);

    const oct = await resolveStatutoryCeilings(testDb(), orgId, new Date("2025-10-01"));
    expect(oct.bonusEligibilityCeiling).toBeUndefined();
  });

  it("an org-scoped bonus ceiling overrides the platform default (effective-dated)", async () => {
    // Platform default (2025-11-21 = 21,000) is migration-seeded; add an org row
    // effective 2026-04-01 with a raised ceiling. The coalesced arbiter keeps the
    // org row distinct from the platform-default (orgId NULL) row.
    await testDb().insert(statutoryCeilings).values({
      orgId,
      metricKey: "bonus_eligibility_ceiling",
      value: "25000",
      effectiveFrom: new Date("2026-04-01T00:00:00Z"),
    });
    // On/after the org row's effectiveFrom → org override (25,000).
    const apr2026 = await resolveStatutoryCeilings(testDb(), orgId, new Date("2026-04-15"));
    expect(apr2026.bonusEligibilityCeiling).toBe(25000);
  });
});
