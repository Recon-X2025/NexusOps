/**
 * F9 — the two tax numbers on ONE payslip must agree.
 * ─────────────────────────────────────────────────────────────────────────────
 * The defect was invisible because the deducted monthly TDS (the RUN, via
 * `computeEmployeePayslip`) and the printed Annual Tax Liability (the DISPLAY, via
 * `computePayslipTaxFigures`) were computed by DIFFERENT mechanisms: the run scaled a
 * full-year gross by monthsInFY (→ ₹0), while the display hardcoded a full 12 months and
 * a zero HRA exemption (→ an inflated, unrelated number). This test pins them to ONE
 * projection so they can never silently diverge again.
 *
 * Pure functions, no DB.
 */
import { describe, it, expect } from "vitest";
import { computeEmployeePayslip, type EmployeePayrollInput } from "@coheronconnect/payroll-math";
import { computePayslipTaxFigures } from "../lib/payslip-tax";

const fyMonthOf = (m: number) => (m >= 4 ? m - 3 : m + 9);

// Old-regime, joined 1-Jul-2026 (mid-FY), ₹1,00,000/mo gross, 80C ₹1,50,000, rent
// ₹6,00,000 non-metro (Bengaluru), run September 2026 — the walk-2 scenario.
const runInput: EmployeePayrollInput = {
  id: "emp-f9c", name: "F9 Consistency", employeeCode: "EMP-F9C",
  pan: "ABCDE1234F", uan: "100000000000", designation: "Engineer", department: "Eng",
  state: "Karnataka", isMetro: false, joiningDate: new Date("2026-07-01"),
  gender: "male", dateOfBirth: new Date("1990-01-01"),
  ptExemptArmedForces: true, ptExemptDisability: false, ptExemptDependentDisability: false,
  basicMonthly: 50_000, hraMonthly: 25_000, specialAllowance: 25_000, ltaAnnual: 0,
  regime: "OLD", section80C: 150_000, section80D: 0, section80CCD1B: 0, section80TTA: 0, section24b: 0,
  hraExemption: 0, otherExemptions: 0, rentPaid: 600_000,
  daysInMonth: 30, daysWorked: 30, lopDays: 0,
  overtime: 0, arrears: 0, bonus: 0, otherEarnings: 0, otherDeductions: 0,
  isVoluntaryHigherPF: false, previousEmployerIncome: 0, previousEmployerTDS: 0,
  ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0, month: 9, year: 2026,
};

describe("F9: the run's deducted TDS and the display's printed annual liability agree", () => {
  it("payslip PDF/portal annual figure is projected identically to the run", () => {
    const slip = computeEmployeePayslip(runInput, fyMonthOf(runInput.month));

    // Build the stored payslip row the display would read, from the run's own output.
    const row = {
      grossEarnings: String(slip.grossEarnings),
      basic: String(slip.basicEarned),
      hra: String(slip.hraEarned),
      specialAllowance: String(slip.specialAllowance),
      lta: String(slip.lta),
      pfEmployee: String(slip.employeePF),
      pfEmployer: String(slip.employerPF),
      professionalTax: String(slip.professionalTax),
      taxRegimeUsed: "old",
      month: runInput.month,
      year: runInput.year,
    } as unknown as Parameters<typeof computePayslipTaxFigures>[0];

    const display = computePayslipTaxFigures(
      row,
      { section80C: 150_000, section80D: 0, section80CCD1B: 0, section80TTA: 0, section24b: 0 },
      { startDate: runInput.joiningDate, city: "Bengaluru", rentPaidAnnual: 600_000,
        previousEmployerIncome: 0, previousEmployerTds: 0 },
    );

    // The run's annual liability and the printed annual liability are the SAME projection.
    expect(display.taxableIncome).toBe(slip.taxComputation.taxableIncome);
    expect(display.totalTaxLiability).toBe(slip.taxComputation.totalTaxLiability);
    // And it's the correct, non-zero figure — not the old ₹0 (run) / inflated (display) pair.
    expect(display.totalTaxLiability).toBe(17_160);
    expect(slip.tds).toBeGreaterThan(0);
  });
});
