/**
 * A12 — LOP tax defect + net-pay floor fairness.
 *
 * Two coupled correctness fixes, proven here:
 *
 *  1. **LOP tax.** TDS used to be annualised on CONTRACTUAL salary
 *     (`basicMonthly*12 + …`) while this month's gross was LOP-reduced. An employee
 *     on unpaid leave was taxed as though fully paid, so deductions could exceed
 *     earnings. The fix annualises on the LOP-EARNED components instead, so TDS
 *     tracks actual pay. Critically, when `lopDays == 0` the earned figures equal
 *     the contractual ones, so the non-LOP path must be **byte-identical** to before.
 *
 *  2. **Net-pay floor.** `netPay = max(0, gross − deductions)` silently discarded any
 *     shortfall. The fix surfaces it as `unrecoveredShortfall` (net still floors at 0)
 *     so money can never vanish at the floor.
 *
 * The invariance assertion (non-LOP unchanged) is what makes the tax change safe.
 */
import { describe, it, expect } from "vitest";
import {
  computeEmployeePayslip,
  type EmployeePayrollInput,
} from "../lib/payroll-cycle";
import { computeTax, type EmployeeTaxProfile } from "../lib/india-tax-engine";

/** A full-time employee whose salary is high enough to bear a real TDS. */
function baseInput(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    id: "emp-1",
    name: "Test Employee",
    employeeCode: "NX-001",
    pan: "ABCDE1234F",
    uan: "100123456789",
    designation: "Senior Engineer",
    department: "Engineering",
    state: "Karnataka",
    isMetro: true,
    joiningDate: new Date("2024-04-01"),
    // Above the New-Regime rebate ceiling so TDS is non-zero.
    basicMonthly: 90_000,
    hraMonthly: 36_000,
    specialAllowance: 36_000,
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
    ...overrides,
  };
}

