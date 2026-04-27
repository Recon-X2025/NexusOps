"use client";

import { HeatmapCell } from "./primitives/heatmap-cell";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

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
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden h-full">
      {/* Gradient accent band */}
      <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 to-violet-500" />
      <div className="p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Functional Heatmap</h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              Cross-functional health by area. Click linked cells to drill into modules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {LEGEND.map(({ state, label, cls }) => (
              <span
                key={state}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${cls}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/60 p-2">
          <div
            className="grid gap-1.5 min-w-[640px]"
            style={{ gridTemplateColumns: `160px repeat(${DIMS.length}, minmax(0,1fr))` }}
          >
            {/* Header */}
            <div />
            {DIMS.map((d) => (
              <div
                key={d}
                className="text-[10px] font-bold text-center text-slate-600 uppercase tracking-widest py-2.5 bg-white rounded-lg border border-slate-200/80 shadow-sm"
              >
                {DIM_LABEL[d]}
              </div>
            ))}

            {/* Rows */}
            {payload.heatmap.map((row) => (
              <div key={row.function} className="contents">
                <div
                  className={`text-xs font-bold py-2.5 px-3 flex items-center rounded-lg border ${row.inScope
                      ? "text-slate-800 bg-white border-slate-200/80 shadow-sm"
                      : "text-slate-400 bg-transparent border-transparent"
                    }`}
                >
                  <span className="capitalize">{row.function.replace(/_/g, " ")}</span>
                </div>
                {DIMS.map((d) => {
                  const cell = row.cells[d];
                  const aria = `${row.function} ${DIM_LABEL[d]}: ${cell.state.replace("_", " ")}${cell.drillUrl ? ", drill-down available" : ""}`;
                  return (
                    <HeatmapCell
                      key={d}
                      label={cell.label}
                      state={cell.state}
                      display={formatMetricValue(cell.value ?? undefined, cell.unit, cell.state, { compact: true })}
                      href={row.inScope ? cell.drillUrl : undefined}
                      ariaLabel={aria}
                    />
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
