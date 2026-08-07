/**
 * A structure-less employee is flagged on the run, not silently dropped.
 * ─────────────────────────────────────────────────────────────────────────────
 * computePayrollRunTotals inner-joins salary structures, so an active employee with no salary
 * structure was excluded from the run entirely — unpaid, no error, invisible. A separate lookup
 * now finds them before the join and pushes a per-employee warning naming them. An employee WITH
 * a structure is unaffected.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const NO_STRUCT_RE = /no salary structure/i;

describe("structure-less employee is flagged, not silently dropped", () => {
  let orgId: string;

  async function seedEmp(opts: { withStructure: boolean; code: string }): Promise<string> {
    const { userId } = await seedUser(orgId, { email: `str-${nanoid(6)}@qa.coheronconnect.io` });
    let salaryStructureId: string | null = null;
    if (opts.withStructure) {
      const [struct] = await testDb()
        .insert(salaryStructures)
        .values({ orgId, structureName: "Std", ctcAnnual: "780000", basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
        .returning();
      salaryStructureId = struct!.id;
    }
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: opts.code,
        salaryStructureId,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Karnataka",
      })
      .returning();
    return emp!.id;
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("names the structure-less employee and excludes them from the run", async () => {
    const noStructId = await seedEmp({ withStructure: false, code: "EMP-NOSTRUCT" });

    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);

    const warn = totals.errors.find((e) => NO_STRUCT_RE.test(e.message));
    expect(warn).toBeTruthy();
    expect(warn!.employeeId).toBe(noStructId);
    expect(warn!.message).toContain("EMP-NOSTRUCT");
    // Excluded from the run — not counted.
    expect(totals.employeeCount).toBe(0);
  });

  it("an employee WITH a structure is unaffected and produces no such warning", async () => {
    await seedEmp({ withStructure: true, code: "EMP-OK" });

    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);

    expect(totals.errors.filter((e) => NO_STRUCT_RE.test(e.message))).toHaveLength(0);
    expect(totals.employeeCount).toBe(1);
  });

  it("in a mixed run, only the structure-less employee is flagged", async () => {
    await seedEmp({ withStructure: true, code: "EMP-OK" });
    const noStructId = await seedEmp({ withStructure: false, code: "EMP-NOSTRUCT" });

    const totals = await computePayrollRunTotals(testDb(), orgId, 4, 2026);

    const warns = totals.errors.filter((e) => NO_STRUCT_RE.test(e.message));
    expect(warns).toHaveLength(1);
    expect(warns[0]!.employeeId).toBe(noStructId);
    expect(totals.employeeCount).toBe(1); // only the structured employee is paid
  });
});
