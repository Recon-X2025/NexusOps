"use client";

import { HeatmapCell } from "./primitives/heatmap-cell";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const DIMS = ["volume", "sla", "risk", "trend"] as const;

const DIM_LABEL: Record<(typeof DIMS)[number], string> = {
  volume: "Volume",
  sla: "SLA",
  risk: "Risk",
  trend: "Trend",
};

const LEGEND = [
  { state: "healthy" as const, label: "Healthy", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { state: "watch" as const, label: "Watch", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { state: "stressed" as const, label: "Stressed", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  { state: "no_data" as const, label: "No data", cls: "bg-slate-100 text-slate-500 border-slate-200" },
];

export function CommandCenterHeatmap({ payload }: { payload: Payload }) {
  return (
    <div className="bg-white border border-slate-200 overflow-hidden h-full shadow-sm flex flex-col">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Functional Posture</h2>
        </div>
        <div className="flex gap-2">
          {LEGEND.map(({ state, label, cls }) => (
            <div key={state} className="flex items-center gap-1">
              <div className={cn("w-2 h-2 rounded-full border", cls.split(" ")[0])} />
              <span className="text-[9px] text-slate-500 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 flex-1">
        <div className="overflow-x-auto">
          <div
            className="grid gap-px bg-slate-200 border border-slate-200"
            style={{ gridTemplateColumns: `120px repeat(${DIMS.length}, minmax(0,1fr))` }}
          >
            {/* Header */}
            <div className="bg-slate-50/80" />
            {DIMS.map((d) => (
              <div
                key={d}
                className="text-[9px] font-bold text-center text-slate-500 uppercase tracking-tight py-1 bg-slate-50/80"
              >
                {DIM_LABEL[d]}
              </div>
            ))}

            {/* Rows */}
            {payload.heatmap.map((row) => (
              <div key={row.function} className="contents">
                <div className="text-[10px] font-bold py-1.5 px-2 bg-white flex items-center text-slate-600 border-r border-slate-200">
                  <span className="capitalize truncate">{row.function.replace(/_/g, " ")}</span>
                </div>
                {DIMS.map((d) => {
                  const cell = row.cells[d];
                  return (
                    <div key={d} className="bg-white p-0.5">
                      <HeatmapCell
                        label={cell.label}
                        state={cell.state}
                        display={formatMetricValue(cell.value ?? undefined, cell.unit, cell.state, { compact: true })}
                        href={row.inScope ? cell.drillUrl : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