describe("A12 — LOP tax + net-pay floor", () => {
  // ── The invariance guarantee that makes the tax change safe ────────────────
  it("non-LOP payslip is byte-identical to the pre-fix behaviour — the safety invariant", () => {
    const emp = baseInput(); // daysWorked == daysInMonth, lopDays == 0
    const p = computeEmployeePayslip(emp, 1);

    // ROOT of the invariance: at full attendance the LOP-EARNED components equal the
    // CONTRACTUAL ones. The fix only swapped `contractual*12` for `earned*12` in the
    // annualCTC, so this equality is exactly what makes the non-LOP result unchanged.
    expect(p.basicEarned).toBe(emp.basicMonthly);
    expect(p.hraEarned).toBe(emp.hraMonthly);
    expect(p.specialAllowance).toBe(emp.specialAllowance);
    expect(p.lta).toBe(Math.round(emp.ltaAnnual / 12));

    // Independent reconstruction of the PRE-FIX TDS: feed computeTax the OLD
    // contractual annualCTC (basicMonthly*12 + …) with the payslip's own PF/PT, and
    // assert the payslip's TDS matches it byte-for-byte. If the fix had shifted the
    // non-LOP case, this would fail.
    const preFixProfile: EmployeeTaxProfile = {
      regime: emp.regime,
      annualCTC:
        emp.basicMonthly * 12 + emp.hraMonthly * 12 + emp.specialAllowance * 12 + emp.ltaAnnual,
      basicMonthly: emp.basicMonthly,
      hraMonthly: emp.hraMonthly,
      specialAllowance: emp.specialAllowance,
      lta: emp.ltaAnnual,
      section80C: emp.section80C,
      section80D: emp.section80D,
      section80CCD1B: emp.section80CCD1B,
      section80TTA: emp.section80TTA,
      section24b: emp.section24b,
      hraExemption: emp.hraExemption,
      otherExemptions: emp.otherExemptions,
      employeePFMonthly: p.employeePF,
      employerPFMonthly: p.employerPF,
      professionalTax: p.statutoryDeductions.pt.annualPT,
      joiningMonth: 1,
      monthsInFY: 12,
      previousEmployerIncome: emp.previousEmployerIncome,
      previousEmployerTDS: emp.previousEmployerTDS,
    };
    expect(p.tds).toBe(computeTax(preFixProfile).monthlyTDS);

    // Full attendance: earnings cover deductions, so nothing is lost.
    expect(p.netPay).toBeGreaterThan(0);
    expect(p.unrecoveredShortfall).toBe(0);
    expect(p.netPay).toBe(Math.max(0, p.grossEarnings - p.totalDeductions));
  });

  // ── The root-cause fix: TDS follows actual earnings under LOP ───────────────
  it("LOP reduces TDS in step with earnings (no longer taxed on contractual salary)", () => {
    const full = computeEmployeePayslip(baseInput(), 1);
    // Half the month unpaid.
    const halfLop = computeEmployeePayslip(
      baseInput({ daysInMonth: 30, daysWorked: 15, lopDays: 15 }),
      1,
    );

    // Gross halves (LOP factor 15/30) …
    expect(halfLop.grossEarnings).toBeLessThan(full.grossEarnings);
    // … and TDS must fall too, not stay at the full-salary figure. Pre-fix, TDS was
    // identical to `full` because it annualised contractual salary regardless of LOP.
    expect(halfLop.tds).toBeLessThan(full.tds);
  });

  it("heavy unpaid leave is not taxed as if fully paid — TDS stays a sane fraction of gross", () => {
    // 25 of 30 days unpaid: earns ~1/6th of a month.
    const heavy = computeEmployeePayslip(
      baseInput({ daysInMonth: 30, daysWorked: 5, lopDays: 25 }),
      1,
    );
    // The bug made TDS exceed the whole (reduced) gross. Corrected, TDS must be a
    // fraction of what's actually earned this month.
    expect(heavy.tds).toBeLessThan(heavy.grossEarnings);
  });

  // ── The floor fix: no money vanishes ───────────────────────────────────────
  it("no money vanishes at the floor — any shortfall is surfaced, not swallowed", () => {
    // Force deductions above gross with a large one-off recovery in otherDeductions,
    // on a heavily-LOP month so gross is already small. Net floors at 0 and the exact
    // lost amount surfaces in unrecoveredShortfall.
    const p = computeEmployeePayslip(
      baseInput({
        daysInMonth: 30, daysWorked: 3, lopDays: 27,
        otherDeductions: 200_000, // a salary-advance-style recovery far exceeding this month's pay
      }),
      1,
    );

    expect(p.netPay).toBe(0);
    expect(p.unrecoveredShortfall).toBeGreaterThan(0);
    // The shortfall is exactly the amount the floor would otherwise have discarded.
    expect(p.unrecoveredShortfall).toBe(p.totalDeductions - p.grossEarnings);
    // Conservation: gross = (net paid out) + (deductions actually covered by earnings)
    //             = netPay + (totalDeductions − unrecoveredShortfall). Nothing lost.
    expect(p.grossEarnings).toBe(
      p.netPay + (p.totalDeductions - p.unrecoveredShortfall),
    );
  });

  it("shortfall is 0 whenever earnings cover deductions", () => {
    const p = computeEmployeePayslip(baseInput(), 1);
    expect(p.unrecoveredShortfall).toBe(0);
  });
});

/**
 * A12-D — split-logic annual projection (CA correction to the shipped A12).
 *
 * A12 fixed the over-deduction but projected the CURRENT month's LOP-reduced pay across
 * the WHOLE year (`earned*12`), i.e. it assumed the unpaid month repeats every month and
 * so UNDER-projected annual income (and under-collected TDS) in any LOP month. The correct
 * estimate is a blend: current month on actual earned pay, every OTHER FY month on
 * contracted pay. `taxComputation.grossSalary` is the annual figure the engine projects
 * (for a full-year employee it IS `annualCTC`), so we assert it directly.
 *
 * PR5 note: earnings-to-date can't be read from prior payslips (ytd*=0), so the PAST months
 * are estimated at contracted pay — exact for a one-off current-month LOP, which is what
 * these assert. The projected annual is therefore `contracted × 11 + currentActual` for a
 * single LOP month, independent of WHERE in the FY it falls.
 */
