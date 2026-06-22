import type { MetricDefinition, MetricDirection, MetricValue } from "./types";

export function formatMetricNumber(
  value: number,
  unit: MetricDefinition["unit"] | undefined,
  state: MetricValue["state"],
): string {
  if (state === "no_data" && value === 0) return "—";
  if (unit === "currency_inr") {
    const abs = Math.abs(value);
    let formatted = "";
    if (abs >= 10000000) {
      formatted = (value / 10000000).toFixed(2) + " Cr";
    } else if (abs >= 100000) {
      formatted = (value / 100000).toFixed(2) + " Lac";
    } else {
      formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
    }
    return `₹${formatted}`;
  }
  if (unit === "percent" || unit === "ratio") {
    return `${value.toFixed(unit === "ratio" ? 2 : 1)}${unit === "percent" ? "%" : ""}`;
  }
  if (unit === "hours" || unit === "minutes" || unit === "days") {
    return `${Math.round(value)} ${unit}`;
  }
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: unit === "score" ? 1 : 0 }).format(value);
}

export function deltaSemantic(
  current: number,
  previous: number | undefined,
  direction: MetricDirection,
): "good" | "bad" | "neutral" {
  if (previous === undefined || Number.isNaN(previous)) return "neutral";
  const d = current - previous;
  if (Math.abs(d) < 1e-9) return "neutral";
  const up = d > 0;
  if (direction === "higher_is_better") return up ? "good" : "bad";
  return up ? "bad" : "good";
}
