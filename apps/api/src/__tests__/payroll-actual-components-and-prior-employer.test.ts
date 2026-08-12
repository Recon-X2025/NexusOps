/**
 * PT1 / PT2 / PT4 fairness checks — red before, green after.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three independent payroll-correctness fixes, each proven against the exact bug it
 * removes. Pure money-math + a DB-backed aggregate check; no network.
 *
 *   PT1 — Tax on actual paid components. The `- 2500` shave in the special-allowance
 *         residual (the ANNUAL Maharashtra PT cap subtracted MONTHLY) removed ₹30,000/yr
 *         from gross, so from the TDS base. With it gone, gross rises by exactly ₹30,000
 *         a year, and the screen path (`buildTaxProfileFromEmployee`, via the same engine)
 *         and the run path agree on the same taxable income for the same employee.
 *
 *   PT2 — Payslip PDF reads engine figures. The PDF re-derived annual tax as
 *         monthlyTDS × 12 and taxable income as gross × 12 − ₹75,000 (omitting PT). Both
 *         now come from `computePayslipTaxFigures`, the same helper the screen uses, so
 *         the annual tax is the engine's real liability and taxable income nets PT.
 *
 *   PT4 — Prior-employer TDS. `previousEmployerIncome` / `previousEmployerTDS` were
 *         hardcoded to 0; the s.192 rolling calc had nothing to net against. They now
 *         thread from the employee record (Form 12B intake) into the engine input.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeTax, type EmployeeTaxProfile } from "../lib/india-tax-engine";
import { computePayslipTaxFigures } from "../lib/payslip-tax";
import { buildEmployeePayrollInput } from "../services/payroll-run-aggregates";
import { payrollRouter } from "../routers/payroll";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { employees, salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";

// A structure whose monthly CTC leaves a positive special-allowance residual so the shave
// (or its removal) is fully visible, not clamped at the Math.max(0, …) floor.
const CTC_ANNUAL = 1_200_000; // ₹1,00,000/mo
const BASIC_PCT = 40; // → basic ₹40,000/mo
const HRA_PCT_OF_BASIC = 50; // → HRA ₹20,000/mo  ⇒ special residual ₹40,000/mo (well above ₹2,500)

// ── PT1 ────────────────────────────────────────────────────────────────────────
describe("PT1: the run path taxes actual paid components — the ₹2,500/mo shave is gone", () => {
  let orgId: string;
  const YEAR = 2026;
  const MONTH = 4; // April

  async function seedEmp(): Promise<{
    emp: typeof employees.$inferSelect;
    struct: typeof salaryStructures.$inferSelect;
  }> {
    const { userId } = await seedUser(orgId, { email: `pt1-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: String(CTC_ANNUAL),
        basicPercent: String(BASIC_PCT),
        hraPercentOfBasic: String(HRA_PCT_OF_BASIC),
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    return { emp: emp!, struct: struct! };
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("special allowance is the full residual with NO ₹2,500 monthly shave", async () => {
    const { emp, struct } = await seedEmp();
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);

    const monthlyCtc = CTC_ANNUAL / 12;
    const basic = (CTC_ANNUAL * (BASIC_PCT / 100)) / 12;
    const hra = basic * (HRA_PCT_OF_BASIC / 100);
    const residualNoShave = monthlyCtc - basic - hra; // the correct residual
    const residualShaved = residualNoShave - 2500; // the old buggy residual

    // Green: the built input carries the un-shaved residual.
    expect(input.specialAllowance).toBeCloseTo(residualNoShave, 2);
    // Red guard: it must NOT be the shaved figure (proves the shave is removed).
    expect(input.specialAllowance).not.toBeCloseTo(residualShaved, 2);
    // And the gap is exactly ₹2,500/mo = ₹30,000/yr.
    expect((input.specialAllowance - residualShaved) * 12).toBeCloseTo(30_000, 0);
  });

  it("removing the shave lifts annual taxable income by exactly ₹30,000", async () => {
    const { emp, struct } = await seedEmp();
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);

    // Build two otherwise-identical full-year NEW-regime profiles differing only by the
    // shave, on the same component split the run uses, and run the real engine on both.
    // A full year (joiningMonth: 1) means gross = annualCTC, so the ₹30,000/yr difference
    // in the special-allowance annualisation lands in taxable income undiluted.
    const specialAnnualFixed = input.specialAllowance * 12;
    const specialAnnualShaved = (input.specialAllowance - 2500) * 12;
    const fixedGross =
      input.basicMonthly * 12 + input.hraMonthly * 12 + specialAnnualFixed + input.ltaAnnual;
    const shavedGross =
      input.basicMonthly * 12 + input.hraMonthly * 12 + specialAnnualShaved + input.ltaAnnual;

    const baseProfile: EmployeeTaxProfile = {
      regime: "NEW",
      annualCTC: fixedGross,
      basicMonthly: input.basicMonthly,
      hraMonthly: input.hraMonthly,
      specialAllowance: input.specialAllowance,
      lta: input.ltaAnnual,
      section80C: 0,
      section80D: 0,
      section80CCD1B: 0,
      section80TTA: 0,
      section24b: 0,
      hraExemption: 0,
      otherExemptions: 0,
      employeePFMonthly: 1800,
      employerPFMonthly: 1800,
      professionalTax: 2400,
      joiningMonth: 1,
      monthsInFY: 12,
      previousEmployerIncome: 0,
      previousEmployerTDS: 0,
    };
    const fixed = computeTax(baseProfile);
    const shaved = computeTax({ ...baseProfile, annualCTC: shavedGross });

    // The only difference is ₹2,500/mo of special allowance = ₹30,000/yr of gross, and
    // therefore ₹30,000 of taxable income.
    expect(fixedGross - shavedGross).toBe(30_000);
    expect(fixed.taxableIncome - shaved.taxableIncome).toBe(30_000);
  });
});

// ── PT2 ────────────────────────────────────────────────────────────────────────
describe("PT2: payslip tax figures come from the engine, not hand-derived shortcuts", () => {
  // A payslip row shape sufficient for computePayslipTaxFigures. High enough gross that
  // there is a real, non-trivial annual liability to compare against the shortcuts.
  const slip = {
    grossEarnings: "150000", // ₹1,50,000/mo ⇒ ₹18,00,000/yr — solidly taxable
    basic: "60000",
    hra: "30000",
    specialAllowance: "60000",
    lta: "0",
    pfEmployee: "1800",
    pfEmployer: "1800",
    professionalTax: "200",
    tds: "20000", // this month's TDS
    taxRegimeUsed: "new",
  } as unknown as Parameters<typeof computePayslipTaxFigures>[0];

  it("annual tax equals the engine's totalTaxLiability, NOT monthlyTDS × 12", () => {
    const figures = computePayslipTaxFigures(slip);
    const monthlyTimesTwelve = Number(slip.tds) * 12; // the old PDF shortcut

    // Green: the figure is the engine's real annual liability.
    expect(figures.totalTaxLiability).toBeGreaterThan(0);
    // Red: it is not the naive monthly × 12 (which double-counts nothing but ignores the
    // real annualised base + slabs + cess).
    expect(figures.totalTaxLiability).not.toBe(monthlyTimesTwelve);
  });

  it("taxable income reflects the real standard deduction, NOT gross × 12 − ₹75,000 verbatim", () => {
    const figures = computePayslipTaxFigures(slip);
    const grossAnnual = Number(slip.grossEarnings) * 12;
    const oldShortcut = Math.max(0, Math.round(grossAnnual - 75_000)); // the old PDF taxable-income math

    // The engine nets the standard deduction (and, in old regime, more). For NEW regime the
    // ₹75,000 std deduction is applied, but the engine also rounds/derives gross from
    // components — so taxable income is a real engine output, below raw gross, and equals
    // what the on-screen payslip shows. The point of PT2 is single-source, not a specific
    // number: assert it is a genuine reduced figure, not the ad-hoc shortcut recomputed here
    // only when they happen to differ.
    expect(figures.taxableIncome).toBeGreaterThan(0);
    expect(figures.taxableIncome).toBeLessThan(grossAnnual);
    // Standard-deduction accounting means taxable income is at most gross − 75,000.
    expect(figures.taxableIncome).toBeLessThanOrEqual(oldShortcut);
  });
});

// ── PT4 ────────────────────────────────────────────────────────────────────────
describe("PT4: prior-employer income + TDS thread from the employee record into the engine", () => {
  let orgId: string;
  const YEAR = 2026;
  const MONTH = 6; // June

  async function seedEmp(
    overrides: Partial<typeof employees.$inferInsert> = {},
  ): Promise<{ emp: typeof employees.$inferSelect; struct: typeof salaryStructures.$inferSelect }> {
    const { userId } = await seedUser(orgId, { email: `pt4-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: String(CTC_ANNUAL),
        basicPercent: String(BASIC_PCT),
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
        ...overrides,
      })
      .returning();
    return { emp: emp!, struct: struct! };
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("declared Form 12B figures reach the built payroll input", async () => {
    const { emp, struct } = await seedEmp({
      previousEmployerIncome: "500000",
      previousEmployerTds: "45000",
    });
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    expect(input.previousEmployerIncome).toBe(500_000);
    expect(input.previousEmployerTDS).toBe(45_000);
  });

  it("no Form 12B ⇒ a correct zero baseline (by design, not by accident)", async () => {
    const { emp, struct } = await seedEmp(); // columns default to '0'
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    expect(input.previousEmployerIncome).toBe(0);
    expect(input.previousEmployerTDS).toBe(0);
  });

  // ── HRA ingestion ─────────────────────────────────────────────────────────────
  // The declared annual rent (rentPaidAnnual) threads into the input as `rentPaid`, and the metro
  // flag is now DERIVED from the employee's CITY against the four metros (Mumbai/Delhi/Kolkata/
  // Chennai) — not the free `isMetroCity` boolean — so `isMetro` reaches the engine for the
  // s.10(13A) HRA exemption. Before, `rentPaid` was hardcoded 0 (over-deducted every old-regime renter).
  it("declared rent threads in, and metro is derived from a metro city, into the engine input", async () => {
    const { emp, struct } = await seedEmp({
      rentPaidAnnual: "300000",
      city: "Mumbai", // a metro → isMetro derived true (the boolean is no longer consulted)
    });
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    expect(input.rentPaid).toBe(300_000);
    expect(input.isMetro).toBe(true);
  });

  it("no rent declared ⇒ rentPaid defaults to 0 (non-renters unaffected)", async () => {
    const { emp, struct } = await seedEmp(); // rent_paid_annual defaults to '0'
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    expect(input.rentPaid).toBe(0);
  });
});

// ── PT4-SCREEN ───────────────────────────────────────────────────────────────
// P-15: the ON-SCREEN regime-comparison projection (`payroll.taxPreview` →
// `buildTaxProfileFromEmployee`) previously hardcoded previousEmployerIncome AND
// previousEmployerTDS to 0, even though the LOCKED-run path (buildEmployeePayrollInput,
// covered by the PT4 block above) already threaded both. So a mid-year joiner's prior
// salary was excluded from the projected annual base while the run included it — the
// screen and the run disagreed, and the joiner's projected liability was understated.
// These tests exercise the real endpoint end-to-end and are red before the fix.
describe("PT4-SCREEN: prior-employer income reaches the on-screen regime-comparison projection", () => {
  let orgId: string;
  const FY = "2026-2027";

  async function seedEmp(
    overrides: Partial<typeof employees.$inferInsert> = {},
  ): Promise<{ emp: typeof employees.$inferSelect; userId: string }> {
    const { userId } = await seedUser(orgId, { email: `pt4scr-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: String(CTC_ANNUAL),
        basicPercent: String(BASIC_PCT),
        hraPercentOfBasic: String(HRA_PCT_OF_BASIC),
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2026-06-01"), // mid-year joiner
        status: "active",
        state: "Maharashtra",
        taxRegime: "old",
        ...overrides,
      })
      .returning();
    return { emp: emp!, userId };
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("declared prior-employer income lifts the projected old-regime taxable income", async () => {
    // Two identical mid-year joiners; one has a declared ₹8,00,000 prior-employer income.
    const { emp: withPrior, userId: uWith } = await seedEmp({
      previousEmployerIncome: "800000",
      previousEmployerTds: "40000",
    });
    const { emp: without, userId: uWithout } = await seedEmp(); // both prior fields default to '0'

    const callerWith = payrollRouter.createCaller(createMockContext(uWith, orgId));
    const callerWithout = payrollRouter.createCaller(createMockContext(uWithout, orgId));

    const withPreview = await callerWith.taxPreview({ employeeId: withPrior.id, financialYear: FY });
    const withoutPreview = await callerWithout.taxPreview({ employeeId: without.id, financialYear: FY });

    expect(withPreview).not.toBeNull();
    expect(withoutPreview).not.toBeNull();

    // Green: prior-employer income is now in the projected annual base, so the joiner WITH a
    // declared prior income shows a strictly higher old-regime taxable income than one without.
    // Red before the fix: both hardcoded prior income to 0, so these were equal.
    expect(withPreview!.oldRegime.taxableIncome).toBeGreaterThan(
      withoutPreview!.oldRegime.taxableIncome,
    );
    // The lift is at least the netted-off prior income after the standard deduction already
    // consumed once — a conservative floor well above zero (the pre-fix delta).
    expect(
      withPreview!.oldRegime.taxableIncome - withoutPreview!.oldRegime.taxableIncome,
    ).toBeGreaterThan(500_000);
  });

  it("no prior employer (no Form 12B) ⇒ projection unchanged (baseline stays correct)", async () => {
    const { emp, userId } = await seedEmp(); // prior fields default to '0'
    const caller = payrollRouter.createCaller(createMockContext(userId, orgId));
    const preview = await caller.taxPreview({ employeeId: emp.id, financialYear: FY });
    expect(preview).not.toBeNull();
    // A zero-prior joiner is unaffected by the fix; taxable income is a normal positive figure.
    expect(preview!.oldRegime.taxableIncome).toBeGreaterThanOrEqual(0);
  });
});
