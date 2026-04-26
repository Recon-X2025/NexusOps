"use client";

import { TrendCard } from "./primitives/trend-card";
import { AreaChart } from "@/components/charts";
import { buildTrendLinesData } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

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
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] border-t-teal-600">
      <div className="p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-800 tracking-tight">Trend deck</h2>
        <p className="text-xs text-slate-500 mt-1">
          Each series is scaled to its own 0–100% range so different units compare on one chart. Hover for
          actual values; KPI cards below show current period figures.
        </p>
        {data.length > 0 && areas.length > 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 mt-4">
            <AreaChart
              data={data}
              xKey="x"
              areas={areas}
              height={220}
              grid
              stacked={false}
              legend
              yFormatter={(v) => `${Math.round(v)}%`}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {payload.trends.map((t) => (
            <TrendCard key={t.metricId} t={t} href={t.drillUrl} />
          ))}
        </div>
      </div>
    </div>
  );
}
