/**
 * EMPLOYEE STATUTORY IDENTITY — international worker, residential status, PF KYC, ID verification.
 * ─────────────────────────────────────────────────────────────────────────────
 * G27: an EPF **international worker** contributes on FULL wages — the ₹15,000 ceiling does not
 * apply. Before this there was no flag by which the ceiling could be disapplied, so hiring one
 * under-contributed PF and filed an ECR reporting a wage the dues did not correspond to.
 *
 * The gating differs from Para 26(6) and the difference matters:
 *   Para 26(6) is ELECTIVE — no recorded EPFO approval reference, no uncapping.
 *   IW status is MANDATORY BY OPERATION OF THE SCHEME — the flag alone uncaps, no reference.
 *
 * Real Postgres.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { hrRouter } from "../routers/hr";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 4;
const Y = 2026;

describe("employee statutory identity", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payroll: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hr: any;
  let orgId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    payroll = payrollRouter.createCaller(createMockContext(s.adminId, orgId));
    hr = hrRouter.createCaller(createMockContext(s.adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedEmp(code: string, extra: Record<string, unknown> = {}) {
    // ctc 480,000 ⇒ basic 20,000/month, comfortably above the ₹15,000 ceiling.
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: `S-${nanoid(4)}`,
        ctcAnnual: "480000",
        basicPercent: "50",
        ltaAnnual: "0",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const { userId } = await seedUser(orgId, { email: `iw-${nanoid(6)}@qa.coheronconnect.io` });
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
        ...extra,
      })
      .returning();
    return e!.id;
  }

  async function runAndSlip(empId: string) {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await payroll.runs.computePayslips({ runId: run!.id });
    const [row] = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, run!.id), eq(payslips.employeeId, empId)));
    return row!;
  }

  // ── G27: the money path ─────────────────────────────────────────────────────

  it("a domestic employee is capped at the ₹15,000 PF ceiling (unchanged baseline)", async () => {
    const emp = await seedEmp("EMP-DOM");
    const s = await runAndSlip(emp);
    expect(Number(s.pfWageBase)).toBe(15_000);
    expect(Number(s.pfEmployee)).toBe(1_800);
  });

  it("an INTERNATIONAL WORKER contributes on the full uncapped wage — no ₹15,000 ceiling", async () => {
    const emp = await seedEmp("EMP-IW", { internationalWorker: true });
    const s = await runAndSlip(emp);
    expect(Number(s.pfWageBase)).toBe(20_000); // full basic, not the ceiling
    expect(Number(s.pfEmployee)).toBe(2_400); // 12% of 20,000, not 1,800
  });

  it("IW needs NO approval reference — unlike Para 26(6), which is refused without one", async () => {
    // Same wage, same everything, differing only in HOW the uncap is authorised.
    const iw = await seedEmp("EMP-IW2", { internationalWorker: true });
    const elective = await seedEmp("EMP-P266", {
      para266JointRequest: true,
      para266EmployerUndertaking: true,
      para266ApprovalReference: null, // no reference ⇒ must stay capped
      para266EffectiveFrom: new Date("2020-01-01"),
    });

    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await payroll.runs.computePayslips({ runId: run!.id });
    const rows = await testDb()
      .select()
      .from(payslips)
      .where(eq(payslips.payrollRunId, run!.id));
    const byEmp = new Map(rows.map((r) => [r.employeeId, r]));

    expect(Number(byEmp.get(iw)!.pfWageBase)).toBe(20_000); // uncapped by status alone
    expect(Number(byEmp.get(elective)!.pfWageBase)).toBe(15_000); // elective, unauthorised ⇒ capped
  });

  it("EPS stays ceiling-capped for an IW — PINNED, see the Para 83 scope note", async () => {
    // DELIBERATE SCOPE DECISION, NOT AN ASSERTION THAT THIS IS THE FINAL RULE.
    // EPFO's position is that an IW's pension contribution is also on full wages, resting on
    // Para 83 — which the Karnataka HC struck down in 2024 and which is under appeal. Uncapping
    // EPS would be implementing a rule that is currently void; leaving it capped matches the
    // domestic treatment we already ship. Pinned so a ruling breaks a test rather than silently
    // moving pension contributions.
    const emp = await seedEmp("EMP-IW-EPS", { internationalWorker: true });
    const s = await runAndSlip(emp);
    expect(Number(s.pfWageBase)).toBe(20_000); // wage base IS uncapped
    expect(Number(s.pfEmployerEps)).toBe(1_250); // EPS still 8.33% of ₹15,000
  });

  // ── Defaults: every new column must leave existing rows unchanged ────────────

  it("defaults are honest for an existing row — pending KYC, unverified IDs, not an IW", async () => {
    const emp = await seedEmp("EMP-DEFAULTS");
    const [row] = await testDb().select().from(employees).where(eq(employees.id, emp));
    expect(row!.internationalWorker).toBe(false);
    expect(row!.residentialStatus).toBeNull();
    expect(row!.pfJoinDate).toBeNull();
    // `pending`, not `done`: we do not know this employee's KYC state, and defaulting to done
    // would assert something unverified about a filing gate.
    expect(row!.pfKycStatus).toBe("pending");
    expect(row!.aadhaarVerification).toBe("unverified");
    expect(row!.panVerification).toBe("unverified");
    expect(row!.bankVerification).toBe("unverified");
  });

  it("records KYC and verification state when set", async () => {
    const emp = await seedEmp("EMP-KYC", {
      pfKycStatus: "done",
      pfKycDocument: "PAN",
      pfKycVerifiedAt: new Date("2025-10-06"),
      panVerification: "verified",
      bankVerification: "verified",
      aadhaarVerification: "unverified",
      residentialStatus: "non_resident",
      pfJoinDate: new Date("2020-01-15"),
    });
    const [row] = await testDb().select().from(employees).where(eq(employees.id, emp));
    expect(row!.pfKycStatus).toBe("done");
    expect(row!.pfKycDocument).toBe("PAN");
    expect(row!.panVerification).toBe("verified");
    expect(row!.aadhaarVerification).toBe("unverified");
    expect(row!.residentialStatus).toBe("non_resident");
    expect(row!.pfJoinDate).not.toBeNull();
  });

  // ── Reachability: settable through the API, not only by direct insert ───────

  it("hr.employees.update sets the IW flag, and the very next run uncaps that employee's PF", async () => {
    // Proves the whole path end to end: a domestic employee is capped, an admin marks them an
    // international worker through the ordinary update procedure, and the next payroll run
    // contributes on the full wage. Without this the columns would be schema-only.
    const emp = await seedEmp("EMP-UPD");
    const before = await runAndSlip(emp);
    expect(Number(before.pfWageBase)).toBe(15_000);

    await hr.employees.update({
      id: emp,
      internationalWorker: true,
      residentialStatus: "non_resident",
      pfKycStatus: "done",
      pfKycDocument: "PAN",
      panVerification: "verified",
    });

    const [row] = await testDb().select().from(employees).where(eq(employees.id, emp));
    expect(row!.internationalWorker).toBe(true);
    expect(row!.residentialStatus).toBe("non_resident");
    expect(row!.pfKycStatus).toBe("done");
    expect(row!.panVerification).toBe("verified");

    // A second run in a later month, now uncapped.
    const [run2] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M + 1, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await payroll.runs.computePayslips({ runId: run2!.id });
    const [after] = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, run2!.id), eq(payslips.employeeId, emp)));
    expect(Number(after!.pfWageBase)).toBe(20_000);
    expect(Number(after!.pfEmployee)).toBe(2_400);
  });
});
