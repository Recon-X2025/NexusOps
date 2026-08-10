/**
 * Effective-structure exclusion — lock and payslip generation must AGREE.
 * ─────────────────────────────────────────────────────────────────────────────
 * The lock/totals path (`computePayrollRunTotals`) used to select structures with a direct
 * `innerJoin` on `salaryStructureId` (payroll-run-aggregates.ts) — no effective-date test — so
 * it COUNTED an employee whose structure is not yet in effect for the period. Payslip generation
 * (`computePayslips`, payroll.ts) resolves via `resolveSalaryStructureForPeriod` and on a miss did
 * a bare `continue`: the employee was never written and NEVER named. Net effect: the run reported
 * a headcount and totals at lock, then produced fewer payslips with an empty errors array — a
 * headcount that shrank at payslip time with no explanation.
 *
 * The fix makes BOTH paths resolve through the same resolver, and names the excluded employee (by
 * CODE, not a raw UUID) in the run's error channel — the same channel the structureless-employee
 * flag already uses, with an identical message on both paths so they de-dup to one flag.
 *
 * RED before the fix: lock over-counts and raises no flag; the write path drops the employee
 * silently. GREEN after: both exclude it, report the same headcount, and name it.
 *
 * Real Postgres. Karnataka (monthly PT) keeps the arithmetic simple; April is not a half-yearly
 * collection month, so no PT-timing noise.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const NOT_EFFECTIVE_RE = /no version of it is in effect/i;
const STRUCTURELESS_RE = /is missing a salary structure/i;

describe("effective-structure exclusion — lock and payslip generation agree and name the excluded", () => {
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

  /** One employee with its own single-version structure. `effectiveFrom` is the lever under test
   *  (the DB trigger backfills family_id = id, so the resolver matches on the origin version). */
  async function seedEmp(opts: { code: string; effectiveFrom: Date; state?: string }): Promise<string> {
    const [s] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: "600000", basicPercent: "40", effectiveFrom: opts.effectiveFrom })
      .returning();
    const { userId } = await seedUser(orgId, { email: `eff-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: opts.code,
        salaryStructureId: s!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: opts.state ?? "Karnataka",
        taxRegime: "new",
      })
      .returning();
    return e!.id;
  }

  /** An employed employee with NO salary structure — for the structureless-flag regression. */
  async function seedStructureless(code: string): Promise<string> {
    const { userId } = await seedUser(orgId, { email: `nostruct-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: code,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Karnataka",
        taxRegime: "new",
      })
      .returning();
    return e!.id;
  }

  /** A run parked at TDS_COMPUTED so `computePayslips` runs standalone — proving the write path
   *  raises the flag on its OWN output, not only via a prior lock step. */
  async function tdsRun(month: number, year: number): Promise<string> {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month, year, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    return run!.id;
  }

  it("a not-yet-effective structure is excluded from BOTH paths, with the SAME headcount, and named by code", async () => {
    const goodId = await seedEmp({ code: "EMP-EFFECTIVE", effectiveFrom: new Date("2015-01-01") });
    // Structure begins 2026-04-09 — AFTER the April period start (2026-04-01) → resolver miss.
    const lateId = await seedEmp({ code: "EMP-LATE", effectiveFrom: new Date("2026-04-09") });

    // ── Lock / totals path ──
    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);
    expect(totals.employeeCount).toBe(1); // only the effective employee is counted
    const lockFlag = totals.errors.find((e) => e.employeeId === lateId);
    expect(lockFlag).toBeTruthy();
    expect(lockFlag!.message).toMatch(NOT_EFFECTIVE_RE);
    expect(lockFlag!.message).toContain("EMP-LATE"); // named by CODE
    expect(lockFlag!.message).not.toContain(lateId); // NOT the raw UUID an admin can't act on
    expect(totals.errors.some((e) => e.employeeId === goodId)).toBe(false); // effective one is clean

    // ── Write path ──
    const runId = await tdsRun(4, 2026);
    const result = await caller.runs.computePayslips({ runId });
    expect(result.employeeCount).toBe(1);
    expect(result.employeeCount).toBe(totals.employeeCount); // the two paths agree

    const good = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, goodId)));
    const late = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, lateId)));
    expect(good).toHaveLength(1); // effective employee IS paid
    expect(late).toHaveLength(0); // not-effective one is NOT

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeFlag = result.errors.find((e: any) => e.employeeId === lateId);
    expect(writeFlag).toBeTruthy();
    expect(writeFlag!.message).toMatch(NOT_EFFECTIVE_RE);
    expect(writeFlag!.message).toContain("EMP-LATE");
  });

  it("an employee whose structure IS effective is unaffected — full totals and a payslip", async () => {
    const goodId = await seedEmp({ code: "EMP-OK", effectiveFrom: new Date("2015-01-01") });

    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);
    expect(totals.employeeCount).toBe(1);
    expect(totals.totalGross).toBe(50_000); // 600000 / 12, no LOP
    expect(totals.errors.some((e) => NOT_EFFECTIVE_RE.test(e.message))).toBe(false);

    const runId = await tdsRun(4, 2026);
    const result = await caller.runs.computePayslips({ runId });
    expect(result.employeeCount).toBe(1);
    const rows = await testDb().select().from(payslips).where(eq(payslips.payrollRunId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.employeeId).toBe(goodId);
    expect(Number(rows[0]!.grossEarnings)).toBe(50_000);
  });

  it("the existing structureless-employee flag still fires and reads the same (not relabelled)", async () => {
    const nsId = await seedStructureless("EMP-NOSTRUCT");

    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);
    expect(totals.employeeCount).toBe(0);
    const flag = totals.errors.find((e) => e.employeeId === nsId);
    expect(flag).toBeTruthy();
    expect(flag!.message).toMatch(STRUCTURELESS_RE);
    expect(flag!.message).toContain("EMP-NOSTRUCT");
    expect(flag!.message).not.toMatch(NOT_EFFECTIVE_RE); // distinct from the effective-structure case
  });

  it("a run where every employee is effective flags nobody for effective-structure and pays all", async () => {
    await seedEmp({ code: "EMP-1", effectiveFrom: new Date("2015-01-01"), state: "Karnataka" });
    await seedEmp({ code: "EMP-2", effectiveFrom: new Date("2015-01-01"), state: "Maharashtra" });

    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);
    expect(totals.employeeCount).toBe(2);
    expect(totals.errors.filter((e) => NOT_EFFECTIVE_RE.test(e.message))).toHaveLength(0);

    const runId = await tdsRun(4, 2026);
    const result = await caller.runs.computePayslips({ runId });
    expect(result.employeeCount).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(result.errors.filter((e: any) => NOT_EFFECTIVE_RE.test(e.message))).toHaveLength(0);
    const rows = await testDb().select().from(payslips).where(eq(payslips.payrollRunId, runId));
    expect(rows).toHaveLength(2);
  });

  it("a mid-year revision: lock resolves the period's version (v2), not the family origin (v1), and agrees with payslip generation on the AMOUNT", async () => {
    // A two-version family. v1 (₹6,00,000 CTC → ₹50,000/mo) is auto-closed mid-March 2026; v2
    // (₹12,00,000 CTC → ₹1,00,000/mo, a mid-year raise) runs from mid-March onward. Employees
    // link to the FAMILY. A direct id-join (lock's old approach) would have resolved the ORIGIN
    // version v1 (₹50,000); the effective-window resolver returns v2 (₹1,00,000) for an April-2026
    // run. This is the behaviour change the fix introduces on the lock side — it now matches what
    // payslip generation already did.
    //
    // WHY v2 STARTS 15 MARCH, NOT 1 APRIL — DO NOT MOVE THIS TO THE 1st.
    // The real paths build the period start as `new Date(year, month-1, 1)`, a LOCAL-time value
    // (payroll-run-aggregates.ts / payroll.ts). On the deployed stack that is UTC (node:20-alpine,
    // no TZ → UTC), so for an April run it is 2026-04-01T00:00:00Z and a structure effective
    // 2026-04-01 (stored UTC-midnight) resolves via the inclusive `<=`. But on a developer machine
    // in IST the same expression is 2026-03-31T18:30:00Z, which is BEFORE a 1-April UTC-midnight
    // effectiveFrom — so a boundary date would make THIS test's outcome depend on the runner's
    // timezone (green in UTC/CI, red in IST-dev). This test is about VERSION SELECTION, not the
    // boundary, so v2 begins mid-month: unambiguously inside the April window in every timezone.
    // The 1st-of-period UTC-boundary sensitivity is a separate, recorded hazard — see
    // reports/fix-plan.md "PERIOD-START-TZ-BOUNDARY". Establish it before touching the resolver.
    const v1From = new Date("2025-04-01T00:00:00Z");
    const revisionFrom = new Date("2026-03-15T00:00:00Z"); // mid-month → TZ-independent for an April run
    const [v1] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `Rev-${nanoid(4)}`, ctcAnnual: "600000", basicPercent: "40", effectiveFrom: v1From, effectiveTo: revisionFrom })
      .returning();
    const familyId = v1!.familyId; // trigger backfilled family_id = id
    await testDb()
      .insert(salaryStructures)
      .values({ orgId, familyId, structureName: v1!.structureName, ctcAnnual: "1200000", basicPercent: "40", effectiveFrom: revisionFrom, effectiveTo: null })
      .returning();

    const { userId } = await seedUser(orgId, { email: `rev-${nanoid(6)}@qa.coheronconnect.io` });
    const [emp] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: "EMP-REVISED", salaryStructureId: familyId, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new" })
      .returning();

    // Run April 2026 (FY26). The resolver returns v2 for both paths.
    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);
    expect(totals.employeeCount).toBe(1);
    expect(totals.totalGross).toBe(100_000); // v2 (₹12,00,000 / 12) — NOT v1's ₹50,000
    expect(totals.totalGross).not.toBe(50_000);

    const runId = await tdsRun(4, 2026);
    const result = await caller.runs.computePayslips({ runId });
    expect(result.employeeCount).toBe(1);
    const rows = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, emp!.id)));
    expect(rows).toHaveLength(1);
    // The two paths agree on the AMOUNT, not just the headcount — both resolved v2.
    expect(Number(rows[0]!.grossEarnings)).toBe(100_000);
    expect(Number(rows[0]!.grossEarnings)).toBe(totals.totalGross);
  });
});
