"use client";

/**
 * Signal-mix donut. Previously also rendered a "Metric trends" line chart
 * but that was a duplicate of the canonical "Trend deck" panel
 * (`command-center-trends.tsx`) — both pulled from
 * `buildTrendLinesData(payload, 4)`. The duplicate has been removed; Trend
 * Deck is the single source of truth for trend visualization.
 */

import { DonutChart } from "@/components/charts";
import { heatmapPostureMix } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterSidebarCharts({ payload }: { payload: Payload }) {
  const postureMix = heatmapPostureMix(payload);

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden flex flex-col h-full border-t-[3px] border-t-blue-600">
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-sm font-semibold text-slate-800">Signal mix</h3>
        <p className="text-xs text-slate-500 mt-0.5">Heatmap cells by health state</p>
      </div>
      <div className="px-2 pb-3 flex-1 min-h-[220px]">
        {postureMix.length > 0 ? (
          <DonutChart
            data={postureMix}
            height={220}
            innerRadius={56}
            outerRadius={80}
            legend
            centreValue={`${payload.score}`}
            centreLabel="Score"
          />
        ) : (
          <p className="text-xs text-slate-400 text-center py-12">No distribution data</p>
        )}
      </div>
    </div>
  );
}
