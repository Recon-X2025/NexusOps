/**
 * COMPOFF — attendance-driven earn + rolling window expiry (leave-accrual.compOff).
 * Comp-off is credited when an employee checks in on a public holiday / weekend, anchored to the
 * worked date, and expires on a fixed week window (NOT year-end). Both steps are idempotent.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { employees, leavePolicies, leaveBalances, leaveAccrualEvents, publicHolidays, attendanceRecords, eq, and } from "@coheronconnect/db";
import { leaveAccrualRouter } from "../routers/leave-accrual";

// 2026-01-01 is a Thursday → Jan 3 = Saturday, Jan 5 = Monday. Jan 26 (Mon) is Republic Day.
const HOLIDAY = new Date(2026, 0, 26); // public holiday (a Monday)
const SATURDAY = new Date(2026, 0, 3);  // weekend
const NORMAL = new Date(2026, 0, 5);    // ordinary working Monday

describe("COMPOFF — earn from worked holidays/weekends + window expiry", () => {
  let orgId: string;
  let empId: string;
  let caller: ReturnType<typeof leaveAccrualRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId } = await seedUser(orgId, { email: `co-${nanoid(6)}@qa.coheronconnect.io` });
    const [emp] = await testDb().insert(employees).values({
      orgId, userId, employeeId: `EMP-${nanoid(4)}`, startDate: new Date("2020-01-01"), status: "active",
    }).returning();
    empId = emp!.id;
    caller = leaveAccrualRouter.createCaller(createMockContext(userId, orgId));
    // Comp-off policy with a 6-week rolling window.
    await testDb().insert(leavePolicies).values({
      orgId, type: "compensatory_off", annualEntitlementDays: "0", maxCarryForwardDays: "0",
      encashable: false, expiryMode: "window_weeks", expiryWindowWeeks: 6,
    });
    await testDb().insert(publicHolidays).values({ orgId, name: "Republic Day", date: HOLIDAY, year: HOLIDAY.getFullYear() });
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function att(date: Date, status: string) {
    await testDb().insert(attendanceRecords).values({
      orgId, employeeId: empId, date, status: status as any, checkIn: new Date(date.getTime() + 9 * 3600e3),
    });
  }
  async function compOffBalance(): Promise<number> {
    const [b] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.type, "compensatory_off")));
    return b ? Number(b.totalDays) : 0;
  }
  async function events(kind: string): Promise<number> {
    const rows = await testDb().select().from(leaveAccrualEvents)
      .where(and(eq(leaveAccrualEvents.employeeId, empId), eq(leaveAccrualEvents.type, "compensatory_off"), eq(leaveAccrualEvents.eventType, kind as any)));
    return rows.length;
  }

  it("credits comp-off for a worked holiday and a worked weekend, but NOT an ordinary day", async () => {
    await att(HOLIDAY, "present");   // worked a public holiday
    await att(SATURDAY, "present");  // worked a Saturday
    await att(NORMAL, "present");    // ordinary working day — no comp-off
    const res = await caller.compOff.reconcile({ employeeId: empId, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
    expect(res.credited).toBe(2);
    expect(await compOffBalance()).toBe(2);
    expect(await events("accrual")).toBe(2);
  });

  it("earning is idempotent — a second reconcile credits nothing more", async () => {
    await att(HOLIDAY, "present");
    await att(SATURDAY, "present");
    await caller.compOff.reconcile({ employeeId: empId, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
    const again = await caller.compOff.reconcile({ employeeId: empId, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
    expect(again.credited).toBe(0);
    expect(await compOffBalance()).toBe(2); // not doubled
  });

  it("expires credits past the 6-week window, but keeps ones inside it", async () => {
    await att(HOLIDAY, "present");   // Jan 26
    await att(SATURDAY, "present");  // Jan 3
    await caller.compOff.reconcile({ employeeId: empId, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
    expect(await compOffBalance()).toBe(2);

    // asOf Feb 20: Jan 3 is > 6 weeks old (expires), Jan 26 is < 6 weeks (kept).
    const res = await caller.compOff.expire({ employeeId: empId, asOf: new Date(2026, 1, 20) });
    expect(res.lapsed).toBe(1);
    expect(await compOffBalance()).toBe(1);
    expect(await events("lapse")).toBe(1);

    // Later — Jan 26 now past its window too.
    const later = await caller.compOff.expire({ employeeId: empId, asOf: new Date(2026, 3, 1) });
    expect(later.lapsed).toBe(1);
    expect(await compOffBalance()).toBe(0);
  });

  it("expiry is idempotent — re-running does not lapse twice", async () => {
    await att(SATURDAY, "present");
    await caller.compOff.reconcile({ employeeId: empId, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
    await caller.compOff.expire({ employeeId: empId, asOf: new Date(2026, 3, 1) });
    const again = await caller.compOff.expire({ employeeId: empId, asOf: new Date(2026, 3, 1) });
    expect(again.lapsed).toBe(0);
    expect(await compOffBalance()).toBe(0);
    expect(await events("lapse")).toBe(1); // exactly one lapse for the one credit
  });

  it("a policy on year_end expiry (not window_weeks) lapses nothing here — comp-off window only", async () => {
    await testDb().update(leavePolicies).set({ expiryMode: "year_end", expiryWindowWeeks: null })
      .where(and(eq(leavePolicies.orgId, orgId), eq(leavePolicies.type, "compensatory_off")));
    await att(SATURDAY, "present");
    await caller.compOff.reconcile({ employeeId: empId, from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) });
    const res = await caller.compOff.expire({ employeeId: empId, asOf: new Date(2027, 0, 1) });
    expect(res.lapsed).toBe(0);
  });
});
