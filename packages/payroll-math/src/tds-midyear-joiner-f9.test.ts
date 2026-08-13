/**
 * F9 — TDS for a mid-year joiner must be computed on projected FY earnings, not on a
 * full-year figure scaled by monthsInFY while deductions stay full-year.
 * ─────────────────────────────────────────────────────────────────────────────
 * The defect (payroll-cycle.ts:388-391 + tax-engine.ts:292-301): a calendar-year
 * heuristic classified every current-calendar-year start date as a mid-year joiner,
 * and `computeTax` then scaled GROSS to monthsInFY/12 while leaving the standard
 * deduction, HRA exemption, 80C and PT at full-year values. Taxable income collapsed
 * below ₹5,00,000, the s.87A rebate applied, and monthly TDS computed to ₹0 — even
 * though the payslip printed the (also-wrong) full-year annual liability beside it.
 *
 * The fix: project the joiner's ACTUAL fiscal-year earnings (join month → March) and
 * feed that whole figure to `computeTax` (no gross-only scaling), so the 87A rebate is
 * applied to the genuine taxable income. `monthsInFY` (run-month based) stays the
 * spread divisor only.
 *
 * These drive the REAL `computeEmployeePayslip`, asserting the engine's own
 * `taxComputation`. Note: the fix makes the figure CORRECT, not merely non-zero — a
 * genuine mid-year joiner whose true partial-FY taxable falls under the rebate
 * threshold still legitimately owes ₹0 (asserted in the rebate-boundary test).
 */
import { describe, it, expect } from "vitest";
import { computeEmployeePayslip, type EmployeePayrollInput } from "./payroll-cycle";

const BASIC = 50_000;
const HRA = 25_000;
const SPECIAL = 25_000; // gross ₹1,00,000/mo ⇒ ₹12,00,000 annualised

/** India FY month: April = 1 … March = 12. */
const fyMonthOf = (calendarMonth: number) => (calendarMonth >= 4 ? calendarMonth - 3 : calendarMonth + 9);

function input(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    id: "emp-f9",
    name: "F9 Tester",
    employeeCode: "EMP-F9",
    pan: "ABCDE1234F",
    uan: "100000000000",
    designation: "Engineer",
    department: "Eng",
    state: "Karnataka",
    isMetro: false,
    joiningDate: new Date("2026-07-01"), // mid-FY 2026-27 joiner (FY month 4)
    gender: "male",
    dateOfBirth: new Date("1990-01-01"),
    // PT-exempt so professional tax is 0 and the tax arithmetic is exact.
    ptExemptArmedForces: true,
    ptExemptDisability: false,
    ptExemptDependentDisability: false,
    basicMonthly: BASIC,
    hraMonthly: HRA,
    specialAllowance: SPECIAL,
    ltaAnnual: 0,
    regime: "OLD",
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0, // 0 ⇒ engine computes it from rentPaid + isMetro
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
    month: 9, // September run
    year: 2026,
    ...overrides,
  };
}

const run = (o: Partial<EmployeePayrollInput> = {}) => {
  const emp = input(o);
  return computeEmployeePayslip(emp, fyMonthOf(emp.month));
};

