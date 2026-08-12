/**
 * Web-intake contract for the statutory config the forms now expose.
 * ─────────────────────────────────────────────────────────────────────────────
 * These exercise the tRPC procedures the new/updated web forms call:
 *   - onboarding.updateStatutoryIdentity  (the org Statutory Identity settings screen)
 *   - payroll.salaryStructures.create     (DA % field)
 *   - hr.employees.create                 (Voluntary PF + Para 26(6) fields)
 *   - payroll.runs.generateStatutory      (step 13 succeeds once identifiers are set)
 *
 * Real Postgres; April 2026 (Labour-Codes 50% clamp in force).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { onboardingRouter } from "../routers/onboarding";
import { payrollRouter } from "../routers/payroll";
import { hrRouter } from "../routers/hr";
import {
  organizations,
  employees,
  salaryStructures,
  payrollRuns,
  payslips,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 4;
const Y = 2026;

describe("statutory web intake (the forms' tRPC contract)", () => {
  let orgId: string, adminId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onboarding: any, payroll: any, hr: any;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    const ctx = createMockContext(adminId, orgId);
    onboarding = onboardingRouter.createCaller(ctx);
    payroll = payrollRouter.createCaller(ctx);
    hr = hrRouter.createCaller(ctx);
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function runPayslips(): Promise<string> {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await payroll.runs.computePayslips({ runId: run!.id });
    return run!.id;
  }
  async function slip(runId: string, empId: string) {
    const [row] = await testDb()
      .select()
      .from(payslips)
      .where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    return row!;
  }

  // ── 1. Org statutory identity settable after onboarding, and persists ────────
  it("updateStatutoryIdentity sets ESI + PT + PF rate after onboarding, and they persist", async () => {
    await onboarding.updateStatutoryIdentity({
      epfCode: "KA/BNG/1234567/000",
      esiEstablishmentNumber: "12345678901234567",
      ptRegistrationNumber: "PT-KA-99999",
      pfContributionRate: 12,
    });
    const [row] = await testDb()
      .select({
        epf: organizations.epfCode,
        esi: organizations.esiEstablishmentNumber,
        pt: organizations.ptRegistrationNumber,
        rate: organizations.pfContributionRate,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(row!.esi).toBe("12345678901234567");
    expect(row!.pt).toBe("PT-KA-99999");
    expect(Number(row!.rate)).toBe(12);
    // …and the settings screen can read them back.
    const wiz = await onboarding.getWizardData();
    expect(wiz.india.ptRegistrationNumber).toBe("PT-KA-99999");
    expect(wiz.india.esi).toBe("12345678901234567");
  });

  // ── 2. Reduced-rate reason rule ──────────────────────────────────────────────
  it("10% without a reason is refused; 12% carries no reason", async () => {
    await expect(onboarding.updateStatutoryIdentity({ pfContributionRate: 10 })).rejects.toThrow(
      /requires a reason/i,
    );
    await onboarding.updateStatutoryIdentity({ pfContributionRate: 10, pfReducedRateReason: "under_20_employees" });
    let [row] = await testDb()
      .select({ rate: organizations.pfContributionRate, reason: organizations.pfReducedRateReason })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(Number(row!.rate)).toBe(10);
    expect(row!.reason).toBe("under_20_employees");
    // Returning to 12% clears the reason.
    await onboarding.updateStatutoryIdentity({ pfContributionRate: 12, pfReducedRateReason: "bidi" });
    [row] = await testDb()
      .select({ rate: organizations.pfContributionRate, reason: organizations.pfReducedRateReason })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(Number(row!.rate)).toBe(12);
    expect(row!.reason).toBeNull();
  });

  // ── 3. DA % on the structure form persists and payroll computes DA ───────────
  it("a salary structure created with a DA % persists it, and payroll computes DA", async () => {
    const name = `DA-${nanoid(4)}`;
    await payroll.salaryStructures.upsert({
      structureName: name,
      ctcAnnual: 240000,
      basicPercent: 40,
      daPercent: 10,
      hraPercentOfBasic: 50,
      effectiveFrom: new Date("2015-01-01"),
    });
    const [persisted] = await testDb()
      .select()
      .from(salaryStructures)
      .where(and(eq(salaryStructures.orgId, orgId), eq(salaryStructures.structureName, name)));
    expect(Number(persisted!.daPercent)).toBe(10);

    const { userId } = await seedUser(orgId, { email: `da-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: "EMP-DA", salaryStructureId: persisted!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new" })
      .returning();
    const runId = await runPayslips();
    const s = await slip(runId, e!.id);
    expect(Number(s.da)).toBe(2000); // 10% of 20,000/month
    // core = basic (8,000) + DA (2,000) = 10,000; 50% clamp of 20,000 gross = 10,000 wage base
    expect(Number(s.pfWageBase)).toBe(10000);
  });

  // ── 4. Voluntary PF on the employee form ─────────────────────────────────────
  it("an employee created with a voluntary PF rate: employee PF rises, employer unchanged", async () => {
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, ctcAnnual: "240000", basicPercent: "50", ltaAnnual: "0", effectiveFrom: new Date("2015-01-01") })
      .returning();

    const vpf = await hr.employees.create({
      userName: "VPF Person", userEmail: `vpf-${nanoid(6)}@qa.coheronconnect.io`,
      salaryStructureId: st!.id, startDate: new Date("2020-01-01"), state: "Karnataka", taxRegime: "new",
      voluntaryPfRate: 8,
    });
    const plain = await hr.employees.create({
      userName: "Plain Person", userEmail: `plain-${nanoid(6)}@qa.coheronconnect.io`,
      salaryStructureId: st!.id, startDate: new Date("2020-01-01"), state: "Karnataka", taxRegime: "new",
    });
    const [vpfRow] = await testDb().select({ v: employees.voluntaryPfRate }).from(employees).where(eq(employees.id, vpf.id));
    expect(Number(vpfRow!.v)).toBe(8);

    const runId = await runPayslips();
    const v = await slip(runId, vpf.id);
    const p = await slip(runId, plain.id);
    expect(Number(p.pfEmployee)).toBe(1200); // 12% of 10,000
    expect(Number(v.pfEmployee)).toBe(2000); // 12% + 8% VPF
    expect(Number(v.pfEmployer)).toBe(Number(p.pfEmployer)); // employer unchanged
  });

  // ── 5. Para 26(6) on the employee form ───────────────────────────────────────
  it("an employee with a Para 26(6) reference + reached date computes uncapped; without the reference, capped", async () => {
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, ctcAnnual: "480000", basicPercent: "50", ltaAnnual: "0", effectiveFrom: new Date("2015-01-01") })
      .returning();

    const uncapped = await hr.employees.create({
      userName: "Uncapped", userEmail: `u-${nanoid(6)}@qa.coheronconnect.io`,
      salaryStructureId: st!.id, startDate: new Date("2020-01-01"), state: "Karnataka", taxRegime: "new",
      para266JointRequest: true, para266EmployerUndertaking: true,
      para266ApprovalReference: "EPFO/JD/2024/12345", para266EffectiveFrom: new Date("2020-01-01"),
    });
    const noref = await hr.employees.create({
      userName: "NoRef", userEmail: `n-${nanoid(6)}@qa.coheronconnect.io`,
      salaryStructureId: st!.id, startDate: new Date("2020-01-01"), state: "Karnataka", taxRegime: "new",
      para266JointRequest: true, para266EmployerUndertaking: true, para266EffectiveFrom: new Date("2020-01-01"),
    });
    const runId = await runPayslips();
    expect(Number((await slip(runId, uncapped.id)).pfWageBase)).toBe(20000); // full basic, uncapped
    expect(Number((await slip(runId, noref.id)).pfWageBase)).toBe(15000); // ceiling — no reference
  });

  // ── 6. Step 13 succeeds once identifiers are set through the new screen ───────
  it("generateStatutory succeeds for an org whose identifiers were set via updateStatutoryIdentity", async () => {
    await onboarding.updateStatutoryIdentity({
      epfCode: "KA/BNG/1234567/000",
      esiEstablishmentNumber: "12345678901234567",
      ptRegistrationNumber: "PT-KA-99999",
      pfContributionRate: 12,
    });
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, ctcAnnual: "240000", basicPercent: "50", ltaAnnual: "0", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `s13-${nanoid(6)}@qa.coheronconnect.io`, name: "S13 Person" });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: "EMP-S13", salaryStructureId: st!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new", uan: `UAN${nanoid(6)}` })
      .returning();

    const runId = await runPayslips();
    // Approval chain is exercised elsewhere; shortcut to CFO-approved for the step-13 check.
    await testDb().update(payrollRuns).set({ pipelineStatus: "CFO_APPROVED", status: "cfo_approved" }).where(eq(payrollRuns.id, runId));

    await payroll.runs.generateStatutory({ runId }); // would throw the ESI refusal if the number were unset
    const out = await payroll.runs.statutoryOutputs({ runId });
    expect(out.epfoEcr).toBeTruthy();
    expect(out.tdsChallan?.formType).toBe("24Q");
    // COMPLIANCE-CARDS: the card reads totalTdsDeducted (what generateStatutory writes), not the
    // non-existent tdsAmount it used to read (which rendered ₹0). Assert the field is present on the
    // produced record so the card shows the real deducted figure, not undefined→0.
    expect(out.tdsChallan?.totalTdsDeducted).toBeDefined();
    // Monthly gross ₹20,000 (< ₹21,000) makes this employee an ESI member, so an ESI challan is
    // owed — and it generated only because the ESI establishment number is now set. That is the
    // exact case that refused before this screen existed.
    expect(out.esiChallan).toBeTruthy();
    void e;
  });
});
