/**
 * ARREARS — back-pay for an earlier period, paid out in a later one.
 *
 * The Indian case this exists for: a revision is agreed in June but made effective from
 * April. April and May payroll have already run, been approved, and in most cases filed.
 * Those payslips must NOT be rewritten — a filed return's figures are fixed — so the
 * shortfall is paid as an arrears line in the current month.
 *
 * This module is the pure arithmetic only. It does not decide whether arrears are owed,
 * does not read structures, and does not post anything: the caller supplies, per already-paid
 * period, what WAS paid and what the revised structure WOULD have paid, and gets back the
 * per-period delta and the total.
 *
 * ── The one way to get this wrong ──────────────────────────────────────────────
 * `revisedGross` MUST be computed on the SAME attendance basis as the payslip that was
 * actually issued for that period — the same paid days and the same LOP. An employee with
 * three LOP days in May was paid a pro-rated May; if the arrears for May is computed on a
 * full month at the new rate, the difference silently pays back the LOP that was correctly
 * deducted. `paidDays`/`daysInMonth` are carried on each period so the caller's basis is
 * visible in the result and can be asserted in a test — this module cannot verify it for you.
 */

/** One already-paid period being re-priced against a revised structure. */
export interface ArrearsPeriodInput {
  /** Calendar month 1–12. */
  month: number;
  year: number;
  /** Gross actually paid for this period, from the issued payslip. */
  paidGross: number;
  /**
   * Gross the revised structure would have produced for this period, computed on the
   * SAME paid-days / LOP basis as the issued payslip. See the module note above.
   */
  revisedGross: number;
  /** Attendance basis carried through for evidence; not used in the arithmetic. */
  paidDays?: number;
  daysInMonth?: number;
}

export interface ArrearsPeriodLine extends ArrearsPeriodInput {
  /** revisedGross − paidGross, rounded to the rupee. Signed. */
  delta: number;
}

export interface ArrearsComputation {
  periods: ArrearsPeriodLine[];
  /** Signed sum of the per-period deltas (each rounded first, then summed). */
  totalDelta: number;
  /** The amount payable as arrears: `max(0, totalDelta)`. */
  payable: number;
  /** The magnitude of any net overpayment: `max(0, −totalDelta)`. */
  recovery: number;
  /**
   * True when the net movement is a recovery, or when ANY individual period went down
   * even though the net is positive. A caller proposing an amount must surface this
   * rather than netting a reduction silently against a rise.
   */
  hasRecovery: boolean;
}

/**
 * Re-price a set of already-paid periods against a revised structure.
 *
 * Rounding: each period's delta is rounded to the rupee BEFORE summing, matching how each
 * payslip was itself rounded — so the total is the sum of figures an operator can see and
 * reconcile line by line, not a rounded sum of unrounded parts.
 *
 * Returns zeroes for an empty period list (a revision effective from the current month
 * has nothing to re-price, which is the common case and is not an error).
 */
export function computeStructureArrears(periods: ArrearsPeriodInput[]): ArrearsComputation {
  const lines: ArrearsPeriodLine[] = periods.map((p) => ({
    ...p,
    delta: Math.round(p.revisedGross - p.paidGross),
  }));

  const totalDelta = lines.reduce((sum, l) => sum + l.delta, 0);

  return {
    periods: lines,
    totalDelta,
    payable: Math.max(0, totalDelta),
    recovery: Math.max(0, -totalDelta),
    hasRecovery: totalDelta < 0 || lines.some((l) => l.delta < 0),
  };
}

/**
 * The periods a backdated revision covers: every whole calendar month from the revision's
 * effective date up to — but NOT including — the period it will be paid in.
 *
 * The paid-in period is excluded because the current run already prices that month on the
 * revised structure; including it would pay the rise twice for that month.
 *
 * A revision effective on any day within a month covers that whole month — Indian payroll
 * pays a revision from the month it takes effect, not pro-rata within it. If a customer
 * ever needs mid-month effect, that is a different rule and belongs here explicitly, not as
 * an accident of date arithmetic.
 */
export function arrearsPeriodsCovered(
  effectiveFrom: Date,
  paidInMonth: number,
  paidInYear: number,
): Array<{ month: number; year: number }> {
  const out: Array<{ month: number; year: number }> = [];
  // LOCAL calendar fields, deliberately — this must agree with `versionHasPayslips` and
  // `resolveSalaryStructureForPeriod`, which both compare a stored timestamptz against
  // `new Date(year, month - 1, 1)` in the local frame. Reading UTC fields here instead would
  // make a structure effective 1 Jul (stored local-midnight, = 30 Jun 18:30Z in IST) look
  // backdated into June and propose a month of arrears that is not owed. The underlying
  // local-vs-UTC hazard is tracked as PERIOD-START-TZ-BOUNDARY in reports/fix-plan.md; this
  // function follows the existing convention rather than introducing a third one.
  let m = effectiveFrom.getMonth() + 1;
  let y = effectiveFrom.getFullYear();
  // Walk forward month by month until we reach the paid-in period.
  // Bounded at 120 iterations so a nonsense effective date cannot spin.
  for (let guard = 0; guard < 120; guard++) {
    if (y > paidInYear || (y === paidInYear && m >= paidInMonth)) break;
    out.push({ month: m, year: y });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
