/**
 * Leave → attendance reflex (G8).
 * ────────────────────────────────
 * When a leave request is approved, the days it covers must be reflected in
 * `attendance_records` so the payroll LOP derivation (see `attendance-lop.ts`)
 * sees them. Without this, an approved *unpaid* leave never becomes Loss-of-Pay
 * and a paid leave leaves a hole in the attendance sheet.
 *
 * Mapping (deterministic):
 *   - leave `type === "unpaid"`  → attendance `absent`   (1.0 LOP day, unpaid)
 *   - every other leave type      → attendance `on_leave` (0 LOP, paid absence)
 *
 * The expansion is inclusive of both `startDate` and `endDate` and emits exactly
 * one row per calendar day (date-only, midnight local), matching the unique
 * `(orgId, employeeId, date)` index so the caller can upsert idempotently.
 */

export type AttendanceStatusLiteral =
  | "present"
  | "absent"
  | "half_day"
  | "late"
  | "on_leave"
  | "holiday"
  | "weekend";

export type LeaveTypeLiteral =
  | "primary"
  | "annual"
  | "vacation"
  | "sick"
  | "parental"
  | "bereavement"
  | "unpaid"
  | "other";

export interface LeaveAttendanceRow {
  employeeId: string;
  date: Date;
  status: AttendanceStatusLiteral;
}

/** An unpaid leave is the only type that produces Loss-of-Pay. */
export function attendanceStatusForLeave(
  type: LeaveTypeLiteral,
): AttendanceStatusLiteral {
  return type === "unpaid" ? "absent" : "on_leave";
}

/** Normalise a timestamp to date-only (midnight local) to match the index. */
function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Expand an approved leave request into one attendance row per covered calendar
 * day. Returns `[]` when the range is inverted (endDate < startDate) so a bad
 * request can never fabricate rows.
 */
export function expandLeaveToAttendance(
  employeeId: string,
  type: LeaveTypeLiteral,
  startDate: Date,
  endDate: Date,
): LeaveAttendanceRow[] {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (end.getTime() < start.getTime()) return [];

  const status = attendanceStatusForLeave(type);
  const rows: LeaveAttendanceRow[] = [];
  for (
    let cur = new Date(start);
    cur.getTime() <= end.getTime();
    cur.setDate(cur.getDate() + 1)
  ) {
    rows.push({ employeeId, date: new Date(cur), status });
  }
  return rows;
}
