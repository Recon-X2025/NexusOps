/**
 * Employer PF rate (10% vs 12%) + Para 26(6) uncapped PF + bonus-gate Basic+DA.
 * ─────────────────────────────────────────────────────────────────────────────
 * Item 2: an org may contribute at 10% (small/sick establishment) instead of 12% — both sides.
 * Item 3: Para 26(6) contributes on the FULL basic (uncapped) ONLY with an approval reference and a
 *         reached effective date; EPS stays capped at ₹15,000; clearing an approved election warns.
 * Item 4: the Payment of Bonus Act eligibility gate reads Basic+DA, not basic alone.
 *
 * Real Postgres; April 2026 so the Labour-Codes clamp is in force.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { hrRouter } from "../routers/hr";
import { computeEmployeePayslip, type EmployeePayrollInput } from "@coheronconnect/payroll-math";
import { salaryStructures, employees, payrollRuns, payslips, organizations, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 4;
const Y = 2026;
const PERIOD_START = new Date(Y, M - 1, 1);

describe("PF employer rate + Para 26(6) + bonus gate", () => {
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

  async function seedEmp(opts: {
    code: string;
    ctc: string;
    basicPercent?: string;
    para266ApprovalReference?: string | null;
    para266EffectiveFrom?: Date | null;
  }): Promise<string> {
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, ctcAnnual: opts.ctc, basicPercent: opts.basicPercent ?? "50", ltaAnnual: "0", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `pf-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: opts.code,
        salaryStructureId: st!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Karnataka",
        taxRegime: "new",
        para266ApprovalReference: opts.para266ApprovalReference ?? null,
        para266EffectiveFrom: opts.para266EffectiveFrom ?? null,
      })
      .returning();
    return e!.id;
  }

  async function runPayslips(): Promise<string> {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await payroll.runs.computePayslips({ runId: run!.id });
    return run!.id;
  }
  async function slip(runId: string, empId: string) {
    const [row] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    return row!;
  }
  async function setOrgRate(rate: string) {
    await testDb().update(organizations).set({ pfContributionRate: rate }).where(eq(organizations.id, orgId));
  }

  // ── Item 2: employer contribution rate ──────────────────────────────────────

  it("an org at 10% computes PF at 10% (both sides); an org at 12% is unchanged", async () => {
    const at10 = await seedEmp({ code: "EMP-10", ctc: "240000" }); // wage base 10,000
    await setOrgRate("10");
    let runId = await runPayslips();
    let s = await slip(runId, at10);
    expect(Number(s.pfWageBase)).toBe(10000);
    expect(Number(s.pfEmployee)).toBe(1000); // 10% of 10,000 (vs 1,200 at 12%)
    expect(Number(s.pfEmployerEpf)).toBe(167); // (10% − 8.33%) of 10,000
    expect(Number(s.pfEmployerEps)).toBe(833); // 8.33% of 10,000 (unchanged)

    // A fresh org left at the default 12% is unchanged from today.
    const other = await seedFullOrg();
    const payroll12 = payrollRouter.createCaller(createMockContext(other.adminId, other.orgId));
    const [st12] = await testDb().insert(salaryStructures).values({ orgId: other.orgId, structureName: "S", ctcAnnual: "240000", basicPercent: "50", ltaAnnual: "0", effectiveFrom: new Date("2015-01-01") }).returning();
    const { userId: u12 } = await seedUser(other.orgId, { email: `pf12-${nanoid(6)}@qa.coheronconnect.io` });
    const [e12] = await testDb().insert(employees).values({ orgId: other.orgId, userId: u12, employeeId: "EMP-12", salaryStructureId: st12!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new" }).returning();
    const [r12] = await testDb().insert(payrollRuns).values({ orgId: other.orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" }).returning();
    await payroll12.runs.computePayslips({ runId: r12!.id });
    const [s12] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, r12!.id), eq(payslips.employeeId, e12!.id)));
    expect(Number(s12!.pfEmployee)).toBe(1200); // 12% — unchanged from today
    await cleanupOrg(other.orgId);
  });

  // ── Item 3: Para 26(6) ──────────────────────────────────────────────────────

  it("Para 26(6): approval reference + reached effective date → uncapped base; EPS still capped", async () => {
    const emp = await seedEmp({ code: "EMP-266", ctc: "480000", para266ApprovalReference: "EPFO/JD/2024/12345", para266EffectiveFrom: new Date("2020-01-01") });
    const runId = await runPayslips();
    const s = await slip(runId, emp);
    expect(Number(s.pfWageBase)).toBe(20000); // full basic, above the ₹15,000 ceiling
    expect(Number(s.pfEmployee)).toBe(2400); // 12% of 20,000
    expect(Number(s.pfEmployerEps)).toBe(1250); // EPS still 8.33% of ₹15,000, NOT of 20,000
  });

  it("Para 26(6): request + undertaking but NO approval reference → capped at ₹15,000", async () => {
    // Record everything except the approval reference — the ceiling still applies.
    const { userId } = await seedUser(orgId, { email: `noref-${nanoid(6)}@qa.coheronconnect.io` });
    const [st] = await testDb().insert(salaryStructures).values({ orgId, structureName: "S", ctcAnnual: "480000", basicPercent: "50", ltaAnnual: "0", effectiveFrom: new Date("2015-01-01") }).returning();
    const [e] = await testDb().insert(employees).values({ orgId, userId, employeeId: "EMP-NOREF", salaryStructureId: st!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new", para266JointRequest: true, para266EmployerUndertaking: true, para266ApprovalReference: null, para266EffectiveFrom: new Date("2020-01-01") }).returning();
    const runId = await runPayslips();
    const s = await slip(runId, e!.id);
    expect(Number(s.pfWageBase)).toBe(15000); // capped regardless of request/undertaking
    expect(Number(s.pfEmployee)).toBe(1800);
  });

  it("Para 26(6): approval reference but effective date NOT yet reached → capped", async () => {
    const emp = await seedEmp({ code: "EMP-FUTURE", ctc: "480000", para266ApprovalReference: "EPFO/JD/2030/9", para266EffectiveFrom: new Date("2030-01-01") });
    const runId = await runPayslips();
    const s = await slip(runId, emp);
    expect(Number(s.pfWageBase)).toBe(15000); // effective date in the future → ceiling applies
    expect(Number(s.pfEmployee)).toBe(1800);
  });

  it("Para 26(6): clearing an approved election warns and is accepted (not refused)", async () => {
    const emp = await seedEmp({ code: "EMP-REVOKE", ctc: "480000", para266ApprovalReference: "EPFO/JD/2024/777", para266EffectiveFrom: new Date("2020-01-01") });
    const res = await hr.employees.update({ id: emp, para266ApprovalReference: "" });
    expect(res.warnings.some((w: string) => /irrevocable/i.test(w))).toBe(true);
    // …and it was accepted: the reference is now cleared.
    const [row] = await testDb().select({ ref: employees.para266ApprovalReference }).from(employees).where(eq(employees.id, emp));
    expect(row!.ref ?? "").toBe("");
  });

  // ── Item 4: bonus eligibility on Basic + DA (pure engine) ───────────────────

  function baseInput(over: Partial<EmployeePayrollInput>): EmployeePayrollInput {
    return {
      id: "e", name: "E", employeeCode: "EMP-B", pan: "", uan: "", designation: "", department: "",
      state: "Karnataka", isMetro: false, joiningDate: new Date("2020-01-01"),
      basicMonthly: 20000, hraMonthly: 0, specialAllowance: 0, ltaAnnual: 0,
      regime: "NEW", section80C: 0, section80D: 0, section80CCD1B: 0, section80TTA: 0, section24b: 0,
      hraExemption: 0, otherExemptions: 0, rentPaid: 0,
      daysInMonth: 30, daysWorked: 30, lopDays: 0,
      overtime: 0, arrears: 0, bonus: 5000, otherEarnings: 0, otherDeductions: 0,
      isVoluntaryHigherPF: false, previousEmployerIncome: 0, previousEmployerTDS: 0,
      ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0, month: M, year: Y,
      ...over,
    };
  }
  const CEIL = { bonusEligibilityCeiling: 21000 };

  it("bonus gate reads Basic+DA: ₹20,000 basic + ₹2,000 DA is OUTSIDE eligibility (bonus dropped)", () => {
    const withDa = computeEmployeePayslip(baseInput({ daMonthly: 2000 }), M, CEIL); // basic+DA = 22,000 > 21,000
    const basicAlone = computeEmployeePayslip(baseInput({ daMonthly: 0 }), M, CEIL); // 20,000 ≤ 21,000
    // With DA the gate reads 22,000 > 21,000 → INELIGIBLE, the ₹5,000 statutory bonus is dropped.
    // On basic alone the gate would read 20,000 ≤ 21,000 → eligible, bonus retained. (The gross
    // figures aren't compared directly — `withDa` also carries the ₹2,000 DA, which would confound it.)
    expect(withDa.bonus).toBe(0);
    expect(basicAlone.bonus).toBe(5000);
  });

  // ── Byte-identical ──────────────────────────────────────────────────────────

  it("byte-identical: plain employee, no DA/VPF/Para 26(6), 12% — PF ₹1,200 on wage base ₹10,000", async () => {
    const plain = await seedEmp({ code: "EMP-PLAIN", ctc: "240000" });
    const runId = await runPayslips();
    const s = await slip(runId, plain);
    expect(Number(s.pfWageBase)).toBe(10000);
    expect(Number(s.pfEmployee)).toBe(1200);
    expect(Number(s.pfEmployerEpf)).toBe(367); // 3.67% at 12% — unchanged
  });
});
