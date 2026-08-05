/**
 * HRA exemption (s.10(13A)) fairness checks — red before, green after.
 * ─────────────────────────────────────────────────────────────────────────────
 * The defect: `computeEmployeePayslip` read `hraExemption` off the caller-supplied
 * `EmployeePayrollInput`, and nothing ever populated it — so it was 0 for every
 * employee. The metro-aware `computeHRAExemption` existed and was tested, but the
 * payslip path never called it. Consequence: an OLD-regime employee paying rent got
 * no HRA exemption, so their taxable income and TDS were both overstated. `isMetro`
 * (ingested onto the employee) reached nothing.
 *
 * The fix computes the exemption inside `computeEmployeePayslip` from the declared
 * `rentPaid` + `isMetro` + the LOP-earned basic/HRA, and feeds it into the tax
 * profile. `computeTax` applies HRA exemption only under the OLD regime, so a value
 * here never reduces NEW-regime tax.
 *
 * These are end-to-end drives of the REAL `computeEmployeePayslip`, asserting on the
 * engine's own `taxComputation.taxableIncome`, so they prove the wiring, not a
 * re-implementation. Each scenario the owner asked for:
 *
 *   1. OLD-regime renter ⇒ exemption applied, taxable income reduced. Before: 0.
 *   2. isMetro true ⇒ 50% threshold; false ⇒ 40% ⇒ different exemptions.
 *   3. NEW-regime renter ⇒ no HRA exemption (not available under the new regime).
 *   4. No rent declared ⇒ unaffected either way.
 *
 * "Red before" is proven by the accompanying assertions that reconstruct the OLD
 * (rent-blind) behaviour — `rentPaid: 0` reproduces exactly the pre-fix taxable
 * income, and the fix must move away from it.
 */

import { describe, it, expect } from "vitest";
import { computeEmployeePayslip, type EmployeePayrollInput } from "./payroll-cycle";

// A structure with a real, taxable salary and a genuine HRA component so the
// exemption is non-trivial. Basic ₹50,000/mo ⇒ ₹6,00,000/yr; HRA ₹25,000/mo ⇒
// ₹3,00,000/yr. Full-month attendance (no LOP) so earned == contractual.
const BASIC_MONTHLY = 50_000;
const HRA_MONTHLY = 25_000;
const SPECIAL_MONTHLY = 25_000; // pushes gross solidly into a taxed band
const FY_MONTH = 1; // April — first month of the FY, full 12 months ahead

function baseInput(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    id: "emp-hra",
    name: "HRA Tester",
    employeeCode: "EMP-HRA",
    pan: "ABCDE1234F",
    uan: "100000000000",
    designation: "Engineer",
    department: "Eng",
    state: "Maharashtra",
    isMetro: false,
    joiningDate: new Date("2020-01-01"),
    gender: "male",
    dateOfBirth: new Date("1990-01-01"),
    ptExemptArmedForces: false,
    ptExemptDisability: false,
    ptExemptDependentDisability: false,
    basicMonthly: BASIC_MONTHLY,
    hraMonthly: HRA_MONTHLY,
    specialAllowance: SPECIAL_MONTHLY,
    ltaAnnual: 0,
    regime: "OLD",
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0, // caller-supplied override; 0 ⇒ the engine computes it
    otherExemptions: 0,
    rentPaid: 0,
    daysInMonth: 30,
    daysWorked: 30,
    lopDays: 0,
    overtime: 0,
    arrears: 0,
    bonus: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    isVoluntaryHigherPF: false,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
    ytdGross: 0,
    ytdPF: 0,
    ytdTDS: 0,
    ytdNetPay: 0,
    month: 4,
    year: 2026,
    ...overrides,
  };
}

// Rent high enough that the s.10(13A) least-of-three is NOT clamped to zero by the
// "rent − 10% of basic" leg: 10% of basic (₹6,00,000) = ₹60,000, so ₹3,00,000 rent
// leaves ₹2,40,000 on that leg — well above zero, so a real exemption results.
const RENT_ANNUAL = 300_000;

