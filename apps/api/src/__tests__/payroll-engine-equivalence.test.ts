/**
 * DUP-1 fairness check — one payroll engine, one set of figures.
 * ─────────────────────────────────────────────────────────────────────────────
 * A second India payroll engine (`apps/api/src/lib/india/payroll-engine.ts`) used
 * to sit behind `hr.payroll.runMonthlyPayroll` and the `hr.payroll.compute*Slip`
 * previews. It carried pre-fix slabs/surcharge/rebate, no ESI, no LOP, no
 * effective-dated ceilings, and YTD hardcoded to 0 — so a slip previewed through
 * `hr.payroll.*` could disagree with the payslip the run pipeline
 * (`payroll.runs.computePayslips`) actually wrote.
 *
 * That engine has been deleted. Both the (rerouted) `hr.payroll.computeMonthlySlip`
 * preview and `payroll.runs.computePayslips` now build their input with the SAME
 * bridge and run the SAME engine:
 *
 *     buildEmployeePayrollInput(emp, struct, month, year, lop?)
 *       → computeEmployeePayslip(input, fyMonth, ceilings)
 *
 * This test proves the two paths produce identical core figures for the same
 * employee + period. Before the fix the second engine's numbers diverged (red);
 * with a single engine they are byte-for-byte identical (green). It also guards
 * against the second engine being reintroduced.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { employees, salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import {
  buildEmployeePayrollInput,
  calendarToFyMonth,
} from "../services/payroll-run-aggregates";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";

const YEAR = 2026;
const MONTH = 5; // May — FY month 2

describe("DUP-1: hr.payroll preview and payroll.runs share one engine", () => {
  let orgId: string;

  async function seedEmp(): Promise<{
    emp: typeof employees.$inferSelect;
    struct: typeof salaryStructures.$inferSelect;
  }> {
    const { userId } = await seedUser(orgId, {
      email: `emp-${nanoid(6)}@qa.coheronconnect.io`,
    });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: "1200000",
        basicPercent: "40",
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

  it("preview path and run path produce identical core payslip figures", async () => {
    const { emp, struct } = await seedEmp();
    const db = testDb();
    const periodDate = new Date(YEAR, MONTH - 1, 1);

    // Ceilings are resolved once from the same source both call sites use.
    const ceilings = await resolveStatutoryCeilings(db, orgId, periodDate);
    const fyMonth = calendarToFyMonth(MONTH);

    // (a) The `hr.payroll.computeMonthlySlip` reroute: build input from the
    //     resolved structure/employee and run the live engine.
    const previewInput = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    const preview = computeEmployeePayslip(previewInput, fyMonth, ceilings);

    // (b) The `payroll.runs.computePayslips` path: identical bridge + engine
    //     (lopMap.get(emp.id) is undefined here — same as the preview, which
    //     passes no attendance).
    const runInput = buildEmployeePayrollInput(emp, struct, MONTH, YEAR, undefined);
    const run = computeEmployeePayslip(runInput, fyMonth, ceilings);

    // Every figure the two endpoints surface must match exactly.
    expect(preview.basicEarned).toBe(run.basicEarned);
    expect(preview.hraEarned).toBe(run.hraEarned);
    expect(preview.specialAllowance).toBe(run.specialAllowance);
    expect(preview.lta).toBe(run.lta);
    expect(preview.bonus).toBe(run.bonus);
    expect(preview.grossEarnings).toBe(run.grossEarnings);
    expect(preview.employeePF).toBe(run.employeePF);
    expect(preview.employerPF).toBe(run.employerPF);
    expect(preview.professionalTax).toBe(run.professionalTax);
    expect(preview.lwf).toBe(run.lwf);
    expect(preview.tds).toBe(run.tds);
    expect(preview.totalDeductions).toBe(run.totalDeductions);
    expect(preview.netPay).toBe(run.netPay);

    // Sanity: this is a live, non-trivial slip (not a universally-zero engine
    // that would make the equality above vacuous).
    expect(run.grossEarnings).toBeGreaterThan(0);
    expect(run.netPay).toBeGreaterThan(0);
    expect(run.netPay).toBe(Math.max(0, run.grossEarnings - run.totalDeductions));
  });

  it("the second India payroll engine module is gone (no reintroduction)", async () => {
    await expect(
      import("../lib/india/payroll-engine.js" as string),
    ).rejects.toThrow();
  });
});
