/**
 * CoheronConnect Leave Accrual Engine
 * ───────────────────────────────────
 * Pure money/day-math for leave accrual, carry-forward and encashment.
 * India practice (Factories Act / Shops & Establishments vary by state) is
 * configurable via a policy: an annual entitlement earned pro-rata each month,
 * a carry-forward cap on unused leave at year-end, and optional encashment of
 * the balance at a per-day wage.
 *
 * Days are tracked to one decimal (half-day granularity). Money is whole rupees.
 */

export interface LeavePolicyConfig {
  /** Total leave days credited per full year. */
  annualEntitlementDays: number;
  /**
   * Days credited per month. Defaults to annualEntitlementDays / 12 when not
   * given (even monthly accrual).
   */
  monthlyAccrualDays?: number;
  /** Maximum unused days that may roll into the next year (0 = none). */
  maxCarryForwardDays: number;
  /** Whether the leave type may be encashed. */
  encashable: boolean;
}

/** Rounds a day count to one decimal place (half-day friendly). */
export function roundDays(days: number): number {
  return Math.round(days * 10) / 10;
}

/**
 * Days accrued for one month of service. If a monthly rate is configured it is
 * used verbatim; otherwise the annual entitlement is spread evenly over 12
 * months. Optionally pro-rates by days-worked / days-in-month (e.g. a mid-month
 * joiner or unpaid leave).
 */
export function computeMonthlyLeaveAccrual(
  policy: LeavePolicyConfig,
  opts: { daysWorked?: number; daysInMonth?: number } = {},
): number {
  const perMonth =
    policy.monthlyAccrualDays ?? policy.annualEntitlementDays / 12;
  const worked = opts.daysWorked;
  const inMonth = opts.daysInMonth;
  if (worked != null && inMonth != null && inMonth > 0) {
    const fraction = Math.max(0, Math.min(1, worked / inMonth));
    return roundDays(perMonth * fraction);
  }
  return roundDays(perMonth);
}

export interface CarryForwardResult {
  /** Days rolled into the next year (after applying the cap). */
  carriedForward: number;
  /** Days lost because they exceeded the carry-forward cap ("lapsed"). */
  lapsed: number;
}

/**
 * Splits a closing balance into the portion that carries forward (up to the
 * policy cap) and the portion that lapses.
 */
export function computeCarryForward(
  closingBalanceDays: number,
  policy: LeavePolicyConfig,
): CarryForwardResult {
  const balance = Math.max(0, closingBalanceDays);
  const cap = Math.max(0, policy.maxCarryForwardDays);
  const carriedForward = roundDays(Math.min(balance, cap));
  const lapsed = roundDays(balance - carriedForward);
  return { carriedForward, lapsed };
}

export interface LeaveEncashmentResult {
  encashableDays: number;
  perDayWage: number;
  amount: number;
}

/**
 * Encashment value of an unused-leave balance. The per-day wage is the standard
 * (Basic + DA) / 26 working days, matching the gratuity day-convention; callers
 * may override perDayWage directly.
 *
 * @param unusedDays balance eligible for encashment
 * @param wages either a per-day wage (when perDayIsWage=true) or monthly Basic+DA
 */
export function computeLeaveEncashment(
  unusedDays: number,
  wages: number,
  opts: { perDayIsWage?: boolean; workingDaysPerMonth?: number; encashable?: boolean } = {},
): LeaveEncashmentResult {
  if (opts.encashable === false || unusedDays <= 0 || wages <= 0) {
    return { encashableDays: 0, perDayWage: 0, amount: 0 };
  }
  const days = roundDays(unusedDays);
  const perDayWage = opts.perDayIsWage
    ? wages
    : Math.round(wages / (opts.workingDaysPerMonth ?? 26));
  const amount = Math.round(days * perDayWage);
  return { encashableDays: days, perDayWage, amount };
}
