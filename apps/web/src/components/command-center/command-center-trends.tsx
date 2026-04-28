"use client";

import { TrendCard } from "./primitives/trend-card";
import { AreaChart } from "@/components/charts";
import { buildTrendLinesData } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const LINE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"];

export function CommandCenterTrends({ payload }: { payload: Payload }) {
  const { data, lines } = buildTrendLinesData(payload, 4);
  const areas = lines.map((l) => ({
    key: l.key,
    label: l.label,
    color: l.color,
    valueDataKey: l.valueDataKey,
    formatValue: l.formatValue,
  }));

  return (
    <div className="bg-white border border-slate-200 overflow-hidden h-full shadow-sm">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Performance Trends</h2>
      </div>
      <div className="p-2 min-h-[160px]">
        {data.length > 0 && areas.length > 0 ? (
          <AreaChart
            data={data}
            xKey="x"
            areas={areas}
            height={140}
            grid
            stacked={false}
            legend={false}
            yFormatter={(v) => `${Math.round(v)}%`}
          />
        ) : (
          <p className="text-[10px] text-slate-400 text-center py-8">No trend data</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 justify-center">
          {lines.slice(0, 3).map((l, i) => (
            <div key={l.key} className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
              <span className="text-[9px] text-slate-500 font-medium">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
