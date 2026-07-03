/**
 * Leave-accrual router tests (Sprint 1.5).
 *
 * The leave-accrual router (module: "hr") owns persistence for four surfaces:
 *   - policy: per-org, per-leave-type configuration (annual entitlement,
 *     monthly rate, carry-forward cap, encashable).
 *   - accrual: idempotent monthly leave crediting, projected onto leaveBalances,
 *     driven by computeMonthlyLeaveAccrual.
 *   - close: year-end carry-forward + lapse (computeCarryForward), seeding the
 *     next year's opening balance.
 *   - encash: valuing an unused balance at (Basic+DA)/26 (computeLeaveEncashment).
 * Verifies the day/money-math wiring, idempotency, tenant isolation and RBAC.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb } from "./helpers";
import { leaveAccrualRouter } from "../routers/leave-accrual";
import {
  employees,
  salaryStructures,
  leaveAccrualEvents,
  leaveBalances,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Leave-accrual router (Sprint 1.5)", () => {
  let caller: any;
  let orgId: string;
  let seeded: Awaited<ReturnType<typeof seedFullOrg>>;

  /** Seeds an employee whose monthly Basic+DA is ₹26,000 (ctc 780k × 40% / 12). */
  async function seedEmployee(ctcAnnual = 780_000): Promise<string> {
    const db = testDb();
    const { userId } = await seedUser(orgId, {
      email: `emp-${nanoid(6)}@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "requester",
      password: "TestPass123!",
    });
    const [struct] = await db
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: String(ctcAnnual),
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await db
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
      })
      .returning();
    return emp!.id;
  }

  /** Upserts the vacation policy: 18 days/yr, cap 30, encashable. */
  async function seedPolicy(overrides: Record<string, any> = {}) {
    return caller.policy.upsert({
      type: "vacation",
      annualEntitlementDays: 18,
      maxCarryForwardDays: 30,
      encashable: true,
      ...overrides,
    });
  }

  beforeEach(async () => {
    seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = leaveAccrualRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  // ── Policy ─────────────────────────────────────────────────────────────────
  it("upserts a leave policy idempotently (one row per org+type)", async () => {
    await seedPolicy();
    const updated = await seedPolicy({ annualEntitlementDays: 24 });
    expect(Number(updated.annualEntitlementDays)).toBe(24);
    const list = await caller.policy.list();
    expect(list.length).toBe(1);
    expect(list[0].type).toBe("vacation");
  });

  // ── Accrual ──────────────────────────────────────────────────────────────
  it("accrues 1.5 days/month (18/12) and posts to the leave balance", async () => {
    const empId = await seedEmployee();
    await seedPolicy();
    const ev = await caller.accrual.accrue({
      employeeId: empId,
      type: "vacation",
      year: 2026,
      month: 4,
    });
    expect(Number(ev.days)).toBe(1.5);

    const db = testDb();
    const [bal] = await db
      .select()
      .from(leaveBalances)
      .where(
        and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, 2026)),
      );
    expect(Number(bal.totalDays)).toBe(1.5);
  });

  it("is idempotent per period and accumulates the balance across months", async () => {
    const empId = await seedEmployee();
    await seedPolicy();
    await caller.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 4 });
    await caller.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 5 });
    // re-run April — must NOT double-count
    await caller.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 4 });

    const ledger = await caller.accrual.list({ employeeId: empId });
    expect(ledger.length).toBe(2); // still two accrual rows

    const db = testDb();
    const [bal] = await db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, 2026)));
    expect(Number(bal.totalDays)).toBe(3); // 1.5 + 1.5, April not double-counted
  });

  it("pro-rates a mid-month joiner by days worked", async () => {
    const empId = await seedEmployee();
    await seedPolicy();
    const ev = await caller.accrual.accrue({
      employeeId: empId,
      type: "vacation",
      year: 2026,
      month: 4,
      daysWorked: 15,
      daysInMonth: 30,
    });
    // 1.5 × 0.5 = 0.75 → rounds to 0.8
    expect(Number(ev.days)).toBe(0.8);
  });

  it("accrueAll credits the active workforce idempotently", async () => {
    await seedEmployee();
    await seedEmployee();
    await seedPolicy();
    const r1 = await caller.accrual.accrueAll({ type: "vacation", year: 2026, month: 4 });
    expect(r1.accrued).toBe(2);
    expect(r1.daysEach).toBe(1.5);
    const r2 = await caller.accrual.accrueAll({ type: "vacation", year: 2026, month: 4 });
    expect(r2.accrued).toBe(2);
    const db = testDb();
    const rows = await db
      .select()
      .from(leaveAccrualEvents)
      .where(eq(leaveAccrualEvents.orgId, orgId));
    expect(rows.length).toBe(2); // no duplicate rows
  });

  it("rejects accrual when no policy is configured", async () => {
    const empId = await seedEmployee();
    await expect(
      caller.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 4 }),
    ).rejects.toThrow(/no leave policy/i);
  });

  // ── Year-end close ─────────────────────────────────────────────────────────
  it("caps carry-forward and lapses the excess, seeding next year", async () => {
    const empId = await seedEmployee();
    await seedPolicy({ maxCarryForwardDays: 30 });
    const db = testDb();
    // Manually set a fat closing balance of 45 days.
    await db.insert(leaveBalances).values({
      employeeId: empId,
      type: "vacation",
      year: 2026,
      totalDays: "45",
      usedDays: "0",
    });

    const preview = await caller.close.preview({ employeeId: empId, type: "vacation", year: 2026 });
    expect(preview.closingBalance).toBe(45);
    expect(preview.carriedForward).toBe(30);
    expect(preview.lapsed).toBe(15);

    const run = await caller.close.run({ employeeId: empId, type: "vacation", year: 2026 });
    expect(run.carriedForward).toBe(30);
    expect(run.lapsed).toBe(15);
    expect(run.nextYear).toBe(2027);

    const [next] = await db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, 2027)));
    expect(Number(next.totalDays)).toBe(30);
  });

  it("blocks a double year-end close", async () => {
    const empId = await seedEmployee();
    await seedPolicy();
    await caller.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 4 });
    await caller.close.run({ employeeId: empId, type: "vacation", year: 2026 });
    await expect(
      caller.close.run({ employeeId: empId, type: "vacation", year: 2026 }),
    ).rejects.toThrow(/already closed/i);
  });

  // ── Encashment ─────────────────────────────────────────────────────────────
  it("values unused days at (Basic+DA)/26 and draws down the balance", async () => {
    const empId = await seedEmployee();
    await seedPolicy({ encashable: true });
    const db = testDb();
    await db.insert(leaveBalances).values({
      employeeId: empId,
      type: "vacation",
      year: 2026,
      totalDays: "12",
      usedDays: "0",
    });

    // 10 days × (26000/26 = 1000) = 10,000
    const r = await caller.encash.run({
      employeeId: empId,
      type: "vacation",
      year: 2026,
      days: 10,
    });
    expect(r.perDayWage).toBe(1_000);
    expect(r.amount).toBe(10_000);

    const [bal] = await db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, 2026)));
    expect(Number(bal.totalDays)).toBe(2); // 12 − 10
  });

  it("refuses to encash a non-encashable leave type", async () => {
    const empId = await seedEmployee();
    await seedPolicy({ encashable: false });
    await expect(
      caller.encash.run({ employeeId: empId, type: "vacation", year: 2026, days: 5 }),
    ).rejects.toThrow(/not encashable/i);
  });

  // ── Tenancy + RBAC ─────────────────────────────────────────────────────────
  it("is tenant-isolated: another org cannot accrue or read this employee", async () => {
    const empId = await seedEmployee();
    await seedPolicy();
    const other = await seedFullOrg();
    const foreign = leaveAccrualRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    await expect(
      foreign.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 4 }),
    ).rejects.toThrow(/not found/i);
    const foreignLedger = await foreign.accrual.list({ employeeId: empId });
    expect(foreignLedger.length).toBe(0);
  });

  it("denies a member without the hr:approve action", async () => {
    const empId = await seedEmployee();
    await seedPolicy();
    const memberCtx = createMockContext(seeded.requesterId, orgId, {
      user: {
        id: seeded.requesterId,
        orgId,
        email: "member@coheronconnect.io",
        name: "Member",
        role: "member",
        matrixRole: null,
        status: "active",
      },
    } as any);
    const member = leaveAccrualRouter.createCaller(memberCtx);
    await expect(
      member.accrual.accrue({ employeeId: empId, type: "vacation", year: 2026, month: 4 }),
    ).rejects.toThrow(/(FORBIDDEN|Permission denied)/i);
  });
});
