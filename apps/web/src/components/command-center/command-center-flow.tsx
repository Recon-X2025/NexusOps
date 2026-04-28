"use client";

import { BarChart } from "@/components/charts";
import { flowThroughputRecords } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterFlow({ payload }: { payload: Payload }) {
  const chartData = flowThroughputRecords(payload);

  return (
    <div className="bg-white border border-slate-200 overflow-hidden h-full shadow-sm">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Throughput</h2>
        <div className="flex gap-2">
           <div className="flex items-center gap-1">
             <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
             <span className="text-[9px] text-slate-500 font-medium">In</span>
           </div>
           <div className="flex items-center gap-1">
             <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
             <span className="text-[9px] text-slate-500 font-medium">Out</span>
           </div>
        </div>
      </div>
      <div className="p-2 min-h-[160px]">
        <BarChart
          data={chartData.slice(0, 5)}
          xKey="name"
          bars={[
            { key: "Created", label: "Created", color: "#94a3b8" },
            { key: "Resolved", label: "Resolved", color: "#10b981" },
          ]}
          height={140}
          grid
          legend={false}
        />
      </div>
    </div>
  );
}