describe("A12-D — split-logic annual projection", () => {
  /** The contracted monthly TAXABLE pay (per-component at lopFactor 1) — what every non-LOP month projects at. */
  const contractedMonthly = (e: EmployeePayrollInput): number =>
    Math.round(e.basicMonthly) + Math.round(e.hraMonthly) + Math.round(e.specialAllowance) + Math.round(e.ltaAnnual / 12);
  /** The actual earned taxable pay on a payslip (LOP-reduced when applicable). */
  const currentActual = (p: ReturnType<typeof computeEmployeePayslip>): number =>
    p.basicEarned + p.hraEarned + p.specialAllowance + p.lta;
  const HALF_LOP = { daysInMonth: 30, daysWorked: 15, lopDays: 15 } as const;

  it("LOP current month: projects THIS month on actual pay and the other 11 on contracted pay", () => {
    const emp = baseInput(HALF_LOP);
    const p = computeEmployeePayslip(emp, 5); // August — a mid-FY month
    const actualNow = currentActual(p);

    // The projected annual is contracted × 11 + this month's actual — NOT actual × 12.
    const expected = contractedMonthly(emp) * 11 + actualNow;
    expect(p.taxComputation.grossSalary).toBe(expected);

    // Concretely higher than A12's `earned*12`, which is what under-collected TDS.
    expect(p.taxComputation.grossSalary).toBeGreaterThan(actualNow * 12);
    // …and lower than a full non-LOP year, because one month really was reduced.
    expect(p.taxComputation.grossSalary).toBeLessThan(contractedMonthly(emp) * 12);
  });

  it("no LOP: projection is unchanged from today's behaviour (contracted × 12 == the old earned × 12)", () => {
    const emp = baseInput(); // full attendance
    const p = computeEmployeePayslip(emp, 1);
    // Byte-identical to A12: with no LOP, earned == contracted, so both the old `earned*12`
    // and the new blend equal contracted × 12.
    expect(p.taxComputation.grossSalary).toBe(contractedMonthly(emp) * 12);
    expect(p.taxComputation.grossSalary).toBe(currentActual(p) * 12);
  });

  it("April (FY month 1): eleven months remain — one month actual, eleven contracted ahead", () => {
    const full = computeEmployeePayslip(baseInput(), 1);
    const lop = computeEmployeePayslip(baseInput(HALF_LOP), 1);

    // Exactly ONE month is LOP-reduced; the other eleven stay at contracted pay. (Under
    // A12's earned*12 the whole year moved, so this delta would have been ×12.)
    expect(full.taxComputation.grossSalary - lop.taxComputation.grossSalary).toBe(
      contractedMonthly(baseInput()) - currentActual(lop),
    );
    expect(lop.taxComputation.grossSalary).toBe(contractedMonthly(baseInput()) * 11 + currentActual(lop));
  });

  it("March (FY month 12): zero months remain — no forward contracted projection, no off-by-one", () => {
    const full = computeEmployeePayslip(baseInput(), 12);
    const lop = computeEmployeePayslip(baseInput(HALF_LOP), 12);

    // Zero remaining months must not break the arithmetic: a non-LOP March still projects a
    // full contracted year (no month dropped by the 12 − fyMonth = 0 remaining term).
    expect(full.taxComputation.grossSalary).toBe(contractedMonthly(baseInput()) * 12);
    // And a March LOP still reduces exactly the one current month (the eleven contracted are
    // now all earnings-to-date rather than ahead), so the projected annual is the same blend.
    expect(full.taxComputation.grossSalary - lop.taxComputation.grossSalary).toBe(
      contractedMonthly(baseInput()) - currentActual(lop),
    );
    expect(lop.taxComputation.grossSalary).toBe(contractedMonthly(baseInput()) * 11 + currentActual(lop));
  });

  it("the A12 net-pay floor still holds under the higher projection (net ≥ 0, shortfall surfaced)", () => {
    // Heavy LOP + a large recovery: the richer projection can raise TDS, but money still
    // must not vanish — net floors at 0 and the shortfall is surfaced and reconciles.
    const p = computeEmployeePayslip(
      baseInput({ daysInMonth: 30, daysWorked: 3, lopDays: 27, otherDeductions: 200_000 }),
      1,
    );
    expect(p.netPay).toBe(0);
    expect(p.unrecoveredShortfall).toBeGreaterThan(0);
    expect(p.unrecoveredShortfall).toBe(p.totalDeductions - p.grossEarnings);
    expect(p.grossEarnings).toBe(p.netPay + (p.totalDeductions - p.unrecoveredShortfall));
  });
});
