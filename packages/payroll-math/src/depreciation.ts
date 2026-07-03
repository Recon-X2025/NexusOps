/**
 * CoheronConnect Fixed-Asset Depreciation Engine
 * ──────────────────────────────────────────────
 * Pure money-math for periodic depreciation of tangible fixed assets.
 *
 * Two methods are supported (the two the Companies Act, 2013 Schedule II and
 * the Income-tax Act permit for book depreciation):
 *
 *  - SLM  — Straight-Line Method:
 *      annualDepreciation = (cost − salvage) / usefulLifeYears
 *    Each period charges an equal amount until the book value reaches salvage.
 *
 *  - WDV  — Written-Down-Value (declining-balance) Method:
 *      periodDepreciation = openingBookValue × rate
 *    where `rate` is derived from useful life + salvage per Schedule II:
 *      rate = 1 − (salvage / cost) ^ (1 / usefulLifeYears)
 *    (falls back to an explicit `wdvRate` when provided). Depreciation is
 *    floored so the book value never drops below salvage.
 *
 * Everything is computed to whole rupees (rounded per period) and the running
 * book value is derived from the *rounded* charges so the schedule ties out
 * exactly to the accumulated depreciation. The final period is trued-up so the
 * closing book value lands exactly on salvage (no rounding drift).
 *
 * These functions are pure (no DB, no dates beyond the period index) so they
 * can be unit-tested in isolation and reused by the assets router, the
 * month-end depreciation run, and the balance-sheet book-value rollup.
 */

export type DepreciationMethod = "SLM" | "WDV";

export interface DepreciationInput {
  /** Gross acquisition cost (capitalised value) in rupees. */
  cost: number;
  /** Residual / salvage value at end of life (rupees). Defaults to 0. */
  salvageValue?: number;
  /** Useful life in whole years (must be ≥ 1 for a schedule). */
  usefulLifeYears: number;
  /** Depreciation method. Defaults to "SLM". */
  method?: DepreciationMethod;
  /**
   * Explicit WDV rate as a fraction (e.g. 0.4 for 40%). When omitted for the
   * WDV method the rate is derived from cost/salvage/life. Ignored for SLM.
   */
  wdvRate?: number;
}

export interface DepreciationPeriod {
  /** 1-based period index (year). */
  period: number;
  openingBookValue: number;
  /** Depreciation charged in this period (rounded, whole rupees). */
  depreciation: number;
  /** Cumulative depreciation through this period. */
  accumulatedDepreciation: number;
  closingBookValue: number;
}

export interface DepreciationSchedule {
  method: DepreciationMethod;
  cost: number;
  salvageValue: number;
  usefulLifeYears: number;
  /** Effective WDV rate used (0 for SLM). */
  rate: number;
  /** Total depreciable base = cost − salvage. */
  depreciableBase: number;
  periods: DepreciationPeriod[];
}

/** Rounds to whole rupees (banker-agnostic; standard half-up via Math.round). */
function r(n: number): number {
  return Math.round(n);
}

/**
 * Derives the WDV (declining-balance) rate from cost, salvage and life per the
 * Schedule II formula `rate = 1 − (salvage/cost)^(1/life)`. Returns 0 when the
 * inputs are degenerate (zero cost, or salvage ≥ cost).
 */
export function deriveWdvRate(cost: number, salvageValue: number, usefulLifeYears: number): number {
  if (cost <= 0 || usefulLifeYears < 1) return 0;
  const salvage = Math.max(0, Math.min(salvageValue, cost));
  if (salvage <= 0) {
    // A pure declining-balance can never reach exactly zero; Schedule II uses a
    // notional 5% residual for rate derivation in that case.
    const notionalSalvage = cost * 0.05;
    return 1 - Math.pow(notionalSalvage / cost, 1 / usefulLifeYears);
  }
  return 1 - Math.pow(salvage / cost, 1 / usefulLifeYears);
}

/**
 * Depreciation charge for a SINGLE period given the current book value and the
 * accumulated depreciation so far. Used by the incremental month/year-end run
 * where we don't want to regenerate the whole schedule.
 *
 * The charge is clamped so the closing book value never falls below salvage.
 */
export function computePeriodDepreciation(
  input: DepreciationInput,
  openingBookValue: number,
): number {
  const cost = Math.max(0, input.cost);
  const salvage = Math.max(0, Math.min(input.salvageValue ?? 0, cost));
  const life = Math.max(1, Math.floor(input.usefulLifeYears));
  const method = input.method ?? "SLM";
  const remaining = Math.max(0, openingBookValue - salvage);
  if (remaining <= 0) return 0;

  let charge: number;
  if (method === "WDV") {
    const rate = input.wdvRate ?? deriveWdvRate(cost, salvage, life);
    charge = openingBookValue * rate;
  } else {
    charge = (cost - salvage) / life;
  }
  // Never depreciate below salvage.
  return r(Math.min(charge, remaining));
}

/**
 * Generates the full period-by-period depreciation schedule. The final period
 * is trued-up so the closing book value equals salvage exactly (absorbing any
 * rounding drift), which is what a fixed-asset register expects.
 */
export function generateDepreciationSchedule(input: DepreciationInput): DepreciationSchedule {
  const cost = Math.max(0, input.cost);
  const salvage = Math.max(0, Math.min(input.salvageValue ?? 0, cost));
  const life = Math.max(1, Math.floor(input.usefulLifeYears));
  const method = input.method ?? "SLM";
  const rate = method === "WDV" ? (input.wdvRate ?? deriveWdvRate(cost, salvage, life)) : 0;

  const periods: DepreciationPeriod[] = [];
  let book = cost;
  let accumulated = 0;

  for (let p = 1; p <= life; p++) {
    const opening = book;
    let charge: number;
    if (p === life) {
      // Final period: true-up to land exactly on salvage.
      charge = r(opening - salvage);
    } else if (method === "WDV") {
      charge = r(Math.min(opening * rate, Math.max(0, opening - salvage)));
    } else {
      charge = r(Math.min((cost - salvage) / life, Math.max(0, opening - salvage)));
    }
    charge = Math.max(0, charge);
    accumulated += charge;
    book = opening - charge;
    periods.push({
      period: p,
      openingBookValue: opening,
      depreciation: charge,
      accumulatedDepreciation: accumulated,
      closingBookValue: book,
    });
  }

  return {
    method,
    cost,
    salvageValue: salvage,
    usefulLifeYears: life,
    rate,
    depreciableBase: cost - salvage,
    periods,
  };
}

/**
 * Book value of an asset after `elapsedYears` complete periods. Convenience
 * wrapper over the schedule for the balance-sheet rollup; clamps the index to
 * [0, life].
 */
export function bookValueAfter(input: DepreciationInput, elapsedYears: number): number {
  if (elapsedYears <= 0) return Math.max(0, input.cost);
  const schedule = generateDepreciationSchedule(input);
  const idx = Math.min(Math.floor(elapsedYears), schedule.periods.length);
  if (idx <= 0) return schedule.cost;
  return schedule.periods[idx - 1]!.closingBookValue;
}
