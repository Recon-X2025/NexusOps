/**
 * UNIT 5 — the regime-comparison view (payroll.taxPreview) reads the employee's REAL declarations.
 * ─────────────────────────────────────────────────────────────────────────────
 * The run path feeds each employee's non-lapsed old-regime declarations into the tax engine; the
 * on-screen old-vs-new comparison used `buildTaxProfileFromEmployee`, which hardcoded 80C/D/CCD1B/
 * TTA/24b to 0 — the fifth, formerly-divergent site. So it over-stated old-regime tax and could
 * recommend NEW when an employee's real declarations favour OLD. Now it reads the same figures.
 *
 * These assert the comparison BEFORE and AFTER a declaration for the SAME employee: old-regime tax
 * drops when an 80C declaration exists, new-regime tax is unchanged (the new regime ignores 80C),
 * and a `lapsed` declaration is ignored (values zeroed, matching the run path's filter).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { salaryStructures, employees, payrollRuns, payslips, taxDeclarations, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("taxPreview: regime comparison uses the employee's real declarations", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;
  let orgId: string;
  let empId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = payrollRouter.createCaller(createMockContext(seeded.adminId, orgId));

    // High-CTC old-regime employee so taxable income is well into a taxed band (80C actually moves it).
    const [s] = await testDb().insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: "1800000", basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `rc-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb().insert(employees)
      .values({ orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: s!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "old" })
      .returning();
    empId = e!.id;

    // A payslip carrying the FY gross so the projection's income basis (fyGross, taken as the annual
    // figure — payroll.ts:202) lands well inside a taxed band where 80C actually moves the tax.
    const [run] = await testDb().insert(payrollRuns)
      .values({ orgId, month: 4, year: 2026, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await testDb().insert(payslips)
      .values({ orgId, payrollRunId: run!.id, employeeId: empId, month: 4, year: 2026, grossEarnings: "1800000" });
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  const preview = () => caller.taxPreview({ employeeId: empId, financialYear: "2026-2027" });

  it("lowers old-regime tax when an 80C declaration exists; leaves new-regime tax unchanged", async () => {
    const before = await preview();
    const oldBefore = before.oldRegime.totalTaxLiability;
    const newBefore = before.newRegime.totalTaxLiability;

    await testDb().insert(taxDeclarations)
      .values({ orgId, employeeId: empId, fiscalYear: 2026, section80C: "150000", provenance: "provisional" });

    const after = await preview();
    // The declaration reduces old-regime taxable income → strictly less tax (the fix; before, equal).
    expect(after.oldRegime.totalTaxLiability).toBeLessThan(oldBefore);
    // New regime ignores Chapter VI-A → unchanged.
    expect(after.newRegime.totalTaxLiability).toBe(newBefore);
  });

  it("ignores a lapsed declaration (values zeroed, as the run path does)", async () => {
    const before = await preview();
    const oldBefore = before.oldRegime.totalTaxLiability;

    await testDb().insert(taxDeclarations)
      .values({ orgId, employeeId: empId, fiscalYear: 2026, section80C: "150000", provenance: "lapsed" });

    const after = await preview();
    expect(after.oldRegime.totalTaxLiability).toBe(oldBefore); // lapsed → treated as no declaration
  });
});
