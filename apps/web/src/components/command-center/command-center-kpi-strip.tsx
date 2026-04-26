"use client";

import { MicroSparkline } from "./primitives/micro-sparkline";
import { cn } from "@/lib/utils";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const CHART_COLORS = ["#2563eb", "#0891b2", "#7c3aed", "#ea580c", "#db2777"];

function pctChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || Number.isNaN(previous) || Math.abs(previous) < 1e-9) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function DeltaBadge({
  pct,
  good,
}: {
  pct: number | null;
  good: boolean | null;
}) {
  if (pct == null || good === null) return <span className="text-[11px] text-slate-400">—</span>;
  const up = pct >= 0;
  const positiveIsGood = good;
  const looksGood = up === positiveIsGood;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
        looksGood ? "text-emerald-600" : "text-rose-600",
      )}
    >
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function CommandCenterKpiStrip({ payload }: { payload: Payload }) {
  const trends = payload.trends.filter((t) => t.state !== "no_data").slice(0, 4);
  const trendIds = new Set(trends.map((t) => t.metricId));
  /** Same metric id can be both trend + bullet (e.g. crm.pipeline_coverage) — only show once in the strip. */
  const bullets = payload.bullets
    .filter((b) => b.state !== "no_data" && !trendIds.has(b.metricId))
    .slice(0, 2);

  const trendKpis = trends.map((t, i) => {
    const prev = t.previous;
    const pct = pctChange(t.current, prev);
    let good: boolean | null = null;
    if (prev != null && pct != null) {
      const up = t.current > prev;
      good = t.direction === "higher_is_better" ? up : !up;
    }
    const vals = t.series.map((p) => p.v);
    return {
      rowKey: `trend:${t.metricId}`,
      label: t.label.length > 28 ? `${t.label.slice(0, 26)}…` : t.label,
      display: formatMetricValue(t.current, t.unit, t.state, { compact: true }),
      pct,
      good,
      spark: vals,
      color: CHART_COLORS[i % CHART_COLORS.length]!,
    };
  });

  const bulletKpis = bullets.map((b, i) => ({
    rowKey: `bullet:${b.metricId}`,
    label: b.label.length > 28 ? `${b.label.slice(0, 26)}…` : b.label,
    display: formatMetricValue(b.current, b.unit, b.state, { compact: true }),
    pct: null as number | null,
    good: null as boolean | null,
    spark: [b.current * 0.92, b.current * 0.97, b.current * 0.95, b.current],
    color: CHART_COLORS[(trendKpis.length + i) % CHART_COLORS.length]!,
  }));

  const scoreKpi = {
    key: "score",
    label: "Composite health",
    value: payload.score,
    suffix: "/100",
    sub: payload.scoreState.replace("_", " "),
    spark: [payload.score * 0.88, payload.score * 0.92, payload.score * 0.95, payload.score],
    color: "#0f766e",
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between min-h-[108px]">
        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{scoreKpi.label}</div>
        <div className="flex items-end justify-between gap-2 mt-1">
          <div>
            <span className="text-2xl font-bold tabular-nums text-slate-900 tracking-tight">
              {Math.round(scoreKpi.value)}
            </span>
            <span className="text-sm font-medium text-slate-400">{scoreKpi.suffix}</span>
            <div className="text-[11px] text-slate-500 capitalize mt-0.5">{scoreKpi.sub}</div>
          </div>
          <MicroSparkline values={scoreKpi.spark} color={scoreKpi.color} />
        </div>
      </div>
      {[...trendKpis, ...bulletKpis].slice(0, 5).map((k) => (
        <div
          key={k.rowKey}
          className="rounded-xl bg-white border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between min-h-[108px]"
        >
          <div className="text-[11px] font-medium text-slate-500 line-clamp-2 leading-tight">{k.label}</div>
          <div className="flex items-end justify-between gap-2 mt-2">
            <div>
              <div className="text-xl font-bold tabular-nums text-slate-900">{k.display}</div>
              <div className="mt-0.5">
                <DeltaBadge pct={k.pct} good={k.good} />
              </div>
            </div>
            <MicroSparkline values={k.spark} color={k.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
