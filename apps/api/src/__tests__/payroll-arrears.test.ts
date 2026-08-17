/**
 * ARREARS — back-pay for an earlier period, paid in a later one.
 * ─────────────────────────────────────────────────────────────────────────────
 * The gap this closes: `salaryStructures.upsert` refuses to edit a version that already has
 * payslips and tells the operator to "post the change as arrears in the current month" — a
 * route with no implementation. `buildEmployeePayrollInput` hardcoded `arrears: 0`, `payslips`
 * had no column to store it, and `payslip-view` emitted a hardcoded 0.
 *
 * These tests prove the whole path: record → run reads it → gross rises → it is PERSISTED →
 * the rendered payslip's earnings lines sum to its gross. Plus the suggestion engine against
 * a genuinely backdated structure, on the issued payslip's own attendance basis.
 *
 * Real Postgres.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { buildPayslipView } from "../lib/payslip-view";
import {
  salaryStructures,
  employees,
  payrollRuns,
  payslips,
  payrollArrears,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 7;
const Y = 2026;

describe("payroll arrears", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payroll: any;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    payroll = payrollRouter.createCaller(createMockContext(s.adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedEmp(code: string, ctc: string, effectiveFrom = new Date("2015-01-01")) {
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: `S-${nanoid(4)}`,
        ctcAnnual: ctc,
        basicPercent: "50",
        ltaAnnual: "0",
        effectiveFrom,
      })
      .returning();
    const { userId } = await seedUser(orgId, { email: `arr-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: code,
        salaryStructureId: st!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Karnataka",
        taxRegime: "new",
      })
      .returning();
    return { empId: e!.id, structureId: st!.id };
  }

  async function runFor(month: number, year: number) {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month, year, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await payroll.runs.computePayslips({ runId: run!.id });
    return run!.id;
  }

  /** computePayslips advances the run past TDS_COMPUTED and refuses a second call. Re-arm it,
   *  which is what an operator does by re-opening the run to recompute after fixing an input. */
  async function rearm(runId: string) {
    await testDb()
      .update(payrollRuns)
      .set({ pipelineStatus: "TDS_COMPUTED", status: "draft" })
      .where(eq(payrollRuns.id, runId));
  }

  async function slipFor(runId: string, empId: string) {
    const [row] = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    return row!;
  }

  // ── The end-to-end path ─────────────────────────────────────────────────────

  it("recorded arrears raise gross and are PERSISTED on the payslip", async () => {
    const { empId } = await seedEmp("EMP-ARR", "600000"); // 50,000/month gross

    const baseRun = await runFor(M, Y);
    const baseline = await slipFor(baseRun, empId);
    expect(Number(baseline.arrears)).toBe(0);

    await payroll.arrears.upsert({
      employeeId: empId,
      month: M,
      year: Y,
      amount: 20_000,
      reason: "Apr–Jun revision backdated",
    });

    // Re-run the same period: computePayslips deletes and recomputes, which is exactly why
    // arrears live outside the payslip. The figure must survive that.
    await rearm(baseRun);
    await payroll.runs.computePayslips({ runId: baseRun });
    const withArrears = await slipFor(baseRun, empId);

    expect(Number(withArrears.arrears)).toBe(20_000);
    expect(Number(withArrears.grossEarnings)).toBe(Number(baseline.grossEarnings) + 20_000);
  });

  it("arrears DO lift the PF wage base via the Labour-Code 50% proviso — pinned, see OPEN QUESTION", async () => {
    // OBSERVED, NOT ASSERTED-AS-CORRECT. `computeEmployeePayslip` puts arrears in
    // `excludedAllowances`, so a large arrears payment pushes excluded allowances past 50% of
    // total remuneration and the Code on Wages s.2(y) proviso claws the excess back into
    // wages — lifting the PF wage base (here 10,000 → the 15,000 ceiling) and so the PF
    // deducted in the month arrears are paid.
    //
    // OPEN QUESTION (needs a CA ruling, recorded in reports/fix-plan.md):
    //   EPFO's position is that arrears of WAGES attract PF in the month of payment, so a
    //   lift is directionally right. But two things are unestablished: (a) whether the
    //   s.2(y) proviso is the correct mechanism, or whether arrears-of-basic should enter
    //   the core wage directly; and (b) whether PF on arrears should be computed month-wise
    //   against each covered month's own ceiling rather than in one lump in the payment
    //   month. Those give different figures for anyone near the ceiling.
    //
    // This test EXISTS TO PIN the behaviour so the ruling, when it comes, changes a failing
    // test rather than silently changing everyone's PF.
    const { empId } = await seedEmp("EMP-PF", "240000"); // basic 10,000/month, under the ceiling
    const runId = await runFor(M, Y);
    const before = await slipFor(runId, empId);
    expect(Number(before.pfWageBase)).toBe(10_000);

    await payroll.arrears.upsert({ employeeId: empId, month: M, year: Y, amount: 50_000 });
    await rearm(runId);
    await payroll.runs.computePayslips({ runId });
    const after = await slipFor(runId, empId);

    expect(Number(after.arrears)).toBe(50_000);
    expect(Number(after.grossEarnings)).toBeGreaterThan(Number(before.grossEarnings));
    // The proviso lifts the base to the statutory ceiling and no further — the ceiling still binds.
    expect(Number(after.pfWageBase)).toBe(15_000);
    expect(Number(after.pfEmployee)).toBe(1_800);
  });

  it("the rendered payslip's earnings lines sum to its gross once arrears are paid", async () => {
    // The defect this pins: payslip-view hardcoded `arrears: 0` while gross INCLUDED arrears,
    // so the printed lines could not sum to the printed total.
    const { empId } = await seedEmp("EMP-VIEW", "600000");
    const runId = await runFor(M, Y);
    await payroll.arrears.upsert({ employeeId: empId, month: M, year: Y, amount: 12_345 });
    await rearm(runId);
    await payroll.runs.computePayslips({ runId });

    const slip = await slipFor(runId, empId);
    const e = buildPayslipView({ slip }).earnings;
    expect(e.arrears).toBe(12_345);
    const lineSum =
      e.basic + e.da + e.hra + e.specialAllowance + e.lta + e.conveyance + e.medical +
      e.overtime + e.arrears + e.bonus + e.otherEarnings;
    expect(lineSum).toBe(e.gross);
  });

  // ── Idempotency + guards ────────────────────────────────────────────────────

  it("upsert corrects rather than accumulating — a second call must not double-pay", async () => {
    const { empId } = await seedEmp("EMP-IDEM", "600000");
    await payroll.arrears.upsert({ employeeId: empId, month: M, year: Y, amount: 10_000 });
    await payroll.arrears.upsert({ employeeId: empId, month: M, year: Y, amount: 15_000 });

    const rows = await testDb()
      .select()
      .from(payrollArrears)
      .where(and(eq(payrollArrears.employeeId, empId), eq(payrollArrears.month, M)));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount)).toBe(15_000);
  });

  it("refuses to change arrears for a period that is already approved or paid", async () => {
    const { empId } = await seedEmp("EMP-LOCKED", "600000");
    await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: 3, year: Y, status: "paid", pipelineStatus: "PAID" });

    await expect(
      payroll.arrears.upsert({ employeeId: empId, month: 3, year: Y, amount: 5_000 }),
    ).rejects.toThrow(/already approved or paid/i);
  });

  it("refuses an employee from another org", async () => {
    const other = await seedFullOrg();
    const otherPayroll = payrollRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    const { empId } = await seedEmp("EMP-MINE", "600000");
    await expect(
      otherPayroll.arrears.upsert({ employeeId: empId, month: M, year: Y, amount: 1_000 }),
    ).rejects.toThrow(/not found/i);
    await cleanupOrg(other.orgId);
  });

  it("list returns only this org's rows for the period; remove deletes", async () => {
    const { empId } = await seedEmp("EMP-LIST", "600000");
    const saved = await payroll.arrears.upsert({
      employeeId: empId,
      month: M,
      year: Y,
      amount: 7_000,
    });
    const listed = await payroll.arrears.list({ month: M, year: Y });
    expect(listed).toHaveLength(1);
    expect(listed[0].employeeCode).toBe("EMP-LIST");
    expect(Number(listed[0].amount)).toBe(7_000);

    await payroll.arrears.remove({ id: saved.id });
    expect(await payroll.arrears.list({ month: M, year: Y })).toHaveLength(0);
  });

  // ── suggest ─────────────────────────────────────────────────────────────────

  it("suggest proposes the shortfall for a backdated revision over already-paid months", async () => {
    // Effective 1 Apr 2026; May and Jun already paid at the OLD rate; paying in Jul.
    const { empId, structureId } = await seedEmp("EMP-SUGG", "600000"); // 50,000/mo
    const mayRun = await runFor(5, Y);
    const junRun = await runFor(6, Y);
    const mayGross = Number((await slipFor(mayRun, empId)).grossEarnings);
    const junGross = Number((await slipFor(junRun, empId)).grossEarnings);

    // Now revise the structure UP, backdated to April.
    await testDb()
      .update(salaryStructures)
      .set({ ctcAnnual: "720000", effectiveFrom: new Date(2026, 3, 1) }) // 60,000/mo
      .where(eq(salaryStructures.id, structureId));

    const s = await payroll.arrears.suggest({ employeeId: empId, month: 7, year: Y });
    expect(s.applicable).toBe(true);
    // April has no payslip (never run) → contributes nothing. May + Jun do.
    expect(s.periods.map((p: { month: number }) => p.month).sort()).toEqual([5, 6]);
    expect(s.payable).toBe(
      Math.round(60_000 - mayGross) + Math.round(60_000 - junGross),
    );
    expect(s.recovery).toBe(0);
    expect(s.structureId).toBe(structureId);
  });

  it("suggest declines when the version is not backdated — the run already prices it", async () => {
    const { empId, structureId } = await seedEmp("EMP-CURRENT", "600000");
    await testDb()
      .update(salaryStructures)
      // LOCAL midnight, matching how the resolver compares (`new Date(year, month-1, 1)`).
      // A UTC-midnight value here is 05:30 local in IST and reads as NOT-yet-effective —
      // the PERIOD-START-TZ-BOUNDARY hazard, reproduced.
      .set({ effectiveFrom: new Date(Y, M - 1, 1) })
      .where(eq(salaryStructures.id, structureId));

    const s = await payroll.arrears.suggest({ employeeId: empId, month: M, year: Y });
    expect(s.applicable).toBe(false);
    expect(s.reason).toMatch(/not backdated/i);
  });

  it("suggest excludes arrears already paid, so a second run does not propose them again", async () => {
    const { empId, structureId } = await seedEmp("EMP-TWICE", "600000");
    const mayRun = await runFor(5, Y);

    // Pay 8,000 of arrears in May itself, then re-run so it is persisted on the May payslip.
    await payroll.arrears.upsert({ employeeId: empId, month: 5, year: Y, amount: 8_000 });
    await rearm(mayRun);
    await payroll.runs.computePayslips({ runId: mayRun });
    const may = await slipFor(mayRun, empId);
    expect(Number(may.arrears)).toBe(8_000);

    await testDb()
      .update(salaryStructures)
      .set({ ctcAnnual: "720000", effectiveFrom: new Date(2026, 3, 1) })
      .where(eq(salaryStructures.id, structureId));

    const s = await payroll.arrears.suggest({ employeeId: empId, month: 6, year: Y });
    // May's comparison must be against gross EX the 8,000 already paid as arrears —
    // otherwise the 8,000 reads as a shortfall and gets proposed a second time.
    const mayLine = s.periods.find((p: { month: number }) => p.month === 5)!;
    expect(mayLine.paidGross).toBe(Number(may.grossEarnings) - 8_000);
  });
});
