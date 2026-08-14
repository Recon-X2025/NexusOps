/**
 * LEAVE-POLICY — the three independent axes, tenant-configurable.
 *
 *   1. Carry-forward cap        (maxCarryForwardDays) — how much rolls over.
 *   2. Year-end treatment       (yearEndTreatment)    — encash OR forfeit the excess,
 *                                                       INDEPENDENT of the cap.
 *   3. Exit treatment           (settlement)          — the WHOLE balance is encashed;
 *                                                       the cap does NOT apply.
 *
 * Wage base: CTC 1.2M, basic 40% → monthly Basic+DA = ₹40,000 → per-day = round(40000/26).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import {
  salaryStructures,
  employees,
  leavePolicies,
  leaveBalances,
  leaveAccrualEvents,
  eq,
  and,
} from "@coheronconnect/db";
import { leaveAccrualRouter } from "../routers/leave-accrual";
import { settlementRouter } from "../routers/settlement";

const CTC = 1_200_000;
const WAGES = 40_000;              // monthly Basic+DA
const PER_DAY = Math.round(WAGES / 26); // 1538

describe("LEAVE-POLICY — three independent axes", () => {
  let orgId: string;
  beforeEach(async () => { ({ orgId } = await seedTestOrg()); });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function seedEmp(over: Partial<typeof employees.$inferInsert> = {}) {
    const { userId } = await seedUser(orgId, { email: `lp-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb().insert(salaryStructures).values({
      orgId, structureName: "Std", ctcAnnual: String(CTC), basicPercent: "40",
      hraPercentOfBasic: "50", effectiveFrom: new Date("2015-01-01"),
    }).returning();
    const [emp] = await testDb().insert(employees).values({
      orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: struct!.familyId,
      startDate: new Date("2018-01-01"), state: "Karnataka", taxRegime: "new", ...over,
    }).returning();
    return { emp: emp!, userId };
  }

  async function seedPolicy(opts: {
    type: string; encashable: boolean; cap: number;
    yearEnd?: "forfeit" | "encash"; monthly?: number; skipTreatment?: boolean;
    exit?: "encash_all" | "capped" | "accrued_only";
  }) {
    const base: any = {
      orgId, type: opts.type, annualEntitlementDays: String(opts.monthly ? opts.monthly * 12 : 24),
      monthlyAccrualDays: opts.monthly == null ? null : String(opts.monthly),
      maxCarryForwardDays: String(opts.cap), encashable: opts.encashable,
    };
    // skipTreatment: insert WITHOUT the treatment columns to prove the DB defaults
    // (year_end='forfeit', exit='encash_all').
    if (!opts.skipTreatment) {
      base.yearEndTreatment = opts.yearEnd ?? "forfeit";
      if (opts.exit) base.exitTreatment = opts.exit;
    }
    await testDb().insert(leavePolicies).values(base);
  }

  async function seedBalance(employeeId: string, type: string, year: number, totalDays: number, usedDays = 0) {
    await testDb().insert(leaveBalances).values({
      employeeId, type: type as any, year,
      totalDays: String(totalDays), usedDays: String(usedDays), pendingDays: "0",
    });
  }

  const leaveCaller = (userId: string) => leaveAccrualRouter.createCaller(createMockContext(userId, orgId));
  const settleCaller = (userId: string) => settlementRouter.createCaller(createMockContext(userId, orgId));

  async function events(employeeId: string, eventType: string) {
    return testDb().select().from(leaveAccrualEvents)
      .where(and(eq(leaveAccrualEvents.employeeId, employeeId), eq(leaveAccrualEvents.eventType, eventType as any)));
  }

  // ── AXIS 3 — the exit override. THE load-bearing test. ─────────────────────
  it("HP exit case: 40 retained + 2/mo × 9 (Jan–Sep) = 58 days encashed at exit, NOT capped at 40", async () => {
    const { emp, userId } = await seedEmp({ endDate: new Date("2026-09-30"), status: "offboarded" });
    // Cap is 40, but exit must pay the WHOLE balance.
    await seedPolicy({ type: "annual", encashable: true, cap: 40, monthly: 2 });
    // Opening 40 carried in, then accrue Jan–Sep 2026 (2 days each) → 58 in leaveBalances.
    await seedBalance(emp.id, "annual", 2026, 40);
    for (let m = 1; m <= 9; m++) {
      await leaveCaller(userId).accrual.accrue({ employeeId: emp.id, type: "annual", year: 2026, month: m });
    }
    const [bal] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.year, 2026)));
    expect(Number(bal!.totalDays)).toBe(58); // 40 + 18

    const row = await settleCaller(userId).settle({ employeeId: emp.id });
    // 58 × 1538 — the cap of 40 does NOT clip the exit payout. Capping would pay 40×1538.
    expect(Number(row.leaveEncashment)).toBe(58 * PER_DAY);
    expect(Number(row.leaveEncashment)).not.toBe(40 * PER_DAY);
  });

  // ── UNIT A: exit treatment is a per-tenant POLICY, not a constant ──────────
  it("exit=capped: the payout IS limited to maxCarryForwardDays (40 of 58 → 40 × 1538)", async () => {
    const { emp, userId } = await seedEmp({ endDate: new Date("2026-09-30"), status: "offboarded" });
    await seedPolicy({ type: "annual", encashable: true, cap: 40, exit: "capped" });
    await seedBalance(emp.id, "annual", 2026, 58);
    const row = await settleCaller(userId).settle({ employeeId: emp.id });
    expect(Number(row.leaveEncashment)).toBe(40 * PER_DAY); // capped, not 58
  });

  it("exit=accrued_only: only THIS year's accrual is paid (18 of 58 → 18 × 1538)", async () => {
    const { emp, userId } = await seedEmp({ endDate: new Date("2026-09-30"), status: "offboarded" });
    await seedPolicy({ type: "annual", encashable: true, cap: 40, monthly: 2, exit: "accrued_only" });
    await seedBalance(emp.id, "annual", 2026, 40); // 40 carried in
    for (let m = 1; m <= 9; m++) {
      await leaveCaller(userId).accrual.accrue({ employeeId: emp.id, type: "annual", year: 2026, month: m });
    }
    const row = await settleCaller(userId).settle({ employeeId: emp.id });
    expect(Number(row.leaveEncashment)).toBe(18 * PER_DAY); // Jan–Sep accrual only, carried 40 excluded
  });

  it("a policy with no exit_treatment set defaults to encash_all (whole balance paid)", async () => {
    const { emp, userId } = await seedEmp({ endDate: new Date("2026-09-30"), status: "offboarded" });
    await seedPolicy({ type: "annual", encashable: true, cap: 10, skipTreatment: true });
    await seedBalance(emp.id, "annual", 2026, 30);
    const row = await settleCaller(userId).settle({ employeeId: emp.id });
    expect(Number(row.leaveEncashment)).toBe(30 * PER_DAY); // whole balance, cap 10 ignored
  });

  it("sick leave is never encashed on exit — the type filter outranks the exit setting", async () => {
    const { emp, userId } = await seedEmp({ endDate: new Date("2026-09-30"), status: "offboarded" });
    await seedPolicy({ type: "sick", encashable: false, cap: 40, exit: "encash_all" });
    await seedBalance(emp.id, "sick", 2026, 20);
    const row = await settleCaller(userId).settle({ employeeId: emp.id });
    expect(Number(row.leaveEncashment)).toBe(0);
  });

  // ── AXIS 2 — year-end encash vs forfeit, independent of the cap ────────────
  it("Amazon: cap 0 + encash → the full balance is paid, nothing carries", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, cap: 0, yearEnd: "encash" });
    await seedBalance(emp.id, "annual", 2025, 20);

    const res = await leaveCaller(userId).close.run({ employeeId: emp.id, type: "annual", year: 2025 });
    expect(res.carriedForward).toBe(0);
    expect(res.encashedExcess?.amount).toBe(20 * PER_DAY);
    expect((await events(emp.id, "encashment"))[0]).toBeTruthy();
    expect(await events(emp.id, "lapse")).toHaveLength(0); // encash branch writes no lapse
    const [next] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.year, 2026)));
    expect(Number(next?.totalDays ?? 0)).toBe(0);
  });

  it("cap 40 + forfeit → 40 carries, the excess (18) is LAPSED and recorded, not encashed", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, cap: 40, yearEnd: "forfeit" });
    await seedBalance(emp.id, "annual", 2025, 58);

    const res = await leaveCaller(userId).close.run({ employeeId: emp.id, type: "annual", year: 2025 });
    expect(res.carriedForward).toBe(40);
    expect(res.lapsed).toBe(18);
    expect(res.encashedExcess).toBeNull();
    expect(await events(emp.id, "encashment")).toHaveLength(0);
    const [lapse] = await events(emp.id, "lapse");
    expect(Number(lapse!.days)).toBe(-18); // forfeit is recorded, not silently zeroed
    const [next] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.year, 2026)));
    expect(Number(next!.totalDays)).toBe(40);
  });

  it("cap 40 + encash → the AXIS INDEPENDENCE proof: 40 carries AND the excess (18) is encashed", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, cap: 40, yearEnd: "encash" });
    await seedBalance(emp.id, "annual", 2025, 58);

    const res = await leaveCaller(userId).close.run({ employeeId: emp.id, type: "annual", year: 2025 });
    expect(res.carriedForward).toBe(40);           // the cap governs carry-forward
    expect(res.encashedExcess?.amount).toBe(18 * PER_DAY); // the treatment pays the excess — separately
    const [next] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.year, 2026)));
    expect(Number(next!.totalDays)).toBe(40);
  });

  // ── Encashability wins over the treatment, at year-end AND exit ────────────
  it("sick leave is NOT encashed at year-end even when treatment is encash — it lapses", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "sick", encashable: false, cap: 40, yearEnd: "encash" });
    await seedBalance(emp.id, "sick", 2025, 58);

    const res = await leaveCaller(userId).close.run({ employeeId: emp.id, type: "sick", year: 2025 });
    expect(res.encashedExcess).toBeNull();          // encashable=false → no encashment
    expect(await events(emp.id, "encashment")).toHaveLength(0);
    const [lapse] = await events(emp.id, "lapse");
    expect(Number(lapse!.days)).toBe(-18);          // the excess lapsed instead
  });

  it("sick leave is NOT encashed through settlement (the type filter is not bypassed)", async () => {
    const { emp, userId } = await seedEmp({ endDate: new Date("2026-09-30"), status: "offboarded" });
    await seedPolicy({ type: "annual", encashable: true, cap: 40 });
    await seedPolicy({ type: "sick", encashable: false, cap: 40 });
    await seedBalance(emp.id, "annual", 2026, 10);
    await seedBalance(emp.id, "sick", 2026, 8);

    const row = await settleCaller(userId).settle({ employeeId: emp.id });
    expect(Number(row.leaveEncashment)).toBe(10 * PER_DAY); // annual only, sick excluded
  });

  // ── Idempotency: the year-end rollover must not encash twice ───────────────
  it("the year-end rollover is idempotent — a second close is rejected and encashes once", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, cap: 40, yearEnd: "encash" });
    await seedBalance(emp.id, "annual", 2025, 58);

    await leaveCaller(userId).close.run({ employeeId: emp.id, type: "annual", year: 2025 });
    await expect(
      leaveCaller(userId).close.run({ employeeId: emp.id, type: "annual", year: 2025 }),
    ).rejects.toThrow(/already closed/i);
    expect(await events(emp.id, "encashment")).toHaveLength(1); // exactly once
  });

  // ── Defaults: a tenant that configured nothing forfeits (today's behaviour) ─
  it("a policy with no year_end_treatment set defaults to forfeit (DB default)", async () => {
    const { emp, userId } = await seedEmp();
    await seedPolicy({ type: "annual", encashable: true, cap: 40, skipTreatment: true });
    await seedBalance(emp.id, "annual", 2025, 58);

    const res = await leaveCaller(userId).close.run({ employeeId: emp.id, type: "annual", year: 2025 });
    expect(res.yearEndTreatment).toBe("forfeit");
    expect(res.encashedExcess).toBeNull();
    expect(await events(emp.id, "encashment")).toHaveLength(0);
  });
});
