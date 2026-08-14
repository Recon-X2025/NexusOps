/**
 * LEAVE-MODEL — exit-per-reason, encashment wage basis + divisor, maternity floor.
 * Wage base: CTC 1.2M → Basic+DA ₹40,000/mo (per-day 26 → 1538); Gross ₹100,000/mo (per-day 26 → 3846).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { salaryStructures, employees, leavePolicies, leaveBalances, leaveExitRules, leaveStateBaselines, eq, and, isNull } from "@coheronconnect/db";
import { settlementRouter } from "../routers/settlement";
import { leaveAccrualRouter } from "../routers/leave-accrual";
import { hrRouter } from "../routers/hr";

const CTC = 1_200_000;
const PD_BASIC = Math.round(40_000 / 26);   // 1538
const PD_GROSS = Math.round(100_000 / 26);  // 3846
const PD_BASIC_30 = Math.round(40_000 / 30); // 1333

describe("LEAVE-MODEL — exit per reason, wage basis, divisor, maternity floor", () => {
  let orgId: string;
  beforeEach(async () => { ({ orgId } = await seedTestOrg()); });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function seedEmp() {
    const { userId } = await seedUser(orgId, { email: `lm-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb().insert(salaryStructures).values({
      orgId, structureName: "Std", ctcAnnual: String(CTC), basicPercent: "40", hraPercentOfBasic: "50",
      effectiveFrom: new Date("2015-01-01"),
    }).returning();
    const [emp] = await testDb().insert(employees).values({
      orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: struct!.familyId,
      startDate: new Date("2018-01-01"), endDate: new Date("2026-09-30"), status: "offboarded",
      state: "Karnataka", taxRegime: "new",
    }).returning();
    return { emp: emp!, userId };
  }
  async function seedPolicy(over: Partial<typeof leavePolicies.$inferInsert> & { type: string }) {
    await testDb().insert(leavePolicies).values({
      orgId, annualEntitlementDays: "24", maxCarryForwardDays: "40", encashable: true, ...(over as any),
    });
  }
  async function seedBalance(employeeId: string, type: string, totalDays: number) {
    await testDb().insert(leaveBalances).values({
      employeeId, type: type as any, year: 2026, totalDays: String(totalDays), usedDays: "0", pendingDays: "0",
    });
  }
  const settle = (userId: string) => settlementRouter.createCaller(createMockContext(userId, orgId));

  it("HP regression: encash_full on resignation (no rule) → 58 days = ₹89,204", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true });
    await seedBalance(emp.id, "annual", 58);
    const row = await settle(userId).settle({ employeeId: emp.id, reason: "resignation" });
    expect(Number(row.leaveEncashment)).toBe(58 * PD_BASIC); // 89,204
  });

  it("CCS-shaped: resignation pays HALF (proportion 0.5) but retirement pays FULL — same tenant", async () => {
    // Resignation → half
    const a = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true });
    await seedBalance(a.emp.id, "annual", 58);
    await testDb().insert(leaveExitRules).values({ orgId, type: "annual", reason: "resignation", treatment: "proportion", param: "0.5" });
    const resign = await settle(a.userId).settle({ employeeId: a.emp.id, reason: "resignation" });
    expect(Number(resign.leaveEncashment)).toBe(29 * PD_BASIC); // half of 58

    // Retirement → full (no rule for retirement → default encash_full)
    const b = await seedEmp();
    await seedBalance(b.emp.id, "annual", 58);
    const retire = await settle(b.userId).settle({ employeeId: b.emp.id, reason: "retirement" });
    expect(Number(retire.leaveEncashment)).toBe(58 * PD_BASIC);
  });

  it("dismissal → forfeit pays nothing; death defaults to FULL", async () => {
    const a = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true });
    await seedBalance(a.emp.id, "annual", 58);
    await testDb().insert(leaveExitRules).values({ orgId, type: "annual", reason: "dismissal", treatment: "forfeit" });
    const dis = await settle(a.userId).settle({ employeeId: a.emp.id, reason: "dismissal" });
    expect(Number(dis.leaveEncashment)).toBe(0);

    const b = await seedEmp();
    await seedBalance(b.emp.id, "annual", 58);
    const death = await settle(b.userId).settle({ employeeId: b.emp.id, reason: "death" });
    expect(Number(death.leaveEncashment)).toBe(58 * PD_BASIC); // no punitive default
  });

  it("encashment on GROSS vs BASIC+DA produces different, correct figures", async () => {
    const g = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, encashmentBasis: "gross" });
    await seedBalance(g.emp.id, "annual", 10);
    const gross = await settle(g.userId).settle({ employeeId: g.emp.id, reason: "resignation" });
    expect(Number(gross.leaveEncashment)).toBe(10 * PD_GROSS); // 38,460

    // Different type ('vacation') to avoid the one-policy-per-(org,type) unique index.
    const b = await seedEmp();
    await seedPolicy({ type: "vacation", encashable: true, encashmentBasis: "basic_da" });
    await seedBalance(b.emp.id, "vacation", 10);
    const basic = await settle(b.userId).settle({ employeeId: b.emp.id, reason: "resignation" });
    expect(Number(basic.leaveEncashment)).toBe(10 * PD_BASIC); // 15,380
  });

  it("encashment divisor 30 (CCS) differs from 26", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, encashmentDivisor: 30 });
    await seedBalance(emp.id, "annual", 10);
    const row = await settle(userId).settle({ employeeId: emp.id, reason: "resignation" });
    expect(Number(row.leaveEncashment)).toBe(10 * PD_BASIC_30); // 13,330, not 15,380
  });

  it("a non-encashable type is not encashed on ANY exit reason (type filter outranks the rule)", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "sick", encashable: false });
    await seedBalance(emp.id, "sick", 20);
    // Even with an explicit encash_full rule, encashable=false wins.
    await testDb().insert(leaveExitRules).values({ orgId, type: "sick", reason: "retirement", treatment: "encash_full" });
    const row = await settle(userId).settle({ employeeId: emp.id, reason: "retirement" });
    expect(Number(row.leaveEncashment)).toBe(0);
  });

  it("maternity floor: a policy below 26 weeks (182 days) is rejected, at or above is accepted", async () => {
    const { userId } = await seedEmp();
    const caller = leaveAccrualRouter.createCaller(createMockContext(userId, orgId));
    await expect(
      caller.policy.upsert({ type: "maternity", annualEntitlementDays: 90, maxCarryForwardDays: 0, encashable: false }),
    ).rejects.toThrow(/26 weeks|182 days|Maternity Benefit/i);
    const ok = await caller.policy.upsert({ type: "maternity", annualEntitlementDays: 182, maxCarryForwardDays: 0, encashable: false });
    expect(ok.type).toBe("maternity");
  });

  it("all 36 states/UTs have a platform baseline row, each recorded as following the baseline", async () => {
    const rows = await testDb().select().from(leaveStateBaselines).where(isNull(leaveStateBaselines.orgId));
    expect(rows.length).toBe(36); // PT precedent — every state present, none absent
    expect(rows.every((r) => r.followsBaseline)).toBe(true);
  });

  it("a non-debiting type (maternity) does NOT consume a balance; a debiting type does", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "maternity", encashable: false, debitsBalance: false, annualEntitlementDays: "182" });
    await seedPolicy({ type: "annual", encashable: true }); // debits (default true)
    const hr = hrRouter.createCaller(createMockContext(userId, orgId));
    await hr.leave.create({ type: "maternity", startDate: "2026-03-01", endDate: "2026-03-10", reason: "maternity" });
    await hr.leave.create({ type: "annual", startDate: "2026-05-01", endDate: "2026-05-05", reason: "vacation" });
    const [mat] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.type, "maternity")));
    const [ann] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.type, "annual")));
    expect(mat).toBeUndefined();        // never debited a balance for a non-debiting type
    expect(Number(ann!.pendingDays)).toBe(5); // debiting type recorded the 5 pending days
  });

  // LEAVE-TYPES — the headline: maternity must not draw down a balance even when the tenant has
  // NOT configured a leave policy. Pre-fix, "no policy = debit" would over-draw a maternity balance.
  it("maternity/paternity/parental do NOT debit a balance with NO policy row (code-level default)", async () => {
    const { emp, userId } = await seedEmp();
    // Deliberately seed NO leave policy at all.
    const hr = hrRouter.createCaller(createMockContext(userId, orgId));
    for (const type of ["maternity", "paternity", "parental"] as const) {
      await hr.leave.create({ type, startDate: "2026-03-01", endDate: "2026-03-10", reason: type });
    }
    const bals = await testDb().select().from(leaveBalances).where(eq(leaveBalances.employeeId, emp.id));
    expect(bals.length).toBe(0); // no balance row created or touched for any non-debiting default type
  });

  it("a debiting default type (marriage) with no policy row STILL debits — the non-debiting set is scoped", async () => {
    const { emp, userId } = await seedEmp();
    const hr = hrRouter.createCaller(createMockContext(userId, orgId));
    await hr.leave.create({ type: "marriage", startDate: "2026-04-01", endDate: "2026-04-03", reason: "marriage" });
    const [bal] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.type, "marriage")));
    expect(Number(bal!.pendingDays)).toBe(3); // marriage is not in NON_DEBITING_DEFAULT_TYPES
  });

  it("a leave request can be created against each of the four new types", async () => {
    const { userId } = await seedEmp();
    const hr = hrRouter.createCaller(createMockContext(userId, orgId));
    for (const type of ["maternity", "paternity", "marriage", "compensatory_off"] as const) {
      const req = await hr.leave.create({ type, startDate: "2026-06-01", endDate: "2026-06-02", reason: type });
      expect(req.type).toBe(type); // the enum accepts it end-to-end
    }
  });
});
