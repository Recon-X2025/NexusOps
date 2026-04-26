/**
 * Canonical metric value formatter for the web app.
 *
 * Honours the `unit` field that the metric registry stamps onto every
 * BulletMetric / TrendMetric so the UI doesn't have to guess. Two modes:
 *
 *   - full: e.g. ₹5,77,46,971   (tables, reports, wide rows)
 *   - compact: e.g. ₹5.77 Cr     (narrow KPI tiles where overflow would clip)
 *
 * en-IN locale is used everywhere so currency renders ₹ with the Indian
 * lakh/crore grouping (12,34,56,789) which is the audience standard.
 */

export type MetricUnit =
  | "count"
  | "percent"
  | "ratio"
  | "currency_inr"
  | "hours"
  | "minutes"
  | "days"
  | "score"
  | string
  | undefined;

export type MetricStateLike = "healthy" | "watch" | "stressed" | "no_data" | string | undefined;

export interface FormatMetricOptions {
  /** Render with lakh/crore (or K/M) suffix to fit narrow tiles. */
  compact?: boolean;
  /** Override decimals for fractional values (e.g. CSAT 4.6 vs 4.62). */
  fractionDigits?: number;
}

const FULL_INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const COMPACT_INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

const FULL_INTEGER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const FULL_DECIMAL = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const COMPACT_NUMBER = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

export function formatMetricValue(
  value: number | null | undefined,
  unit?: MetricUnit,
  state?: MetricStateLike,
  opts: FormatMetricOptions = {},
): string {
  if (value == null || Number.isNaN(value) || state === "no_data") return "—";

  const { compact = false, fractionDigits } = opts;

  if (unit === "percent") {
    const digits = fractionDigits ?? 1;
    return `${value.toFixed(digits)}%`;
  }

  if (unit === "ratio") {
    const digits = fractionDigits ?? 2;
    return value.toFixed(digits);
  }

  if (unit === "currency_inr") {
    return (compact ? COMPACT_INR : FULL_INR).format(value);
  }

  if (unit === "days") return `${value.toFixed(fractionDigits ?? 1)} d`;
  if (unit === "hours") return `${value.toFixed(fractionDigits ?? 1)} h`;
  if (unit === "minutes") return `${Math.round(value)} m`;

  if (unit === "score") {
    const digits = fractionDigits ?? 1;
    return value.toFixed(digits);
  }

  // Generic count / unknown units. Apply en-IN grouping always.
  if (compact && Math.abs(value) >= 1000) {
    return COMPACT_NUMBER.format(value);
  }
  if (!Number.isInteger(value) && Math.abs(value) < 100) {
    return FULL_DECIMAL.format(value);
  }
  return FULL_INTEGER.format(Math.round(value));
}

/**
 * Format the gap to target with the same unit conventions as the current
 * value, but always carrying an explicit sign for clarity in tables.
 */
export function formatTargetDelta(
  delta: number,
  unit?: MetricUnit,
): string {
  if (Math.abs(delta) < 1e-9) return "on target";
  const sign = delta > 0 ? "+" : "−";
  const magnitude = formatMetricValue(Math.abs(delta), unit);
  return `${sign}${magnitude}`;
}
