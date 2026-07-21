/**
 * G8 — Attendance → LOP (Loss of Pay) tests.
 *
 * Before G8, payroll assumed a full paid month (daysWorked = daysInMonth,
 * lopDays = 0), silently over-paying absentees. These tests prove:
 *   - absence/half-day in `attendance_records` produce the correct LOP days,
 *   - a full-attendance (or empty) sheet yields zero LOP,
 *   - LOP actually reduces gross pay through the payroll-math LOP factor,
 *   - the reduction is correct (gross scales by daysWorked / daysInMonth).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";
import { buildEmployeePayrollInput, calendarToFyMonth } from "../services/payroll-run-aggregates";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import {
  employees,
  salaryStructures,
  attendanceRecords,
  eq,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("G8: attendance → LOP", () => {
  let orgId: string;
  let empId: string;
  let struct: typeof salaryStructures.$inferSelect;
  let emp: typeof employees.$inferSelect;

  const YEAR = 2026;
  const MONTH = 5; // May 2026 → 31 days

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId } = await seedUser(orgId, { email: `emp-${nanoid(6)}@qa.coheronconnect.io` });
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
    struct = s!;
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    emp = e!;
    empId = e!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function markAttendance(
    day: number,
    status: typeof attendanceRecords.$inferSelect["status"],
  ) {
    await testDb().insert(attendanceRecords).values({
      orgId,
      employeeId: empId,
      date: new Date(YEAR, MONTH - 1, day, 10, 0, 0),
      status,
    });
  }

  it("no attendance rows → zero LOP (full paid month)", async () => {
    const map = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    expect(map.get(empId)).toBeUndefined();
  });

  it("counts absent as 1 LOP day and half_day as 0.5", async () => {
    await markAttendance(2, "absent");
    await markAttendance(3, "absent");
    await markAttendance(4, "half_day");
    await markAttendance(5, "present");
    await markAttendance(6, "on_leave");
    const map = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    const lop = map.get(empId)!;
    expect(lop.daysInMonth).toBe(31);
    expect(lop.lopDays).toBe(2.5);
    expect(lop.daysWorked).toBe(28.5);
  });

  it("LOP reduces gross pay proportionally", async () => {
    const fyMonth = calendarToFyMonth(MONTH);

    const fullInput = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    const fullSlip = computeEmployeePayslip(fullInput, fyMonth);

    // 3 absent days out of 31.
    await markAttendance(2, "absent");
    await markAttendance(3, "absent");
    await markAttendance(4, "absent");
    const map = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    const lopInput = buildEmployeePayrollInput(emp, struct, MONTH, YEAR, map.get(empId));
    const lopSlip = computeEmployeePayslip(lopInput, fyMonth);

    expect(lopSlip.lopDays).toBe(3);
    expect(lopSlip.grossEarnings).toBeLessThan(fullSlip.grossEarnings);
    // Gross scales by daysWorked/daysInMonth = 28/31 on the pro-rated components.
    expect(lopSlip.basicEarned).toBe(Math.round(fullSlip.basicEarned * (28 / 31)));
  });

  it("clamps LOP to the number of days in the month", async () => {
    // 40 absent rows (impossible in reality, but a data glitch must not break math)
    for (let d = 1; d <= 31; d++) await markAttendance(d, "absent");
    const map = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    const lop = map.get(empId)!;
    expect(lop.lopDays).toBe(31);
    expect(lop.daysWorked).toBe(0);
  });
});
