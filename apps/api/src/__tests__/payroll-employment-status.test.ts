/**
 * Anyone EMPLOYED during the pay period is paid — the run must not exclude probation / on_leave.
 * ─────────────────────────────────────────────────────────────────────────────
 * Both run paths filtered `status = "active"`, so a probation or on_leave employee got no payslip,
 * no total and no flag — silently unpaid. The fix selects PAYROLL_EMPLOYED_STATUSES
 * (active + probation + on_leave); leavers (resigned/terminated/offboarded) stay excluded pending a
 * full-and-final path. These assert against the run's OWN selection (computePayrollRunTotals), not a
 * status column value:
 *
 *  - a probation employee is paid EXACTLY like an otherwise-identical active one (PF/ESI/PT/TDS);
 *  - an on_leave employee is likewise PAID like active — the status is employment; whether the leave
 *    is paid or unpaid is a loss-of-pay computation driven by ATTENDANCE, not by this status;
 *  - the createOnboarding shape (active, no salary structure) is STILL excluded and STILL flagged —
 *    widening the status filter must not make it payable (it is held out by the missing structure);
 *  - active employees are unchanged (an active-only org is byte-identical — the existing
 *    payroll/money-invariant suites are the byte-identity guard).
 */
import { describe, it, expect, afterEach } from "vitest";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";

// A low, ESI-eligible salary (monthly gross ≈ ₹20,000 ≤ ₹21,000) so PF, ESI and PT are all non-zero
// and meaningfully compared; TDS is ₹0 at this bracket (new-regime rebate) and is asserted equal too.
const CTC_ANNUAL = "240000";

type Emp = { status: "active" | "probation" | "on_leave"; withStructure?: boolean; state?: string | null };

describe("payroll run — employment status selection (probation / on_leave)", () => {
  const createdOrgs: string[] = [];
  afterEach(async () => {
    for (const id of createdOrgs) await cleanupOrg(id);
    createdOrgs.length = 0;
  });

  /** Fresh org, one shared salary structure, one employee per entry; returns the run totals. */
  async function run(emps: Emp[]) {
    const { orgId } = await seedTestOrg();
    createdOrgs.push(orgId);
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: CTC_ANNUAL, basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    for (const e of emps) {
      const { userId } = await seedUser(orgId, { email: `es-${nanoid(6)}@qa.coheronconnect.io` });
      await testDb()
        .insert(employees)
        .values({
          orgId,
          userId,
          employeeId: `EMP-${nanoid(5)}`,
          salaryStructureId: e.withStructure === false ? null : struct!.id,
          state: e.state === undefined ? "Karnataka" : e.state,
          startDate: new Date("2020-01-01"),
          status: e.status,
          taxRegime: "new",
        });
    }
    return computePayrollRunTotals(testDb(), orgId, 4, 2026);
  }

  it("a probation employee is paid EXACTLY like an otherwise-identical active employee", async () => {
    const baseline = await run([{ status: "active" }]);
    const withProbation = await run([{ status: "active" }, { status: "probation" }]);

    expect(baseline.employeeCount).toBe(1);
    expect(withProbation.employeeCount).toBe(2); // RED before: probation was excluded → 1

    // Adding one identical probation employee doubles every statutory total → they are paid the same.
    expect(withProbation.totalGross).toBe(2 * baseline.totalGross);
    expect(withProbation.totalPfEmployee).toBe(2 * baseline.totalPfEmployee);
    expect(withProbation.totalEsiEmployee).toBe(2 * baseline.totalEsiEmployee);
    expect(withProbation.totalPt).toBe(2 * baseline.totalPt);
    expect(withProbation.totalTds).toBe(2 * baseline.totalTds);
    // sanity: the salary really does exercise PF and ESI (not a vacuous 0 === 0). PT and TDS are ₹0
    // at this bracket / in the test env (no PT config, new-regime rebate), so their equality above is
    // a "no divergence" check rather than a magnitude one.
    expect(baseline.totalPfEmployee).toBeGreaterThan(0);
    expect(baseline.totalEsiEmployee).toBeGreaterThan(0);
  });

  it("an on_leave employee is PAID like active (the status is employment; LOP is attendance-driven, not status)", async () => {
    const baseline = await run([{ status: "active" }]);
    const withOnLeave = await run([{ status: "active" }, { status: "on_leave" }]);

    expect(withOnLeave.employeeCount).toBe(2); // RED before: on_leave was excluded → 1
    expect(withOnLeave.totalGross).toBe(2 * baseline.totalGross);
    expect(withOnLeave.totalPfEmployee).toBe(2 * baseline.totalPfEmployee);
    expect(withOnLeave.totalEsiEmployee).toBe(2 * baseline.totalEsiEmployee);
    expect(withOnLeave.totalPt).toBe(2 * baseline.totalPt);
  });

  it("the createOnboarding shape (active, no structure, no state) is STILL excluded and STILL flagged", async () => {
    const totals = await run([{ status: "active", withStructure: false, state: null }]);

    expect(totals.employeeCount).toBe(0); // not paid — held out by the missing structure, not the status
    const warn = totals.errors.find((e) => /salary structure/i.test(e.message));
    expect(warn).toBeTruthy();
    // The corrected message names EVERY missing field, not just the structure.
    expect(warn!.message).toMatch(/state/i);
  });

  it("an active-only org is unchanged (positive control; byte-identity covered by the existing suites)", async () => {
    const totals = await run([{ status: "active" }]);
    expect(totals.employeeCount).toBe(1);
    expect(totals.totalGross).toBeGreaterThan(0);
    // A well-formed active employee raises no STRUCTURE warning (ESI-identity notes may still appear
    // because this seed sets no ESI numbers — those are unrelated to the status-filter fix).
    expect(totals.errors.filter((e) => /salary structure/i.test(e.message))).toHaveLength(0);
  });
});
