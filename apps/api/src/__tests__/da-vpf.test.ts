/**
 * Dearness Allowance (composition) + Voluntary PF — configuration the product must support.
 * ─────────────────────────────────────────────────────────────────────────────
 * DA: the employer elects the wage-base composition — basic alone, or basic + DA summing to the
 * same core. The 50% clamp resolves to half of total regardless of the split, so PF is identical.
 * DA is its own earnings line, carved from the special-allowance residual (gross total unchanged).
 * VPF: an extra EMPLOYEE PF rate above the statutory 12%; the employer contribution is unchanged.
 *
 * Real Postgres; April 2026 so the Labour-Codes 50% clamp is in force. CTC 240,000 → monthly gross
 * 20,000, core 50% = 10,000 (< ₹15,000 ceiling, so the half-of-total logic is what is tested, not the cap).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { computePF } from "@coheronconnect/payroll-math";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 4;
const Y = 2026;
const CTC = "240000"; // → 20,000/month gross; core 50% = 10,000

describe("Dearness Allowance + Voluntary PF", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    caller = payrollRouter.createCaller(createMockContext(s.adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedEmp(opts: {
    code: string;
    basicPercent: string;
    daPercent: string;
    voluntaryPfRate?: string;
  }): Promise<string> {
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: `S-${nanoid(4)}`,
        ctcAnnual: CTC,
        basicPercent: opts.basicPercent,
        daPercent: opts.daPercent,
        // lta/medical/conveyance default; residual absorbs the rest so gross = ctc/12.
        ltaAnnual: "0",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const { userId } = await seedUser(orgId, { email: `da-${nanoid(6)}@qa.coheronconnect.io` });
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
        voluntaryPfRate: opts.voluntaryPfRate ?? "0",
      })
      .returning();
    return e!.id;
  }

  async function runPayslips(): Promise<string> {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await caller.runs.computePayslips({ runId: run!.id });
    return run!.id;
  }
  async function slip(runId: string, empId: string) {
    const [row] = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    return row!;
  }

  it("DA 10% + basic 40% yields the SAME wage base and PF as basic 50% with no DA", async () => {
    const withDa = await seedEmp({ code: "EMP-DA", basicPercent: "40", daPercent: "10" });
    const noDa = await seedEmp({ code: "EMP-NODA", basicPercent: "50", daPercent: "0" });
    const runId = await runPayslips();

    const a = await slip(runId, withDa);
    const b = await slip(runId, noDa);

    // Wage base is exactly half of total (₹10,000), the same for both compositions.
    expect(Number(a.pfWageBase)).toBe(10000);
    expect(Number(b.pfWageBase)).toBe(10000);
    expect(Number(a.pfWageBase)).toBe(Number(b.pfWageBase));
    // …and therefore identical PF.
    expect(Number(a.pfEmployee)).toBe(Number(b.pfEmployee));
    expect(Number(a.pfEmployer)).toBe(Number(b.pfEmployer));
    // Gross total is unchanged — DA is carved out of the residual, not added on top.
    expect(Number(a.grossEarnings)).toBe(Number(b.grossEarnings));
  });

  it("DA appears as its own payslip line", async () => {
    const withDa = await seedEmp({ code: "EMP-DA", basicPercent: "40", daPercent: "10" });
    const noDa = await seedEmp({ code: "EMP-NODA", basicPercent: "50", daPercent: "0" });
    const runId = await runPayslips();

    expect(Number((await slip(runId, withDa)).da)).toBe(2000); // 10% of 20,000
    expect(Number((await slip(runId, noDa)).da)).toBe(0);
  });

  it("a voluntary PF rate raises the EMPLOYEE contribution; the employer contribution is unchanged", async () => {
    const vpf = await seedEmp({ code: "EMP-VPF", basicPercent: "50", daPercent: "0", voluntaryPfRate: "8" });
    const plain = await seedEmp({ code: "EMP-PLAIN", basicPercent: "50", daPercent: "0" });
    const runId = await runPayslips();

    const v = await slip(runId, vpf);
    const p = await slip(runId, plain);

    // Statutory 12% of 10,000 = 1,200; +8% VPF = 800 → 2,000 employee.
    expect(Number(p.pfEmployee)).toBe(1200);
    expect(Number(v.pfEmployee)).toBe(2000);
    expect(Number(v.pfEmployee)).toBeGreaterThan(Number(p.pfEmployee));
    // Employer contribution is identical — VPF never touches the employer side.
    expect(Number(v.pfEmployer)).toBe(Number(p.pfEmployer));
  });

  it("computePF: VPF is employee-only (pure) — employer split byte-identical", () => {
    const without = computePF(10000, false, 15000, 0);
    const withVpf = computePF(10000, false, 15000, 0.08);
    expect(without.totalEmployee).toBe(1200);
    expect(withVpf.totalEmployee).toBe(2000);
    expect(withVpf.employeeVoluntaryPF).toBe(800);
    expect(without.employeeVoluntaryPF).toBe(0);
    // Every employer figure is unchanged by VPF.
    expect(withVpf.employerEPF).toBe(without.employerEPF);
    expect(withVpf.employerEPS).toBe(without.employerEPS);
    expect(withVpf.employerEDLI).toBe(without.employerEDLI);
    expect(withVpf.adminCharges).toBe(without.adminCharges);
    expect(withVpf.totalEmployer).toBe(without.totalEmployer);
  });

  it("byte-identical for a plain employee (no DA, no VPF): wage base ₹10,000, PF ₹1,200, DA ₹0", async () => {
    const plain = await seedEmp({ code: "EMP-PLAIN", basicPercent: "50", daPercent: "0" });
    const runId = await runPayslips();
    const p = await slip(runId, plain);
    expect(Number(p.pfWageBase)).toBe(10000);
    expect(Number(p.pfEmployee)).toBe(1200);
    expect(Number(p.da)).toBe(0);
  });
});
