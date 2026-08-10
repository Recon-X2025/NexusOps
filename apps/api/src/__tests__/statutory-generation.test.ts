/**
 * Step 13 — close the compute→file loop + fix the ECR/ESI defects.
 * ─────────────────────────────────────────────────────────────────────────────
 * `generateStatutory` used to only flip the run's status label; the four statutory record
 * tables had no runtime producer (INSERTs existed only in tests). It now creates, from a
 * CFO-approved run's own payslips, one EPFO ECR + one ESI challan (members only) + one PT
 * challan per state + one salary-TDS (24Q) challan, refusing (never fabricating) when a levy
 * is owed and its org identifier is absent. The ECR member figures are built by `buildEcrLine`
 * from the PERSISTED PF wage base + EPS/EPF split, so the EPFO reconciliation invariants hold.
 *
 * Real Postgres; April 2026 (FY26) so the Labour-Codes 50% wage-base clamp is in force.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { buildEcrLine } from "../lib/india/ecr-format";
import {
  salaryStructures,
  employees,
  payrollRuns,
  payslips,
  epfoEcrSubmissions,
  esiChallanRecords,
  ptChallanRecords,
  tdsChallanRecords,
  organizations,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 4;
const Y = 2026;

describe("statutory generation — close the loop + ECR/ESI defect fixes", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
    // Org identity present for the happy paths (refusal test clears it).
    await testDb()
      .update(organizations)
      .set({
        epfCode: "KA/BNG/1234567/000",
        esiEstablishmentNumber: "12345678901234567",
        ptRegistrationNumber: "PT-KA-99999",
      })
      .where(eq(organizations.id, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedEmp(opts: {
    code: string;
    name: string;
    basicPercent: string;
    ctc: string;
    state: string;
  }): Promise<string> {
    const [s] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, ctcAnnual: opts.ctc, basicPercent: opts.basicPercent, effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `st-${nanoid(6)}@qa.coheronconnect.io`, name: opts.name });
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
        uan: `UAN${nanoid(6)}`,
      })
      .returning();
    return e!.id;
  }

  /** Park a run at TDS_COMPUTED and generate real payslips (populating the PF wage base + split). */
  async function runWithPayslips(): Promise<string> {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await caller.runs.computePayslips({ runId: run!.id });
    return run!.id;
  }
  async function approve(runId: string) {
    await testDb()
      .update(payrollRuns)
      .set({ pipelineStatus: "CFO_APPROVED", status: "cfo_approved" })
      .where(eq(payrollRuns.id, runId));
  }
  async function slipFor(runId: string, empId: string) {
    const [slip] = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    return slip!;
  }

  // ── Part 1: the loop ──────────────────────────────────────────────────────

  it("a CFO-approved run produces the records its payslips imply", async () => {
    await seedEmp({ code: "EMP-1", name: "Ravi Kumar", basicPercent: "40", ctc: "480000", state: "Karnataka" });
    const runId = await runWithPayslips();
    await approve(runId);

    await caller.runs.generateStatutory({ runId });

    const out = await caller.runs.statutoryOutputs({ runId });
    expect(out.epfoEcr).toBeTruthy();
    expect(out.tdsChallan).toBeTruthy();
    expect(out.tdsChallan!.tdsSection).toBe("192");
    expect(out.tdsChallan!.formType).toBe("24Q");
    // Karnataka gross 40k → PT ₹200, so a PT challan exists for that state.
    expect(out.ptChallans.map((p: { stateCode: string }) => p.stateCode)).toContain("Karnataka");
    // ECR totals reconcile to the payslip.
    const slip = await slipFor(runId, (await testDb().select().from(employees).where(eq(employees.orgId, orgId)))[0]!.id);
    expect(Number(out.epfoEcr!.totalEmployeeContribution)).toBe(Number(slip.pfEmployee));
  });

  it("a run that has NOT reached CFO_APPROVED produces no records", async () => {
    await seedEmp({ code: "EMP-1", name: "Ravi Kumar", basicPercent: "40", ctc: "480000", state: "Karnataka" });
    const runId = await runWithPayslips(); // stays at PAYSLIPS_GENERATED

    await expect(caller.runs.generateStatutory({ runId })).rejects.toThrow(/CFO approval/i);

    const out = await caller.runs.statutoryOutputs({ runId });
    expect(out.epfoEcr).toBeNull();
    expect(out.esiChallan).toBeNull();
    expect(out.tdsChallan).toBeNull();
    expect(out.ptChallans).toHaveLength(0);
  });

  it("the ESI challan covers only ESI members for the period", async () => {
    const memberId = await seedEmp({ code: "EMP-MEM", name: "Mira Nair", basicPercent: "40", ctc: "240000", state: "Karnataka" }); // gross 20k ≤ 21k → member
    await seedEmp({ code: "EMP-NON", name: "Big Earner", basicPercent: "40", ctc: "480000", state: "Karnataka" }); // gross 40k → non-member
    const runId = await runWithPayslips();
    await approve(runId);
    await caller.runs.generateStatutory({ runId });

    const out = await caller.runs.statutoryOutputs({ runId });
    expect(out.esiChallan).toBeTruthy();
    expect(out.esiChallan!.totalEmployees).toBe(1); // only the member
    const memSlip = await slipFor(runId, memberId);
    expect(Number(memSlip.esiEmployee)).toBeGreaterThan(0);
    expect(Number(out.esiChallan!.totalEmployeeContribution)).toBe(Number(memSlip.esiEmployee));
  });

  it("an org with no EPF establishment code is refused, naming the field, and creates nothing", async () => {
    await testDb().update(organizations).set({ epfCode: null }).where(eq(organizations.id, orgId));
    await seedEmp({ code: "EMP-1", name: "Ravi Kumar", basicPercent: "40", ctc: "480000", state: "Karnataka" });
    const runId = await runWithPayslips();
    await approve(runId);

    await expect(caller.runs.generateStatutory({ runId })).rejects.toThrow(/EPF establishment code/i);

    const out = await caller.runs.statutoryOutputs({ runId });
    expect(out.epfoEcr).toBeNull();
    expect(out.tdsChallan).toBeNull();
  });

  it("re-running generateStatutory on the same run does not duplicate any record", async () => {
    await seedEmp({ code: "EMP-1", name: "Ravi Kumar", basicPercent: "40", ctc: "480000", state: "Karnataka" });
    const runId = await runWithPayslips();
    await approve(runId);
    await caller.runs.generateStatutory({ runId });
    // Reset the gate and run again — the upsert must not duplicate.
    await approve(runId);
    await caller.runs.generateStatutory({ runId });

    const epf = await testDb().select().from(epfoEcrSubmissions).where(and(eq(epfoEcrSubmissions.orgId, orgId), eq(epfoEcrSubmissions.month, M), eq(epfoEcrSubmissions.year, Y)));
    const tds = await testDb().select().from(tdsChallanRecords).where(and(eq(tdsChallanRecords.orgId, orgId), eq(tdsChallanRecords.month, M), eq(tdsChallanRecords.year, Y)));
    const pt = await testDb().select().from(ptChallanRecords).where(and(eq(ptChallanRecords.orgId, orgId), eq(ptChallanRecords.stateCode, "Karnataka"), eq(ptChallanRecords.month, M), eq(ptChallanRecords.year, Y)));
    expect(epf).toHaveLength(1);
    expect(tds).toHaveLength(1);
    expect(pt).toHaveLength(1);
  });

  // ── Part 2: the ECR defects, on real run data ───────────────────────────────

  it("ECR: EPF wages and the EPF contribution agree, on an employee where the 50% clamp bit", async () => {
    // basic 25% of a ₹40k gross = ₹10k, but the 50% clamp lifts the wage base to ₹20k, capped
    // at ₹15k — so the base is NOT the raw basic, which is exactly when the old raw-basic epfWages
    // disagreed with the contribution.
    const empId = await seedEmp({ code: "EMP-CLAMP", name: "Asha Rao", basicPercent: "25", ctc: "480000", state: "Karnataka" });
    const runId = await runWithPayslips();
    const slip = await slipFor(runId, empId);

    expect(Number(slip.pfWageBase)).toBe(15000); // clamp bit + ceiling cap
    expect(Number(slip.pfWageBase)).not.toBe(Number(slip.basic)); // ≠ raw basic (₹10k)

    const line = buildEcrLine(slip, { uan: "U1", memberName: "Asha Rao" });
    expect(Math.round(line.epfWages * 0.12)).toBe(line.employeeEpf); // the EPFO reconciliation
  });

  it("ECR: employerEps + employerEpf is the run's 12% employer PF, EPS counted once (not the total)", async () => {
    const empId = await seedEmp({ code: "EMP-1", name: "Ravi Kumar", basicPercent: "40", ctc: "480000", state: "Karnataka" });
    const runId = await runWithPayslips();
    const slip = await slipFor(runId, empId);

    const line = buildEcrLine(slip, { uan: "U1", memberName: "Ravi Kumar" });
    // Each share is the persisted split, not the total employer PF.
    expect(line.employerEps).toBe(Number(slip.pfEmployerEps));
    expect(line.employerEpf).toBe(Number(slip.pfEmployerEpf));
    // Their sum is the 12% employer PF and is LESS than the total (which also carries EDLI +
    // admin). The old code put the TOTAL into employerEpf and added EPS again — overstated.
    expect(line.employerEps + line.employerEpf).toBeLessThan(Number(slip.pfEmployer));
    expect(line.employerEpf).not.toBe(Number(slip.pfEmployer));
    expect(line.employerEps + line.employerEpf).toBe(Number(slip.pfEmployerEps) + Number(slip.pfEmployerEpf));
  });

  it("ECR: member name is the person's name and NCP is the payslip's LOP days (buildEcrLine)", async () => {
    const line = buildEcrLine(
      { grossEarnings: "40000", pfWageBase: "15000", pfEmployee: "1800", pfEmployerEps: "1250", pfEmployerEpf: "551", lopDays: "3.0" },
      { uan: "U1", memberName: "Asha Rao" },
    );
    expect(line.memberName).toBe("Asha Rao"); // not an employee code
    expect(line.ncp).toBe(3); // from LOP days, not hardcoded 0
  });
});
