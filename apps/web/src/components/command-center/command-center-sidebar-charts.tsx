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
    <div className="bg-white border border-slate-200 overflow-hidden flex flex-col h-full shadow-sm">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50">
        <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Signal Mix</h3>
      </div>
      <div className="p-2 flex-1 flex flex-col items-center justify-center min-h-[160px]">
        {postureMix.length > 0 ? (
          <div className="w-full flex items-center gap-4">
            <div className="w-1/2">
              <DonutChart
                data={postureMix}
                height={140}
                innerRadius={36}
                outerRadius={50}
                centreValue={`${Math.round(payload.score)}`}
                centreLabel="Avg"
              />
            </div>
            <div className="w-1/2 space-y-1">
              {postureMix.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_COLORS[item.name] }} />
                    <span className="text-slate-500 font-medium">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-700">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-400 text-center">No data</p>
        )}
      </div>
    </div>
  );
}
