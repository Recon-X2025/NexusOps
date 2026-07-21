/**
 * External daily-attendance ingest (G8).
 * ───────────────────────────────────────
 * Normalises a raw daily-attendance feed — the kind a biometric device or an
 * upstream HRMS emits — into the `attendance_records` shape so it flows through
 * the existing LOP → payslip pipeline (`attendance-lop.ts`).
 *
 * A device/HRMS never knows our internal employee UUID; it emits its own
 * *employee code* (the human `employees.employeeId`, e.g. "EMP-0001"). The
 * router resolves that code to the UUID; this lib is pure and works purely on
 * the normalised row, deriving the payroll-relevant fields deterministically:
 *
 *   status  — explicit `status` wins; otherwise derived from punches:
 *               no checkIn                     → absent
 *               checkIn but no checkOut        → present (open shift)
 *               checkIn late vs shiftStart     → late
 *               worked < half the shift        → half_day
 *               otherwise                      → present
 *   lateMinutes      — minutes checkIn is after `shiftStart` (clamped ≥ 0)
 *   overtimeMinutes  — minutes worked beyond `shiftMinutes` (clamped ≥ 0)
 *   hoursWorked      — (checkOut − checkIn) in hours, 2dp; "0.00" if no pair
 *
 * All derivations are deterministic and side-effect free so they are unit
 * testable without a DB. The router owns tenancy, code→UUID resolution, and the
 * idempotent upsert on the unique `(orgId, employeeId, date)` index.
 */

export type AttendanceStatusLiteral =
  | "present"
  | "absent"
  | "half_day"
  | "late"
  | "on_leave"
  | "holiday"
  | "weekend";

/** Default full-day shift length when a feed row omits `shiftMinutes`. */
export const DEFAULT_SHIFT_MINUTES = 8 * 60;

/** Grace before a late check-in counts as `late` (minutes). */
export const DEFAULT_LATE_GRACE_MINUTES = 10;

/**
 * One raw feed row as received from a device/HRMS. `employeeCode` is the human
 * `employees.employeeId`. `date` is the calendar day; `checkIn`/`checkOut` are
 * optional punch timestamps. `status` may be supplied explicitly (e.g. a
 * device-marked holiday) and, when present, is authoritative.
 */
export interface RawAttendanceFeedRow {
  employeeCode: string;
  date: Date;
  checkIn?: Date | null;
  checkOut?: Date | null;
  status?: AttendanceStatusLiteral | null;
  shiftStart?: Date | null;
  shiftMinutes?: number | null;
  notes?: string | null;
}

/** Normalised row ready to be keyed to a UUID and upserted. */
export interface NormalisedAttendanceRow {
  employeeCode: string;
  date: Date;
  status: AttendanceStatusLiteral;
  checkIn: Date | null;
  checkOut: Date | null;
  hoursWorked: string;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string | null;
}

/** Normalise a timestamp to date-only (midnight local) to match the index. */
function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}

/**
 * Derive the attendance status from punches when the feed did not assert one.
 * An explicit `status` on the raw row is authoritative and bypasses this.
 */
export function deriveStatus(
  checkIn: Date | null,
  checkOut: Date | null,
  shiftStart: Date | null,
  shiftMinutes: number,
): AttendanceStatusLiteral {
  if (!checkIn) return "absent";
  // Open shift (punched in, not out): treat as present, no half-day/late math.
  if (!checkOut) {
    if (shiftStart && minutesBetween(shiftStart, checkIn) > DEFAULT_LATE_GRACE_MINUTES) {
      return "late";
    }
    return "present";
  }
  const worked = minutesBetween(checkIn, checkOut);
  if (worked < shiftMinutes / 2) return "half_day";
  if (shiftStart && minutesBetween(shiftStart, checkIn) > DEFAULT_LATE_GRACE_MINUTES) {
    return "late";
  }
  return "present";
}

/**
 * Normalise one raw feed row. Pure: no I/O, no clock reads. `status` is honoured
 * verbatim when present; otherwise derived from punches. Late/overtime are
 * clamped non-negative so a clock-skewed device can never fabricate negatives.
 */
export function normaliseFeedRow(raw: RawAttendanceFeedRow): NormalisedAttendanceRow {
  const shiftMinutes =
    raw.shiftMinutes && raw.shiftMinutes > 0 ? raw.shiftMinutes : DEFAULT_SHIFT_MINUTES;
  const checkIn = raw.checkIn ?? null;
  const checkOut = raw.checkOut ?? null;
  const shiftStart = raw.shiftStart ?? null;

  const status: AttendanceStatusLiteral =
    raw.status ?? deriveStatus(checkIn, checkOut, shiftStart, shiftMinutes);

  let hoursWorked = "0.00";
  let overtimeMinutes = 0;
  if (checkIn && checkOut) {
    const worked = Math.max(0, minutesBetween(checkIn, checkOut));
    hoursWorked = (worked / 60).toFixed(2);
    overtimeMinutes = Math.max(0, Math.round(worked - shiftMinutes));
  }

  let lateMinutes = 0;
  if (checkIn && shiftStart) {
    lateMinutes = Math.max(0, Math.round(minutesBetween(shiftStart, checkIn)));
  }

  return {
    employeeCode: raw.employeeCode,
    date: dateOnly(raw.date),
    status,
    checkIn,
    checkOut,
    hoursWorked,
    lateMinutes,
    overtimeMinutes,
    notes: raw.notes ?? null,
  };
}

/**
 * Normalise a whole feed. Rows with the same `(employeeCode, date)` are
 * de-duplicated with **last-write-wins**, matching the upsert semantics so a
 * batch that repeats a day resolves to a single deterministic row.
 */
export function normaliseFeed(rows: RawAttendanceFeedRow[]): NormalisedAttendanceRow[] {
  const byKey = new Map<string, NormalisedAttendanceRow>();
  for (const raw of rows) {
    const n = normaliseFeedRow(raw);
    const key = `${n.employeeCode}::${n.date.getTime()}`;
    byKey.set(key, n);
  }
  return [...byKey.values()];
}
