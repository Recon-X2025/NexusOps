"use client";

import { MicroSparkline } from "./primitives/micro-sparkline";
import { cn } from "@/lib/utils";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const CHART_COLORS = ["#3b82f6", "#0891b2", "#7c3aed", "#ea580c", "#db2777"];
const TILE_TINTS = [
  "bg-blue-50/60 hover:bg-blue-50",
  "bg-cyan-50/60 hover:bg-cyan-50",
  "bg-violet-50/60 hover:bg-violet-50",
  "bg-orange-50/60 hover:bg-orange-50",
  "bg-pink-50/60 hover:bg-pink-50",
];

function pctChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || Number.isNaN(previous) || Math.abs(previous) < 1e-9) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function DeltaBadge({ pct, good }: { pct: number | null; good: boolean | null }) {
  if (pct == null || good === null) return <span className="text-[11px] text-slate-400">—</span>;
  const up = pct >= 0;
  const looksGood = up === good;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
        looksGood
          ? "bg-emerald-100 text-emerald-700"
          : "bg-rose-100 text-rose-700",
      )}
    >
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Circular SVG ring progress for the score tile */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0 -mr-1" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ / 4}
        className="transition-all duration-700"
      />
    </svg>
  );
}

export function CommandCenterKpiStrip({ payload }: { payload: Payload }) {
  const trends = payload.trends.filter((t) => t.state !== "no_data").slice(0, 4);
  const trendIds = new Set(trends.map((t) => t.metricId));
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
      tint: TILE_TINTS[i % TILE_TINTS.length]!,
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
    tint: TILE_TINTS[(trendKpis.length + i) % TILE_TINTS.length]!,
  }));

  const scoreColor = "#0f766e";
  const scoreState = payload.scoreState.replace("_", " ");

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {/* Score tile */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 p-4 flex flex-col justify-between min-h-[128px] hover:shadow-lg transition-shadow">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Health Score</div>
        <div className="flex items-center justify-between gap-1 mt-1">
          <div>
            <span className="text-3xl font-black tabular-nums text-slate-900 tracking-tight leading-none">
              {Math.round(payload.score)}
            </span>
            <span className="text-sm font-semibold text-slate-400 ml-0.5">/100</span>
            <div className="text-[11px] text-slate-500 capitalize mt-1 font-medium">{scoreState}</div>
          </div>
          <ScoreRing score={payload.score} color={scoreColor} />
        </div>
      </div>

      {/* Metric tiles */}
      {[...trendKpis, ...bulletKpis].slice(0, 5).map((k) => (
        <div
          key={k.rowKey}
          className={cn(
            "rounded-2xl border border-slate-200/80 shadow-md ring-1 ring-slate-100 p-4 flex flex-col justify-between min-h-[128px] hover:shadow-lg transition-shadow",
            k.tint,
          )}
        >
          <div className="text-[10px] font-bold text-slate-500 line-clamp-2 leading-tight uppercase tracking-wider">
            {k.label}
          </div>
          <div className="flex items-end justify-between gap-2 mt-2">
            <div>
              <div className="text-3xl font-black tabular-nums text-slate-900 leading-none">{k.display}</div>
              <div className="mt-1.5">
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
