/**
 * Shift-schedule resolution + punch derivation (G8).
 * ──────────────────────────────────────────────────
 * Turns a self-service sign-in / sign-out into a payroll-correct attendance
 * status by comparing the punch against the employee's *effective* shift.
 *
 * Effective-shift precedence (deterministic):
 *   1. the employee's explicitly assigned shift (`employees.shiftScheduleId`),
 *   2. else the org's default shift (`shiftSchedules.isDefault = true`),
 *   3. else a built-in baseline (09:00 start / 8h / 10-min grace).
 *
 * A shift is stored as offsets from local midnight (`startMinutes`,
 * `durationMinutes`, `graceMinutes`) so it is timezone-agnostic; a punch is
 * reduced to its local wall-clock minute for comparison. The derivation mirrors
 * the external-ingest normaliser (`attendance-ingest.ts`) so a self-service
 * punch and a device feed classify an identical day identically.
 */
import type { AttendanceStatusLiteral } from "./attendance-ingest";

export interface ShiftDefinition {
  /** Minutes from local midnight the shift starts (e.g. 540 = 09:00). */
  startMinutes: number;
  /** Expected working span in minutes (e.g. 480 = 8h). */
  durationMinutes: number;
  /** Lateness tolerance before a check-in is flagged `late`. */
  graceMinutes: number;
}

/** Built-in baseline when neither an assigned nor an org-default shift exists. */
export const BUILTIN_SHIFT: ShiftDefinition = {
  startMinutes: 9 * 60,
  durationMinutes: 8 * 60,
  graceMinutes: 10,
};

/**
 * Pick the effective shift. `assigned` beats `orgDefault` beats the built-in
 * baseline. A `null`/`undefined` at any tier falls through to the next.
 */
export function resolveShift(
  assigned: ShiftDefinition | null | undefined,
  orgDefault: ShiftDefinition | null | undefined,
): ShiftDefinition {
  return assigned ?? orgDefault ?? BUILTIN_SHIFT;
}

/** Local wall-clock minute of a timestamp (0–1439). */
export function localMinuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export interface PunchDerivation {
  status: AttendanceStatusLiteral;
  lateMinutes: number;
  overtimeMinutes: number;
  /** Hours between check-in and check-out, 2dp; "0.00" when no pair. */
  hoursWorked: string;
}

/**
 * Derive the payroll-relevant fields for a punch pair against a shift. Pure.
 *
 *   status  — no checkIn                         → absent
 *             checkIn but no checkOut (open)     → late if past grace, else present
 *             worked < half the shift            → half_day
 *             checkIn past start+grace           → late
 *             otherwise                          → present
 *   lateMinutes     — minutes checkIn is past shift start (clamped ≥ 0)
 *   overtimeMinutes — minutes worked beyond durationMinutes (clamped ≥ 0)
 *
 * All values are clamped non-negative so an early punch or a clock skew can
 * never fabricate negative late/overtime.
 */
export function derivePunch(
  checkIn: Date | null,
  checkOut: Date | null,
  shift: ShiftDefinition,
): PunchDerivation {
  if (!checkIn) {
    return { status: "absent", lateMinutes: 0, overtimeMinutes: 0, hoursWorked: "0.00" };
  }

  const lateMinutes = Math.max(0, localMinuteOfDay(checkIn) - shift.startMinutes);
  const isLate = lateMinutes > shift.graceMinutes;

  if (!checkOut) {
    return {
      status: isLate ? "late" : "present",
      lateMinutes,
      overtimeMinutes: 0,
      hoursWorked: "0.00",
    };
  }

  const workedMinutes = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60000);
  const hoursWorked = (workedMinutes / 60).toFixed(2);
  const overtimeMinutes = Math.max(0, Math.round(workedMinutes - shift.durationMinutes));

  let status: AttendanceStatusLiteral;
  if (workedMinutes < shift.durationMinutes / 2) {
    status = "half_day";
  } else if (isLate) {
    status = "late";
  } else {
    status = "present";
  }

  return { status, lateMinutes, overtimeMinutes, hoursWorked };
}
