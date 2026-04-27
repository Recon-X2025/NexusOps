"use client";

import { BarChart } from "@/components/charts";
import { flowThroughputRecords } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterFlow({ payload }: { payload: Payload }) {
  const chartData = flowThroughputRecords(payload);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden h-full">
      <div className="h-[3px] w-full bg-gradient-to-r from-orange-400 to-amber-400" />
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Throughput</h2>
            <p className="text-xs text-slate-500 mt-0.5">Created vs resolved by function</p>
          </div>
          {/* Summary pills */}
          <div className="flex gap-1.5 flex-shrink-0">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Created
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Resolved
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 mt-3 min-h-[200px]">
          <BarChart
            data={chartData}
            xKey="name"
            bars={[
              { key: "Created", label: "Created", color: "#94a3b8" },
              { key: "Resolved", label: "Resolved", color: "#10b981" },
            ]}
            height={220}
            grid
            legend={false}
          />
        </div>
      </div>
    </div>
  );
}
