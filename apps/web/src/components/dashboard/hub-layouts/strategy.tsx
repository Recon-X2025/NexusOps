"use client";

/**
 * Strategy & Projects primary visual.
 *
 * Portfolio bubble scatter: x=progress%, y=health score, bubble-size=budget, colored by status
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, findTrend, formatValue, HubStatTile } from "./shared";
import { ScatterChart, CHART_COLORS } from "@/components/charts";

export function StrategyPrimary({ payload, granularity }: HubPrimaryProps) {
  const okr = findMetric(payload, "strategy.okr_progress_avg");

  const okrPct = okr && okr.current != null && okr.state !== "no_data" ? Math.round(okr.current) : 0;

  // Portfolio matrix — one bubble per active objective, emitted as `scatter`
  // by the strategy.okr_progress_avg resolver (x=progress%, y=KR count).
  const okrTrend = findTrend(payload, "strategy.okr_progress_avg");
  const stateColor: Record<string, string> = {
    healthy: CHART_COLORS[3],
    watch: CHART_COLORS[4],
    stressed: CHART_COLORS[5],
  };
  const portfolioPoints = (okrTrend?.scatter ?? []).map((p) => ({
    label: p.label,
    x: p.x,
    y: p.y,
    size: p.size,
    color: stateColor[p.state ?? "healthy"] ?? CHART_COLORS[0],
  }));

  return (
    <HubPrimaryCard
      title="Strategy Status"
      subtitle={`Initiative progress vs health matrix · OKR velocity · ${granularity}-on-${granularity}`}
      accent="from-sky-500 to-blue-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Portfolio Scatter Matrix */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Portfolio Matrix (Progress vs Scope)</h3>
            {portfolioPoints.length > 0 ? (
              <ScatterChart
                data={portfolioPoints}
                xLabel="Progress %"
                yLabel="Key results"
                height={220}
                xFormatter={(v) => `${v}%`}
              />
            ) : (
              <HubEmptyState message="Project portfolio data unavailable." />
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Strategy KPIs</h3>
          <div className="p-5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl">
            <h4 className="text-[10px] font-bold text-blue-200 mb-4 uppercase tracking-widest">Overall OKR Velocity</h4>
            <div className="flex items-center justify-between">
              <div className="text-h1 font-black">{okrPct}%</div>
              <div className="h-12 w-12 rounded-full border-4 border-blue-400/30 border-t-white" />
            </div>
          </div>

          <HubStatTile
            label="Portfolio Health"
            value={formatValue(payload.score, "percent", payload.scoreState)}
            state={payload.scoreState as any}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}
