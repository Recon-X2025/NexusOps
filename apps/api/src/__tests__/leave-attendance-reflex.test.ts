/**
 * G8 — Leave → attendance reflex (end-to-end).
 *
 * Closes the "record without a reflex" gap: approving a leave request now writes
 * the covered days into `attendance_records`, so payroll LOP derivation actually
 * sees them. Proves:
 *   - approving an UNPAID leave writes `absent` rows → payroll LOP → reduced gross,
 *   - approving a PAID leave writes `on_leave` rows → zero LOP → unchanged gross,
 *   - the reflex spans the full inclusive date range,
 *   - the leave-derived status upserts over a prior `present` row (correction),
 *   - re-approving is idempotent (no duplicate rows, blocked as non-pending),
 *   - `bulkMark` upserts (a correction updates instead of being dropped),
 *   - the whole chain flows into the payslip via the payroll-run aggregate path.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";
import { buildEmployeePayrollInput, calendarToFyMonth } from "../services/payroll-run-aggregates";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import {
  employees,
  salaryStructures,
  leaveRequests,
  attendanceRecords,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const YEAR = 2026;
const MONTH = 5; // May 2026 → 31 days

describe("G8: leave → attendance reflex (end-to-end)", () => {
  let caller: any;
  let orgId: string;
  let adminUserId: string;
  let empId: string;
  let emp: typeof employees.$inferSelect;
  let struct: typeof salaryStructures.$inferSelect;

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
    struct = s!;

    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId: adminUserId,
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

  async function insertLeave(
    type: typeof leaveRequests.$inferSelect["type"],
    startDay: number,
    endDay: number,
  ) {
    const start = new Date(YEAR, MONTH - 1, startDay);
    const end = new Date(YEAR, MONTH - 1, endDay);
    const days = endDay - startDay + 1;
    const [row] = await testDb()
      .insert(leaveRequests)
      .values({
        orgId,
        employeeId: empId,
        type,
        startDate: start,
        endDate: end,
        days: String(days),
        status: "pending",
      })
      .returning();
    return row!;
  }

  async function attendanceForMonth() {
    return testDb()
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.orgId, orgId), eq(attendanceRecords.employeeId, empId)));
  }

  it("approving an unpaid leave writes `absent` rows across the full range", async () => {
    const req = await insertLeave("unpaid", 10, 12); // 3 days
    await caller.leave.approve({ id: req.id });

    const rows = await attendanceForMonth();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "absent")).toBe(true);
    const days = rows.map((r) => new Date(r.date).getDate()).sort((a, b) => a - b);
    expect(days).toEqual([10, 11, 12]);
  });

  it("approving a paid leave writes `on_leave` rows (zero LOP)", async () => {
    const req = await insertLeave("sick", 5, 6); // 2 days
    await caller.leave.approve({ id: req.id });

    const rows = await attendanceForMonth();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "on_leave")).toBe(true);
  });

  it("unpaid leave flows to payroll LOP and reduces gross; paid leave does not", async () => {
    const fyMonth = calendarToFyMonth(MONTH);
    const fullSlip = computeEmployeePayslip(
      buildEmployeePayrollInput(emp, struct, MONTH, YEAR),
      fyMonth,
    );

    // 4 unpaid days.
    const unpaid = await insertLeave("unpaid", 2, 5);
    await caller.leave.approve({ id: unpaid.id });

    const lopMap = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    const lop = lopMap.get(empId)!;
    expect(lop.lopDays).toBe(4);

    const lopSlip = computeEmployeePayslip(
      buildEmployeePayrollInput(emp, struct, MONTH, YEAR, lop),
      fyMonth,
    );
    expect(lopSlip.grossEarnings).toBeLessThan(fullSlip.grossEarnings);
    expect(lopSlip.basicEarned).toBe(Math.round(fullSlip.basicEarned * (27 / 31)));
  });

  it("paid leave produces no LOP", async () => {
    const paid = await insertLeave("annual", 8, 14); // 7 paid days
    await caller.leave.approve({ id: paid.id });

    const lopMap = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    // on_leave carries zero LOP weight → the employee is absent from the map.
    expect(lopMap.get(empId)).toBeUndefined();
  });

  it("leave-derived status upserts over a prior `present` row (correction)", async () => {
    // Pre-existing full-attendance rows for the same days.
    await caller.attendance.bulkMark({
      records: [
        { employeeId: empId, date: new Date(YEAR, MONTH - 1, 20), status: "present" },
        { employeeId: empId, date: new Date(YEAR, MONTH - 1, 21), status: "present" },
      ],
    });

    const req = await insertLeave("unpaid", 20, 21);
    await caller.leave.approve({ id: req.id });

    const rows = await attendanceForMonth();
    expect(rows).toHaveLength(2); // upsert, not duplicate
    expect(rows.every((r) => r.status === "absent")).toBe(true);
  });

  it("re-approving a request is blocked (idempotent, no duplicate rows)", async () => {
    const req = await insertLeave("unpaid", 15, 15);
    await caller.leave.approve({ id: req.id });
    await expect(caller.leave.approve({ id: req.id })).rejects.toThrow(/not pending/i);

    const rows = await attendanceForMonth();
    expect(rows).toHaveLength(1);
  });

  it("bulkMark upserts: a correction updates the existing row", async () => {
    const day = new Date(YEAR, MONTH - 1, 25);
    await caller.attendance.bulkMark({
      records: [{ employeeId: empId, date: day, status: "absent" }],
    });
    // Correct it to present.
    await caller.attendance.bulkMark({
      records: [{ employeeId: empId, date: day, status: "present" }],
    });

    const rows = await attendanceForMonth();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("present");
  });

  it("bulkMark with an empty list is a no-op", async () => {
    const res = await caller.attendance.bulkMark({ records: [] });
    expect(res.count).toBe(0);
  });
});
