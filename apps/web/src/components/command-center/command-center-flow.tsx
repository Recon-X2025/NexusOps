"use client";

import { BarChart } from "@/components/charts";
import { flowThroughputRecords } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterFlow({ payload }: { payload: Payload }) {
  const chartData = flowThroughputRecords(payload);

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] border-t-orange-500 h-full">
      <div className="p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-800 tracking-tight">Throughput</h2>
        <p className="text-xs text-slate-500 mt-1">Created vs resolved by function</p>
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 mt-3 min-h-[200px]">
          <BarChart
            data={chartData}
            xKey="name"
            bars={[
              { key: "Created", label: "Created", color: "#64748b" },
              { key: "Resolved", label: "Resolved", color: "#059669" },
            ]}
            height={220}
            grid
            legend
          />
        </div>
      </div>
    </div>
  );
}
