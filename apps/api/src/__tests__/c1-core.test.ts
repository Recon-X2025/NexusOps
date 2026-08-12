/**
 * C1-CORE — the money-path half of the migration batch.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. HRA metro is derived from the city against the FOUR-city list (Mumbai/Delhi/Kolkata/Chennai),
 *    not a free boolean — a Bangalore employee resolves NON-metro (40%), Chennai metro (50%).
 * 2. A declared 80C reaches computeTax through the RUN and REDUCES the old-regime TDS — asserted as
 *    a rupee difference, not just a non-zero field. (The run is the actual-deduction site.)
 */
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { isMetroCity } from "@coheronconnect/payroll-math";
import { salaryStructures, employees, payrollRuns, payslips, taxDeclarations, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("C1-CORE: HRA metro derivation", () => {
  it("resolves ONLY the four metros (and legacy variants); everything else is non-metro", () => {
    for (const m of ["Mumbai", "Delhi", "New Delhi", "Kolkata", "Chennai", "bombay", "MADRAS", "calcutta"]) {
      expect(isMetroCity(m)).toBe(true);
    }
    for (const n of ["Bangalore", "Bengaluru", "Hyderabad", "Pune", "Kochi", "Coimbatore", "", null, undefined]) {
      expect(isMetroCity(n as string)).toBe(false);
    }
  });
});

describe("C1-CORE: a declared 80C reduces old-regime TDS through the run", () => {
  const M = 4, Y = 2026; // April → FY start year 2026
  let orgId: string, adminId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payroll: any, empId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    payroll = payrollRouter.createCaller(createMockContext(adminId, orgId));
    // Old-regime employee earning enough to have TDS (₹12L/yr Base Pay), Karnataka (monthly PT, no metro).
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `C1-${nanoid(4)}`, ctcAnnual: "1200000", basicPercent: "50", daPercent: "0", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `c1-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: st!.id, startDate: new Date("2018-01-01"), status: "active", state: "Karnataka", city: "Bangalore", taxRegime: "old" })
      .returning();
    empId = e!.id;
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function runTds(): Promise<number> {
    const [r] = await testDb().insert(payrollRuns).values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" }).returning();
    await payroll.runs.computePayslips({ runId: r!.id });
    const [slip] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, r!.id), eq(payslips.employeeId, empId)));
    // clean up the run's payslips so the next run is independent
    await testDb().delete(payslips).where(eq(payslips.payrollRunId, r!.id));
    await testDb().delete(payrollRuns).where(eq(payrollRuns.id, r!.id));
    return Number(slip!.tds || 0);
  }

  it("with no declaration the old-regime employee is over-deducted; a ₹1.5L 80C lowers the monthly TDS", async () => {
    const tdsBefore = await runTds();
    expect(tdsBefore).toBeGreaterThan(0); // old-regime ₹12L earner has TDS

    await testDb().insert(taxDeclarations).values({
      orgId, employeeId: empId, fiscalYear: Y, section80C: "150000", provenance: "provisional",
    });
    const tdsAfter = await runTds();

    expect(tdsAfter).toBeLessThan(tdsBefore); // the declaration reduced the deduction
    // ₹1.5L off taxable income at the old-regime marginal rate is a few thousand/yr → hundreds/mo.
    const monthlyDrop = tdsBefore - tdsAfter;
    expect(monthlyDrop).toBeGreaterThan(100);
  });

  it("a LAPSED declaration is treated as zero (no reduction)", async () => {
    const tdsBefore = await runTds();
    await testDb().insert(taxDeclarations).values({
      orgId, employeeId: empId, fiscalYear: Y, section80C: "150000", provenance: "lapsed",
    });
    const tdsAfter = await runTds();
    expect(tdsAfter).toBe(tdsBefore); // lapsed ⇒ zeroed ⇒ no change
  });
});
