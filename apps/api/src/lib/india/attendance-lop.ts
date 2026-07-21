/**
 * Attendance → LOP (Loss of Pay) computation (G8).
 * ────────────────────────────────────────────────
 * Derives paid days vs LOP days for a pay period from `attendance_records`,
 * so unpaid absence actually reduces gross pay (LOP factor in payroll-math's
 * `computeGross`). Previously payroll assumed a full-attendance month
 * (`daysWorked = daysInMonth`, `lopDays = 0`), silently over-paying absentees.
 *
 * LOP rule (deterministic):
 *   - `absent`               → 1.0 LOP day (unpaid)
 *   - `half_day`             → 0.5 LOP day (half unpaid)
 *   - present/late/on_leave/holiday/weekend → 0 LOP (paid)
 *
 * Days for which no attendance row exists are treated as paid (not LOP), so a
 * partial or empty attendance sheet never fabricates deductions — LOP only ever
 * comes from an explicit `absent`/`half_day` record.
 */
import { attendanceRecords, eq, and, gte, lte, type DbOrTx } from "@coheronconnect/db";

export interface AttendanceLop {
  daysInMonth: number;
  daysWorked: number;
  lopDays: number;
}

type AttendanceStatus = typeof attendanceRecords.$inferSelect["status"];

function lopWeight(status: AttendanceStatus): number {
  if (status === "absent") return 1;
  if (status === "half_day") return 0.5;
  return 0;
}

/**
 * Build a per-employee LOP map for one org + pay period in a single query.
 * Key = employeeId. Employees with no absence rows are simply absent from the
 * map; callers treat a missing entry as zero LOP (full paid month).
 */
export async function computeAttendanceLopForPeriod(
  db: DbOrTx,
  orgId: string,
  month: number,
  year: number,
): Promise<Map<string, AttendanceLop>> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999);

  const rows = await db
    .select({
      employeeId: attendanceRecords.employeeId,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.orgId, orgId),
        gte(attendanceRecords.date, periodStart),
        lte(attendanceRecords.date, periodEnd),
      ),
    );

  const lopByEmployee = new Map<string, number>();
  for (const row of rows) {
    const w = lopWeight(row.status);
    if (w === 0) continue;
    lopByEmployee.set(row.employeeId, (lopByEmployee.get(row.employeeId) ?? 0) + w);
  }

  const result = new Map<string, AttendanceLop>();
  for (const [employeeId, lopRaw] of lopByEmployee) {
    // Clamp to the month so a data glitch can never drive gross negative.
    const lopDays = Math.min(lopRaw, daysInMonth);
    result.set(employeeId, {
      daysInMonth,
      daysWorked: daysInMonth - lopDays,
      lopDays,
    });
  }
  return result;
}
