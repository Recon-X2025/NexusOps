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
  const trends = payload.trends.filter((t) => t.state !== "no_data").slice(0, 5);
  
  const scoreColor = "#059669"; // Emerald 600

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
      {/* Score tile */}
      <div className="bg-white border border-slate-200 p-2 flex flex-col justify-between hover:bg-slate-50 transition-colors shadow-sm">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Health Score</div>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-xl font-bold tabular-nums text-slate-800">
            {Math.round(payload.score)}
          </span>
          <span className="text-[10px] font-medium text-slate-400">/100</span>
        </div>
        <div className="h-1 w-full bg-slate-100 mt-2 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${payload.score}%` }} />
        </div>
      </div>

      {/* Metric tiles */}
      {trends.map((t, i) => {
        const prev = t.previous;
        const pct = pctChange(t.current, prev);
        let good: boolean | null = null;
        if (prev != null && pct != null) {
          const up = t.current > prev;
          good = t.direction === "higher_is_better" ? up : !up;
        }
        
        return (
          <div
            key={t.metricId}
            className="bg-white border border-slate-200 p-2 flex flex-col justify-between hover:bg-slate-50 transition-colors shadow-sm"
          >
            <div className="text-[9px] font-bold text-slate-500 line-clamp-1 uppercase tracking-tight">
              {t.label}
            </div>
            <div className="flex items-baseline justify-between gap-1 mt-1">
              <div className="text-xl font-bold tabular-nums text-slate-800">
                {formatMetricValue(t.current, t.unit, t.state, { compact: true })}
              </div>
              <DeltaBadge pct={pct} good={good} />
            </div>
            <div className="mt-2 h-4 w-full">
              <MicroSparkline values={t.series.map(p => p.v)} color={good ? "#10b981" : "#f43f5e"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
