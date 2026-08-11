/**
 * Base Pay composition + LTA carve-out + server-side composition guard + gratuity Basic+DA.
 * ─────────────────────────────────────────────────────────────────────────────
 * C7 — LTA is carved out of the special-allowance residual (like DA), so gross stays Base Pay/12.
 * C3 — the upsert/newVersion procedures reject basic% + da% != 50 server-side.
 * C4 — the run zero-feeds bonus, so a structure's bonusAnnual never affects a payslip.
 * C11 — gratuity settlement base is Basic + DA, not Basic alone.
 *
 * Real Postgres; April 2026 (FY26, Labour-Codes 50% clamp in force).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { gratuityRouter } from "../routers/gratuity";
import { leaveAccrualRouter } from "../routers/leave-accrual";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const M = 4;
const Y = 2026;

describe("Base Pay composition + LTA carve-out", () => {
  let orgId: string, adminId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payroll: any;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    payroll = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedEmpOnStruct(vals: Record<string, unknown>): Promise<{ structId: string; empId: string }> {
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, effectiveFrom: new Date("2015-01-01"), ...vals } as never)
      .returning();
    const { userId } = await seedUser(orgId, { email: `bp-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: st!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new" })
      .returning();
    return { structId: st!.id, empId: e!.id };
  }
  async function runPayslips(): Promise<string> {
    const [r] = await testDb().insert(payrollRuns).values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" }).returning();
    await payroll.runs.computePayslips({ runId: r!.id });
    return r!.id;
  }
  async function slip(runId: string, empId: string) {
    const [row] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    return row!;
  }

  // ── Test 1 (fails before C7, passes after) ───────────────────────────────────
  it("gross equals Base Pay/12 when LTA is set — LTA is carved from the residual, not added on top", async () => {
    // Base Pay 480000 → 40000/month; basic 50, da 0; LTA 120000/yr = 10000/month.
    const { empId } = await seedEmpOnStruct({ ctcAnnual: "480000", basicPercent: "50", daPercent: "0", ltaAnnual: "120000" });
    const runId = await runPayslips();
    const s = await slip(runId, empId);
    expect(Number(s.grossEarnings)).toBe(40000); // NOT 50000 — LTA sits inside Base Pay
    expect(Number(s.lta)).toBe(10000); // LTA line still present
    expect(Number(s.basic) + Number(s.da) + Number(s.hra) + Number(s.specialAllowance) + Number(s.lta)).toBe(40000);
  });

  // ── Test 2 — wage base + the five derived contributions ─────────────────────
  it("wage base is half of Base Pay total (not inflated by LTA), and the five contributions follow", async () => {
    const { empId } = await seedEmpOnStruct({ ctcAnnual: "480000", basicPercent: "50", daPercent: "0", ltaAnnual: "120000" });
    const runId = await runPayslips();
    const s = await slip(runId, empId);
    // total = 40000 gross, halfOfTotal = 20000, capped at the ₹15,000 ceiling
    expect(Number(s.pfWageBase)).toBe(15000);
    expect(Number(s.pfEmployee)).toBe(1800); // 12% of 15,000
    expect(Number(s.pfEmployerEps)).toBe(1250); // 8.33% of 15,000
    expect(Number(s.pfEmployerEpf)).toBe(551); // 3.67% of 15,000
  });

  // ── Test 3 — server-side composition enforcement ─────────────────────────────
  it("upsert rejects basic% + da% != 50 when called directly, accepts == 50", async () => {
    await expect(
      payroll.salaryStructures.upsert({ structureName: "bad", ctcAnnual: 480000, basicPercent: 40, daPercent: 0, effectiveFrom: new Date("2020-01-01") }),
    ).rejects.toThrow(/must equal 50/i);
    const ok = await payroll.salaryStructures.upsert({ structureName: "good", ctcAnnual: 480000, basicPercent: 40, daPercent: 10, effectiveFrom: new Date("2020-01-01") });
    expect(ok).toBeTruthy();
  });

  // ── Test 4 — bonus field removal is inert (run zero-feeds bonus) ─────────────
  it("a structure's bonusAnnual does not affect the computed payslip (bonus is zero-fed in the run)", async () => {
    const a = await seedEmpOnStruct({ ctcAnnual: "480000", basicPercent: "50", daPercent: "0", bonusAnnual: "0" });
    const b = await seedEmpOnStruct({ ctcAnnual: "480000", basicPercent: "50", daPercent: "0", bonusAnnual: "500000" });
    const runId = await runPayslips();
    const sa = await slip(runId, a.empId);
    const sb = await slip(runId, b.empId);
    expect(Number(sb.grossEarnings)).toBe(Number(sa.grossEarnings));
    expect(Number(sb.pfWageBase)).toBe(Number(sa.pfWageBase));
    expect(Number(sb.tds)).toBe(Number(sa.tds));
  });

  // ── Test 5 — DA = 0 and LTA = 0 regression (byte-identical) ──────────────────
  it("DA = 0, LTA = 0 basic-alone structure is unchanged", async () => {
    const { empId } = await seedEmpOnStruct({ ctcAnnual: "240000", basicPercent: "50", daPercent: "0", ltaAnnual: "0" });
    const runId = await runPayslips();
    const s = await slip(runId, empId);
    expect(Number(s.grossEarnings)).toBe(20000); // 240000/12
    expect(Number(s.da)).toBe(0);
    expect(Number(s.lta)).toBe(0);
    expect(Number(s.pfWageBase)).toBe(10000);
    expect(Number(s.pfEmployee)).toBe(1200);
  });

  // ── C11 — gratuity base is Basic + DA, not Basic only ────────────────────────
  it("gratuity settlement base is Basic + DA (50% of Base Pay), not Basic-only (40%)", async () => {
    const grat = gratuityRouter.createCaller(createMockContext(adminId, orgId));
    // Base Pay 480000 → 40000/month; basic 40 / da 10 (sum 50). Basic+DA = 20000; Basic-only = 16000.
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `G-${nanoid(4)}`, ctcAnnual: "480000", basicPercent: "40", daPercent: "10", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `grat-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: `EMP-G${nanoid(3)}`, salaryStructureId: st!.id, startDate: new Date("2018-01-01"), status: "active", state: "Karnataka", taxRegime: "new" })
      .returning();
    const asOf = new Date("2026-01-01").toISOString();

    const derived = await grat.settlement.preview({ employeeId: e!.id, asOf }); // base from the structure
    const at50 = await grat.settlement.preview({ employeeId: e!.id, asOf, lastDrawnBasicPlusDA: 20000 }); // Basic + DA
    const at40 = await grat.settlement.preview({ employeeId: e!.id, asOf, lastDrawnBasicPlusDA: 16000 }); // old Basic-only

    expect(derived).toEqual(at50); // derived base = Basic + DA
    expect(derived).not.toEqual(at40); // and NOT Basic-only
  });

  // ── DA-consumer: leave encashment base is Basic + DA, not Basic only ─────────
  it("leave-encashment base is Basic + DA (50% of Base Pay), not Basic-only (40%)", async () => {
    const leave = leaveAccrualRouter.createCaller(createMockContext(adminId, orgId));
    // Base Pay 480000 → 40000/month; basic 40 / da 10 (sum 50). Basic+DA = 20000; Basic-only = 16000.
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `L-${nanoid(4)}`, ctcAnnual: "480000", basicPercent: "40", daPercent: "10", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `leave-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: `EMP-L${nanoid(3)}`, salaryStructureId: st!.id, startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", taxRegime: "new" })
      .returning();
    // An encashable policy, so the valuation is non-zero.
    await leave.policy.upsert({ type: "vacation", annualEntitlementDays: 18, maxCarryForwardDays: 5, encashable: true });

    const derived = await leave.encash.preview({ employeeId: e!.id, type: "vacation", days: 10 });
    const at50 = await leave.encash.preview({ employeeId: e!.id, type: "vacation", days: 10, lastDrawnBasicPlusDA: 20000 });
    const at40 = await leave.encash.preview({ employeeId: e!.id, type: "vacation", days: 10, lastDrawnBasicPlusDA: 16000 });

    expect(derived).toEqual(at50); // derived base = Basic + DA
    expect(derived).not.toEqual(at40); // and NOT Basic-only
  });
});
