/**
 * Write-path resilience + flag parity for a structure-without-state employee.
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildEmployeePayrollInput` THROWS for an employee with a salary structure but no state
 * (payroll-run-aggregates.ts: `if (!state) throw`). The two run paths used to treat that
 * throw differently:
 *   • computePayrollRunTotals (preview) CATCHES it per-employee, flags the employee, and
 *     continues — the run still totals everyone else.
 *   • computePayslips (write) did NOT catch it. The loop ran inside `db.transaction`, so
 *     one state-less employee rolled the whole write back — NOBODY got a payslip — and the
 *     mutation threw a raw error with no per-employee flag.
 * The write path now mirrors the preview: it skips the bad-data employee, names it on the
 * run's own output (`workflowMetadata.errors` → the mutation's `errors`), and writes the
 * rest. These tests are RED before that change (the mutation rejects, nobody is written)
 * and GREEN after.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const NO_STATE_RE = /no state on record/i;

describe("computePayslips — one bad-data employee cannot fail the run for everyone", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  /** One employee with its own structure. `state: null` is the bad-data (legacy) row. */
  async function seedEmp(opts: { state: string | null; code: string }): Promise<string> {
    const [s] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: "600000", basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `wr-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: opts.code,
        salaryStructureId: s!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: opts.state,
        taxRegime: "new",
      })
      .returning();
    return e!.id;
  }

  /** A run parked directly at TDS_COMPUTED (no lock step), so any flag on the result is the
   *  write path's OWN — proving it does not depend on the preview having run first. */
  async function tdsRun(month: number, year: number): Promise<string> {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month, year, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    return run!.id;
  }

  it("writes the good employee, skips the state-less one, names it — and never throws", async () => {
    const goodId = await seedEmp({ state: "Karnataka", code: "EMP-GOOD" });
    const badId = await seedEmp({ state: null, code: "EMP-NOSTATE" });
    const runId = await tdsRun(4, 2026);

    // RED before: this REJECTS (uncaught throw → transaction rollback, nobody paid).
    const result = await caller.runs.computePayslips({ runId });

    const good = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, goodId)));
    const bad = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, badId)));
    expect(good).toHaveLength(1); // the good employee IS written
    expect(bad).toHaveLength(0); // the state-less one is NOT

    // …and is NAMED in the write path's own output, not silently dropped.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flagged = result.errors.find((e: any) => e.employeeId === badId);
    expect(flagged).toBeTruthy();
    expect(flagged!.message).toMatch(NO_STATE_RE);
    expect(result.employeeCount).toBe(1); // count reflects what was actually written
  });

  it("flag parity: preview and write both surface the SAME state-less employee", async () => {
    const goodId = await seedEmp({ state: "Karnataka", code: "EMP-GOOD" });
    const badId = await seedEmp({ state: null, code: "EMP-NOSTATE" });

    // Preview path: already catches + flags per-employee, and still counts the good one.
    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);
    const previewFlag = totals.errors.find((e) => e.employeeId === badId);
    expect(previewFlag).toBeTruthy();
    expect(previewFlag!.message).toMatch(NO_STATE_RE);
    expect(totals.employeeCount).toBe(1);
    expect(totals.errors.some((e) => e.employeeId === goodId)).toBe(false); // good one clean

    // Write path: flags the SAME employee id on its own output — parity closed.
    const runId = await tdsRun(4, 2026);
    const result = await caller.runs.computePayslips({ runId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(result.errors.some((e: any) => e.employeeId === badId)).toBe(true);
  });

  it("an all-good run still writes everyone and flags nobody (no regression)", async () => {
    const aId = await seedEmp({ state: "Karnataka", code: "EMP-A" });
    const bId = await seedEmp({ state: "Maharashtra", code: "EMP-B" });
    const runId = await tdsRun(4, 2026);

    const result = await caller.runs.computePayslips({ runId });

    const rows = await testDb().select().from(payslips).where(eq(payslips.payrollRunId, runId));
    expect(rows.map((r) => r.employeeId).sort()).toEqual([aId, bId].sort());
    expect(result.employeeCount).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(result.errors.filter((e: any) => NO_STATE_RE.test(e.message))).toHaveLength(0);
  });
});
