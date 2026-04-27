"use client";

/**
 * Signal-mix donut — health state distribution across all heatmap cells.
 */

import { DonutChart } from "@/components/charts";
import { heatmapPostureMix } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const STATE_COLORS: Record<string, string> = {
  Healthy: "#10b981",
  Watch: "#f59e0b",
  Stressed: "#f43f5e",
  "No data": "#94a3b8",
};

export function CommandCenterSidebarCharts({ payload }: { payload: Payload }) {
  const postureMix = heatmapPostureMix(payload);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden flex flex-col h-full">
      <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
      <div className="px-4 pt-4 pb-1 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">Signal Mix</h3>
          <p className="text-xs text-slate-500 mt-0.5">Heatmap cells by health state</p>
        </div>
      </div>
      <div className="px-2 pb-3 flex-1 min-h-[220px]">
        {postureMix.length > 0 ? (
          <DonutChart
            data={postureMix}
            height={220}
            innerRadius={56}
            outerRadius={80}
            legend
            centreValue={`${Math.round(payload.score)}`}
            centreLabel="Score"
          />
        ) : (
          <p className="text-xs text-slate-400 text-center py-12">No distribution data</p>
        )}
      </div>
      {/* Pill legend */}
      {postureMix.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-1.5">
          {postureMix.map((item) => (
            <span
              key={item.name}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border"
              style={{
                background: `${STATE_COLORS[item.name] ?? "#94a3b8"}18`,
                borderColor: `${STATE_COLORS[item.name] ?? "#94a3b8"}40`,
                color: STATE_COLORS[item.name] ?? "#64748b",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STATE_COLORS[item.name] ?? "#94a3b8" }}
              />
              {item.name} · {item.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
