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
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden">
      <div className="h-[3px] w-full bg-gradient-to-r from-teal-500 to-emerald-400" />
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Trend Deck</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Each series scaled 0–100% so different units compare on one chart.
            </p>
          </div>
          {/* Inline legend pills */}
          <div className="flex flex-wrap gap-1.5 justify-end">
            {lines.slice(0, 4).map((l, i) => (
              <span
                key={l.key}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                style={{
                  background: `${LINE_COLORS[i % LINE_COLORS.length]}14`,
                  borderColor: `${LINE_COLORS[i % LINE_COLORS.length]}30`,
                  color: LINE_COLORS[i % LINE_COLORS.length],
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
                />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {data.length > 0 && areas.length > 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <AreaChart
              data={data}
              xKey="x"
              areas={areas}
              height={220}
              grid
              stacked={false}
              legend={false}
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