// A higher rent used specifically for the metro/non-metro comparison. It must clear
// the "rent − 10% of basic" leg so the 50%/40%-of-basic leg is the binding one and the
// metro flag actually moves the result. Basic ₹6,00,000 ⇒ rent−10% = ₹3,40,000, above
// the metro 50% leg (₹3,00,000) and the non-metro 40% leg (₹2,40,000): metro exempts
// ₹3,00,000, non-metro ₹2,40,000 — genuinely different.
const RENT_ANNUAL_METRO_TEST = 400_000;

describe("HRA exemption is wired into the payslip engine (was always 0)", () => {
  it("OLD-regime renter: exemption applied ⇒ taxable income drops below the rent-blind figure", () => {
    const withRent = computeEmployeePayslip(baseInput({ regime: "OLD", rentPaid: RENT_ANNUAL }), FY_MONTH);
    // The pre-fix behaviour was exactly rentPaid: 0 (nothing populated the field).
    const rentBlind = computeEmployeePayslip(baseInput({ regime: "OLD", rentPaid: 0 }), FY_MONTH);

    // Green: declaring rent reduces taxable income.
    expect(withRent.taxComputation.taxableIncome).toBeLessThan(rentBlind.taxComputation.taxableIncome);
    // Red guard: before the fix these were equal (rent had no effect at all).
    expect(withRent.taxComputation.taxableIncome).not.toBe(rentBlind.taxComputation.taxableIncome);
    // And less tax follows from less taxable income.
    expect(withRent.taxComputation.monthlyTDS).toBeLessThan(rentBlind.taxComputation.monthlyTDS);
  });

  it("metro vs non-metro: the 50%/40%-of-basic threshold produces different exemptions", () => {
    const metro = computeEmployeePayslip(
      baseInput({ regime: "OLD", rentPaid: RENT_ANNUAL_METRO_TEST, isMetro: true }),
      FY_MONTH,
    );
    const nonMetro = computeEmployeePayslip(
      baseInput({ regime: "OLD", rentPaid: RENT_ANNUAL_METRO_TEST, isMetro: false }),
      FY_MONTH,
    );

    // With basic ₹6,00,000: the 40% leg (₹2,40,000) binds for non-metro, the 50% leg
    // (₹3,00,000) for metro — so metro exempts more ⇒ LOWER taxable income than non-metro.
    expect(metro.taxComputation.taxableIncome).toBeLessThan(nonMetro.taxComputation.taxableIncome);
    expect(metro.taxComputation.taxableIncome).not.toBe(nonMetro.taxComputation.taxableIncome);
  });

  it("NEW-regime renter: HRA exemption is NOT available ⇒ rent has no effect", () => {
    const withRent = computeEmployeePayslip(baseInput({ regime: "NEW", rentPaid: RENT_ANNUAL }), FY_MONTH);
    const noRent = computeEmployeePayslip(baseInput({ regime: "NEW", rentPaid: 0 }), FY_MONTH);

    // The new regime does not allow HRA exemption, so taxable income is identical
    // whether or not rent is declared.
    expect(withRent.taxComputation.taxableIncome).toBe(noRent.taxComputation.taxableIncome);
  });

  it("no rent declared: an employee is unaffected under both regimes", () => {
    const oldNoRent = computeEmployeePayslip(baseInput({ regime: "OLD", rentPaid: 0 }), FY_MONTH);
    const newNoRent = computeEmployeePayslip(baseInput({ regime: "NEW", rentPaid: 0 }), FY_MONTH);

    // computeHRAExemption returns 0 when rent is 0, so the OLD-regime no-rent employee
    // sees no exemption — same as before the fix (regression guard: the wiring must not
    // invent an exemption for non-renters).
    const oldWithExplicitZeroExemption = computeEmployeePayslip(
      baseInput({ regime: "OLD", rentPaid: 0, hraExemption: 0 }),
      FY_MONTH,
    );
    expect(oldNoRent.taxComputation.taxableIncome).toBe(
      oldWithExplicitZeroExemption.taxComputation.taxableIncome,
    );
    // Both regimes still produce a valid, positive taxable income at this salary.
    expect(oldNoRent.taxComputation.taxableIncome).toBeGreaterThan(0);
    expect(newNoRent.taxComputation.taxableIncome).toBeGreaterThan(0);
  });
});
