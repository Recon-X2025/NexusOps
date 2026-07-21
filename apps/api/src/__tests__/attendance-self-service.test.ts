/**
 * G8 — Employee self-service attendance sign-in / sign-out (end-to-end).
 *
 * First-party HRMS capture: the authenticated employee punches their OWN
 * attendance (no hr.write, no passing another id). Proves:
 *   - signIn creates today's row with checkIn + status present,
 *   - re-signIn is idempotent and keeps the EARLIEST checkIn (first-in),
 *   - signOut stamps checkOut + computes hoursWorked (last-out),
 *   - signOut without a prior signIn errors,
 *   - myToday reflects current state,
 *   - a user with no linked employee record is refused,
 *   - self-service captured days feed the existing LOP path (absence stays LOP).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";
import {
  employees,
  salaryStructures,
  attendanceRecords,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("G8: self-service attendance (end-to-end)", () => {
  let caller: any;
  let orgId: string;
  let adminUserId: string;
  let empId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminUserId = seeded.adminId;
    caller = hrRouter.createCaller(createMockContext(seeded.adminId, orgId));

    const [s] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: "780000",
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();

    // Link an employee record to the authenticated (admin) user so
    // self-service resolves emp from ctx.user.
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId: adminUserId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: s!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    empId = e!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function todayRow() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [rec] = await testDb()
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.orgId, orgId),
        eq(attendanceRecords.employeeId, empId),
        eq(attendanceRecords.date, today),
      ))
      .limit(1);
    return rec;
  }

  it("signIn creates today's row with checkIn + present", async () => {
    // Assign a shift that starts a few minutes from now so the punch is
    // deterministically on-time (present) regardless of the wall-clock hour CI
    // runs at — the shift-aware derivation would otherwise flag `late` against
    // the built-in 09:00 baseline after 09:10 local. Clamp to the same calendar
    // day (max 23:59) so a near-midnight run can't wrap the start before now.
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMinutes = Math.min(1439, nowMin + 30);
    const shift = await caller.shifts.create({
      name: "OnTime",
      startMinutes,
      durationMinutes: 480,
      graceMinutes: 10,
    });
    await caller.shifts.assign({ employeeId: empId, shiftScheduleId: shift.id });

    const rec = await caller.attendance.signIn({});
    expect(rec.status).toBe("present");
    expect(rec.checkIn).toBeTruthy();
    expect(rec.checkOut).toBeNull();
  });

  it("re-signIn is idempotent and keeps the earliest checkIn", async () => {
    const first = await caller.attendance.signIn({});
    const firstCheckIn = new Date(first.checkIn).getTime();

    await new Promise((r) => setTimeout(r, 25));
    await caller.attendance.signIn({});

    const rows = await testDb()
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.orgId, orgId), eq(attendanceRecords.employeeId, empId)));
    expect(rows).toHaveLength(1); // one row/day, not duplicated
    expect(new Date(rows[0]!.checkIn!).getTime()).toBe(firstCheckIn); // first-in wins
  });

  it("signOut stamps checkOut and computes hoursWorked", async () => {
    await caller.attendance.signIn({});
    const out = await caller.attendance.signOut({});
    expect(out.checkOut).toBeTruthy();
    expect(Number(out.hoursWorked)).toBeGreaterThanOrEqual(0);
  });

  it("signOut without a prior signIn errors", async () => {
    await expect(caller.attendance.signOut({})).rejects.toThrow(/not signed in/i);
  });

  it("myToday reflects current state (null before, row after)", async () => {
    expect(await caller.attendance.myToday()).toBeNull();
    await caller.attendance.signIn({});
    const state = await caller.attendance.myToday();
    expect(state?.checkIn).toBeTruthy();
  });

  it("refuses a user with no linked employee record", async () => {
    const { userId: stranger } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    const strangerCaller = hrRouter.createCaller(createMockContext(stranger, orgId));
    await expect(strangerCaller.attendance.signIn({})).rejects.toThrow(/no employee record/i);
  });

  it("self-service present day carries zero LOP; a marked absence still LOPs", async () => {
    await caller.attendance.signIn({});
    const row = await todayRow();
    const month = row!.date.getMonth() + 1;
    const year = row!.date.getFullYear();

    // present day → no LOP for this employee.
    let lopMap = await computeAttendanceLopForPeriod(testDb(), orgId, month, year);
    expect(lopMap.get(empId)).toBeUndefined();

    // Flip today to absent (admin correction) → LOP appears.
    await testDb()
      .update(attendanceRecords)
      .set({ status: "absent" })
      .where(eq(attendanceRecords.id, row!.id));
    lopMap = await computeAttendanceLopForPeriod(testDb(), orgId, month, year);
    expect(lopMap.get(empId)?.lopDays).toBe(1);
  });
});
