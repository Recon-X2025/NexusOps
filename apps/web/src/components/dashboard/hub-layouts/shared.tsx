"use client";

/**
 * Shared primitives used by every hub layout: card wrapper, stat tiles,
 * empty-state, and helpers that pull metric series out of the hub
 * payload by id (without crashing when a metric isn't registered for
 * the hub).
 *
 * Keeping these here means each module-specific primary visual stays
 * focused on its composition (chart + tiles + lists) without
 * re-implementing the same lookup glue.
 */

import type { ReactNode } from "react";
import type { HubPayload } from "./types";
import { cn } from "@/lib/utils";
import { formatMetricValue, type FormatMetricOptions } from "@/lib/format-metric";

/** Wrapper card for any primary visual. */
export function HubPrimaryCard({
  title,
  subtitle,
  accent,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] dark:bg-slate-900/80 dark:border-slate-700",
        accent,
        className,
      )}
    >
      <header className="px-4 md:px-5 pt-4 pb-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        ) : null}
      </header>
      <div className="px-4 md:px-5 pb-4 md:pb-5">{children}</div>
    </section>
  );
}

export function HubStatTile({
  label,
  value,
  hint,
  state,
}: {
  label: string;
  value: string;
  hint?: string;
  state?: "healthy" | "watch" | "stressed" | "no_data";
}) {
  const stateBar: Record<string, string> = {
    healthy: "bg-emerald-500",
    watch: "bg-amber-500",
    stressed: "bg-rose-500",
    no_data: "bg-slate-300",
  };
  return (
    <div className="rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-2">
        {state ? <span className={cn("h-1.5 w-1.5 rounded-full", stateBar[state] ?? "bg-slate-300")} aria-hidden /> : null}
        <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 truncate">{label}</span>
      </div>
      <span className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-tight">{value}</span>
      {hint ? <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</span> : null}
    </div>
  );
}

export function HubEmptyState({ message }: { message: string }) {
  return (
    <div className="text-xs text-slate-400 dark:text-slate-500 text-center py-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
      {message}
    </div>
  );
}

/** Trend / bullet payload helpers, scoped to lookup-by-id. */
export function findTrend(payload: HubPayload, id: string) {
  return payload.trends.find((t) => t.metricId === id);
}
export function findBullet(payload: HubPayload, id: string) {
  return payload.bullets.find((b) => b.metricId === id);
}
export function findSeries(payload: HubPayload, id: string) {
  return payload.trends.find((t) => t.metricId === id)?.series ?? [];
}

/**
 * Combined lookup: returns a normalized "metric view" for a given id by
 * pulling whichever of trends/bullets has it. `target` only exists on
 * bullets; `series` only on trends. Layouts use the consolidated shape
 * to drive both stat tiles and inline charts without dispatching to
 * separate accessors at every callsite.
 */
export interface MetricView {
  current?: number;
  target?: number;
  unit?: string;
  state?: "healthy" | "watch" | "stressed" | "no_data";
  series: Array<{ t: string; v: number }>;
  label?: string;
}

export function findMetric(payload: HubPayload, id: string): MetricView | undefined {
  const t = findTrend(payload, id);
  const b = findBullet(payload, id);
  if (!t && !b) return undefined;
  return {
    current: t?.current ?? b?.current,
    target: b?.target,
    unit: (t?.unit ?? b?.unit) as string | undefined,
    state: t?.state ?? b?.state,
    series: t?.series ?? [],
    label: t?.label ?? b?.label,
  };
}

/**
 * Format a metric value for tile display, honouring unit hints. Delegates
 * to the canonical web-app formatter so currency renders ₹ and integers
 * carry the en-IN lakh/crore grouping (12,34,56,789) consistently.
 *
 * Tiles in primary visuals are usually narrow, so default to compact
 * notation (e.g. ₹5.77 Cr, 12.4K) — callers can pass `compact: false`
 * for full precision in wide tables.
 */
export function formatValue(
  value: number | undefined,
  unit?: string,
  state?: string,
  opts: FormatMetricOptions = { compact: true },
): string {
  return formatMetricValue(value, unit, state, opts);
}

/**
 * Convert a metric series into chart-friendly rows. Each row carries the
 * x label (formatted from `t`) and the metric value(s) keyed by `key`.
 * Honours the active granularity for nicer X labels.
 */
export function seriesToRows(
  series: Array<{ t: string; v: number }>,
  key: string,
  granularity: "day" | "week" | "month",
): Array<Record<string, string | number>> {
  return series.map((p) => ({
    x: formatBucketLabel(p.t, granularity),
    [key]: p.v,
    [`${key}__raw`]: p.v,
  }));
}

/** Merge two series into shared rows by bucket. Keys are independent. */
export function mergeSeries(
  a: Array<{ t: string; v: number }>,
  aKey: string,
  b: Array<{ t: string; v: number }>,
  bKey: string,
  granularity: "day" | "week" | "month",
): Array<Record<string, string | number>> {
  const idx = new Map<string, Record<string, string | number>>();
  for (const p of a) {
    const x = formatBucketLabel(p.t, granularity);
    idx.set(p.t, { x, [aKey]: p.v });
  }
  for (const p of b) {
    const cur = idx.get(p.t);
    if (cur) cur[bKey] = p.v;
    else {
      idx.set(p.t, { x: formatBucketLabel(p.t, granularity), [bKey]: p.v });
    }
  }
  return [...idx.values()];
}

function formatBucketLabel(iso: string, granularity: "day" | "week" | "month"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (granularity === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (granularity === "week") {
    return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
