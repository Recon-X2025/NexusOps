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
  { state: "healthy" as const, label: "Healthy", swatch: "#bbf7d0" },
  { state: "watch" as const, label: "Watch", swatch: "#fde68a" },
  { state: "stressed" as const, label: "Stressed", swatch: "#fecaca" },
  { state: "no_data" as const, label: "No data", swatch: "#e2e8f0" },
];

export function CommandCenterHeatmap({ payload }: { payload: Payload }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] border-t-indigo-600 h-full">
      <div className="p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800 tracking-tight">Functional heatmap</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Cross-functional health by area — darker risk, greener health. Click linked cells to drill into modules.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGEND.map(({ state, label, swatch }) => (
              <div key={state} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="h-3 w-3 rounded-sm border border-slate-200 shadow-sm" style={{ background: swatch }} aria-hidden />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2">
          <div className="grid gap-1.5 min-w-[640px]" style={{ gridTemplateColumns: `152px repeat(${DIMS.length}, minmax(0,1fr))` }}>
            <div />
            {DIMS.map((d) => (
              <div
                key={d}
                className="text-[10px] font-bold text-center text-slate-600 uppercase tracking-wide py-2.5 bg-white rounded-md border border-slate-100 shadow-sm"
              >
                {DIM_LABEL[d]}
              </div>
            ))}
            {payload.heatmap.map((row) => (
              <div key={row.function} className="contents">
                <div
                  className={`text-xs font-semibold py-2.5 px-2 flex items-center rounded-md border ${
                    row.inScope
                      ? "text-slate-800 bg-white border-slate-100 shadow-sm"
                      : "text-slate-400 bg-transparent border-transparent"
                  }`}
                >
                  {row.function.replace("_", " ")}
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
