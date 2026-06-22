"use client";

/**
 * Strategy & Projects primary visual.
 *
 * Portfolio bubble scatter: x=progress%, y=health score, bubble-size=budget, colored by status
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, HubStatTile } from "./shared";
import { cn } from "@/lib/utils";

export function StrategyPrimary({ payload, granularity }: HubPrimaryProps) {
  const okr = findMetric(payload, "strategy.okr_progress_avg");
  const bullets = payload.bullets;

  const okrPct = okr && okr.current != null && okr.state !== "no_data" ? Math.round(okr.current) : 0;

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
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Portfolio Matrix (Progress vs Health)</h3>
            <HubEmptyState message="Project portfolio data unavailable." />
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Strategy KPIs</h3>
          <div className="p-5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl">
            <h4 className="text-[10px] font-bold text-blue-200 mb-4 uppercase tracking-widest">Overall OKR Velocity</h4>
            <div className="flex items-center justify-between">
              <div className="text-4xl font-black">{okrPct}%</div>
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