describe("F9: mid-year joiner TDS is projected, not scaled-then-zeroed", () => {
  // TEST 1 — the headline (the walk-2 scenario). Old-regime, joined 1-Jul-2026,
  // ₹12L annualised, 80C ₹1,50,000, rent ₹6,00,000 non-metro, run September 2026.
  // BEFORE fix: taxable collapses to ₹2,60,000 → 87A → totalTaxLiability 0, TDS 0.
  // AFTER fix: 9-month FY income ₹9,00,000 − std 50,000 − HRA 1,80,000 − 80C 1,50,000
  //           = ₹5,20,000 taxable → tax 16,500 + 4% cess = ₹17,160; > ₹5L so no rebate.
  it("headline: joined this FY at ₹12L with 80C — monthly TDS > 0 and reconciles to the annual", () => {
    const slip = run({ section80C: 150_000, rentPaid: 600_000 });
    const t = slip.taxComputation;

    expect(t.taxableIncome).toBe(520_000);
    expect(t.totalTaxLiability).toBe(17_160);
    expect(t.totalTaxLiability).toBeGreaterThan(0);
    expect(slip.tds).toBeGreaterThan(0);
    // Reconcile: the deducted monthly TDS × the months it is spread over ≈ the annual.
    expect(slip.tds).toBe(Math.round(17_160 / 7)); // Sept run ⇒ 7 months (Sep–Mar) remaining
  });

  // TEST 4 — mid-year correctness: taxed on ACTUAL FY earnings (9 months), not 12.
  it("mid-year joiner is taxed on 9 months of earnings, not a full year", () => {
    const joiner = run({ section80C: 150_000, rentPaid: 600_000 }).taxComputation;
    const fullYear = run({ joiningDate: new Date("2020-01-01"), section80C: 150_000, rentPaid: 600_000 })
      .taxComputation;
    // 9-month taxable (₹5,20,000) is well below the full-year taxable (₹7,60,000).
    expect(joiner.taxableIncome).toBe(520_000);
    expect(fullYear.taxableIncome).toBe(760_000);
    expect(joiner.taxableIncome).toBeLessThan(fullYear.taxableIncome);
  });

  // TEST 2 — regression guard: a prior-year joiner (full FY) is UNCHANGED by the fix.
  // joiningMonth stays 1, so this path never scaled and must not move.
  it("regression: prior-year joiner, same salary, is unchanged (full-year figure)", () => {
    const t = run({ joiningDate: new Date("2020-01-01"), section80C: 150_000, rentPaid: 600_000 })
      .taxComputation;
    // Full year: 12L − std 50k − HRA 240k − 80C 150k = 760k → 64,500 + 4% cess = 67,080.
    expect(t.taxableIncome).toBe(760_000);
    expect(t.totalTaxLiability).toBe(67_080);
  });

  // TEST 3 — the 87A rebate must survive for those legitimately entitled.
  it("rebate boundary: genuine taxable just under ₹5L keeps the rebate (₹0); just over does not", () => {
    // Full-year employees (joiningMonth 1) to isolate the rebate, no HRA/80C.
    // gross 540k → taxable 490k (< 5L) ⇒ 87A ⇒ 0. gross 560k → taxable 510k (> 5L) ⇒ taxed.
    const under = run({ joiningDate: new Date("2020-01-01"), basicMonthly: 27_000, hraMonthly: 9_000, specialAllowance: 9_000 })
      .taxComputation; // 45,000/mo ⇒ 540,000/yr
    const over = run({ joiningDate: new Date("2020-01-01"), basicMonthly: 28_000, hraMonthly: 9_500, specialAllowance: 9_500 })
      .taxComputation; // 47,000/mo ⇒ 564,000/yr

    expect(under.taxableIncome).toBeLessThanOrEqual(500_000);
    expect(under.totalTaxLiability).toBe(0); // rebate intact
    expect(over.taxableIncome).toBeGreaterThan(500_000);
    expect(over.totalTaxLiability).toBeGreaterThan(0);
  });

  // TEST 5 — new regime is affected too (scaling zeroed high earners under the ₹12L
  // new-regime rebate threshold). Joined 1-Jul-2026, ₹18L annualised, run September.
  // BEFORE: scaled gross 10.5L − std 75k = 10.425L < 12L ⇒ new 87A ⇒ 0.
  // AFTER: 9-month income 13.5L − std 75k = 12.75L > 12L ⇒ taxed.
  it("new regime: a mid-year joiner above the ₹12L threshold is taxed, not zeroed", () => {
    const t = run({
      regime: "NEW",
      basicMonthly: 75_000,
      hraMonthly: 37_500,
      specialAllowance: 37_500, // ₹1,50,000/mo ⇒ ₹18L annualised
    }).taxComputation;
    expect(t.taxableIncome).toBeGreaterThan(1_200_000);
    expect(t.totalTaxLiability).toBeGreaterThan(0);
    expect(t.monthlyTDS).toBeGreaterThan(0);
  });
});
