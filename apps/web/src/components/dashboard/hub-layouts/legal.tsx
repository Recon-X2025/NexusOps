"use client";

/**
 * Legal & Governance primary visual.
 *
 * Compliance month grid on the left ("what's coming up?"), open-matters
 * trend on the right. The grid cells are derived from the range bucket
 * labels so it adapts to the chosen period: year/qtr show monthly
 * cells; a single month shows weekly cells.
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue } from "./shared";
import { LineChart } from "@/components/charts";
import { cn } from "@/lib/utils";

export function LegalPrimary({ payload, granularity }: HubPrimaryProps) {
  const matters = findMetric(payload, "legal.open_matters");

  const series = matters?.series ?? [];
  const trendRows = series.length > 1
    ? series.map((p) => ({
        x: new Date(p.t).toLocaleDateString("en-US", {
          month: "short",
          ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
        }),
        matters: p.v,
      }))
    : [];

  // Compliance grid driven by the metric's own buckets — gives an
  // honest "obligations through this period" picture even when no
  // explicit obligation calendar is wired. Each cell shows the bucket
  // label and the mattes count for that bucket.
  const cells = series.length > 0
    ? series.map((p) => ({
        label: new Date(p.t).toLocaleDateString("en-US", {
          month: "short",
          ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
        }),
        value: p.v,
      }))
    : [];
  const cellPeak = cells.length > 0 ? Math.max(...cells.map((c) => c.value), 1) : 1;

  return (
    <HubPrimaryCard
      title="Compliance calendar & matters"
      subtitle={`Obligation density per ${granularity} · open-matters trend`}
      accent="border-t-violet-600"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 min-w-0">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Obligation density grid
          </p>
          {cells.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {cells.map((c, i) => {
                const intensity = Math.max(0.18, c.value / cellPeak);
                return (
                  <div
                    key={`${c.label}-${i}`}
                    className={cn(
                      "rounded-md border border-violet-200/70 dark:border-violet-900/60 px-2 py-2.5 flex flex-col items-center gap-0.5",
                    )}
                    style={{ background: `rgba(124, 58, 237, ${intensity * 0.35})` }}
                    title={`${c.label}: ${c.value}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      {c.label}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {Math.round(c.value)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <HubEmptyState message="No obligation cadence available for this range." />
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
            Cell intensity scales with open-matters count for that bucket.
          </p>
        </div>
        <div className="lg:col-span-5 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-3 lg:pt-0 lg:pl-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Open matters trend
          </p>
          {trendRows.length > 1 ? (
            <LineChart
              data={trendRows}
              xKey="x"
              lines={[{ key: "matters", label: "Open matters", color: "#7c3aed" }]}
              height={180}
              grid
            />
          ) : (
            <HubEmptyState message="Open-matters series unavailable." />
          )}
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-700 px-3 py-2 mt-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
              Currently open
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
              {formatValue(matters?.current, matters?.unit, matters?.state)}
            </div>
            {matters?.target != null ? (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                target {formatValue(matters.target, matters.unit)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
