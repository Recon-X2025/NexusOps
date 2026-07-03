/**
 * CoheronConnect India Gratuity Engine
 * ────────────────────────────────────
 * Pure money-math for the Payment of Gratuity Act, 1972.
 *
 * Statutory formula (Act §4):
 *   gratuity = (15 / 26) × lastDrawnWages × completedYears
 * where
 *   - lastDrawnWages = last-drawn monthly (Basic + Dearness Allowance),
 *   - 15/26 = 15 days' wages for every completed year, treating a month as 26
 *     working days,
 *   - completedYears = years of continuous service, with a part-year of
 *     ≥ 6 months rounded UP to a full year (§4 explanation / settled case law),
 *   - eligibility requires ≥ 5 years of continuous service (waived on death or
 *     disablement).
 *
 * The payout is capped at the statutory maximum (₹20,00,000 since 2018;
 * see GRATUITY_CEILING). All amounts are in whole rupees (rounded).
 *
 * For accrual accounting we also expose the monthly provision an employer sets
 * aside so the liability is recognised evenly over the year rather than as a
 * lump sum at exit.
 */

/** Statutory maximum gratuity payout (Payment of Gratuity (Amendment) Act, 2018). */
export const GRATUITY_CEILING = 2_000_000;

/** Minimum continuous service (years) to be eligible, save death/disablement. */
export const GRATUITY_MIN_YEARS = 5;

/** Days used in the statutory formula. */
const GRATUITY_DAYS_PER_YEAR = 15;
const GRATUITY_WORKING_DAYS_PER_MONTH = 26;

export interface GratuityInput {
  /** Last-drawn monthly wages = Basic + Dearness Allowance (in rupees). */
  lastDrawnBasicPlusDA: number;
  /** Continuous service in completed calendar years (integer part). */
  completedYears: number;
  /**
   * Trailing months beyond `completedYears` (0–11). ≥ 6 rounds the year up.
   * Optional; defaults to 0.
   */
  trailingMonths?: number;
  /**
   * Waive the 5-year minimum (death / permanent disablement per §4(1) proviso).
   */
  waiveMinimumService?: boolean;
  /** Override the statutory cap (rare; defaults to GRATUITY_CEILING). */
  ceiling?: number;
}

export interface GratuityComputation {
  eligible: boolean;
  /** Reason when not eligible (e.g. "min-service"). */
  ineligibleReason?: string;
  /** Years actually used in the formula after ≥6-month rounding. */
  countedYears: number;
  lastDrawnBasicPlusDA: number;
  /** Formula result BEFORE the statutory cap. */
  grossGratuity: number;
  /** Payable gratuity AFTER the statutory cap. */
  gratuity: number;
  /** True when the cap reduced the payout. */
  cappedAtCeiling: boolean;
  ceiling: number;
}

/**
 * Rounds completed service years per the Act: a trailing part-year of ≥ 6
 * months counts as a full additional year; < 6 months is dropped.
 */
export function roundGratuityYears(completedYears: number, trailingMonths = 0): number {
  const base = Math.max(0, Math.floor(completedYears));
  const months = Math.max(0, Math.min(11, Math.floor(trailingMonths)));
  return months >= 6 ? base + 1 : base;
}

/**
 * Computes the gratuity payable under the Payment of Gratuity Act, 1972.
 */
export function computeGratuity(input: GratuityInput): GratuityComputation {
  const ceiling = input.ceiling ?? GRATUITY_CEILING;
  const wages = Math.max(0, input.lastDrawnBasicPlusDA);
  const countedYears = roundGratuityYears(input.completedYears, input.trailingMonths ?? 0);

  // Eligibility: ≥ 5 years unless waived (death / disablement). Note the
  // 5-year test uses actual completed years, NOT the rounded-up figure.
  const meetsMinimum =
    input.waiveMinimumService === true ||
    Math.floor(Math.max(0, input.completedYears)) >= GRATUITY_MIN_YEARS;

  if (!meetsMinimum) {
    return {
      eligible: false,
      ineligibleReason: "min-service",
      countedYears,
      lastDrawnBasicPlusDA: wages,
      grossGratuity: 0,
      gratuity: 0,
      cappedAtCeiling: false,
      ceiling,
    };
  }

  const grossGratuity = Math.round(
    (GRATUITY_DAYS_PER_YEAR / GRATUITY_WORKING_DAYS_PER_MONTH) * wages * countedYears,
  );
  const gratuity = Math.min(grossGratuity, ceiling);

  return {
    eligible: true,
    countedYears,
    lastDrawnBasicPlusDA: wages,
    grossGratuity,
    gratuity,
    cappedAtCeiling: gratuity < grossGratuity,
    ceiling,
  };
}

/**
 * Monthly gratuity provision for accrual accounting: the employer recognises
 * one year's worth of gratuity liability evenly across 12 months, i.e.
 *   monthlyAccrual = (15 / 26 × currentBasicPlusDA) / 12
 * This is an accounting estimate of the incremental liability earned each
 * month; it is NOT the statutory payout (that is `computeGratuity`).
 */
export function computeMonthlyGratuityAccrual(currentBasicPlusDA: number): number {
  const wages = Math.max(0, currentBasicPlusDA);
  const perYear = (GRATUITY_DAYS_PER_YEAR / GRATUITY_WORKING_DAYS_PER_MONTH) * wages;
  return Math.round(perYear / 12);
}
