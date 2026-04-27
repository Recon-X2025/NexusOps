"use client";

/**
 * Customer & Sales primary visual.
 *
 * ARR by account health tier (bar chart grouped by tier) + NPS gauge semicircle dial
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, mergeSeries, HubStatTile } from "./shared";
import { AreaChart, BarChart } from "@/components/charts";
import { cn } from "@/lib/utils";

export function CustomerPrimary({ payload, granularity }: HubPrimaryProps) {
  const arr = findMetric(payload, "crm.arr_run_rate");
  const pipeline = findMetric(payload, "crm.pipeline_coverage");
  const churn = findMetric(payload, "csm.churn_rate_30d");
  const csat = findMetric(payload, "csm.csat_avg");

  const arrSeries = arr?.series ?? [];
  const pipelineSeries = pipeline?.series ?? [];

  const rows =
    arrSeries.length > 1 || pipelineSeries.length > 1
      ? mergeSeries(arrSeries, "arr", pipelineSeries, "pipeline", granularity)
      : [];

  // Mock data for ARR by health tier
  const healthTierData = [
    { tier: "Healthy", arr: 4.2 },
    { tier: "Watch", arr: 1.8 },
    { tier: "At Risk", arr: 0.6 },
  ];

  return (
    <HubPrimaryCard
      title="Growth & Retention"
      subtitle={`Revenue velocity and customer health pulse · ${granularity}-on-${granularity}`}
      accent="from-amber-500 to-yellow-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Revenue Velocity Chart */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Revenue Velocity (ARR vs Pipeline)</h3>
            {rows.length > 1 ? (
              <AreaChart
                data={rows}
                xKey="x"
                areas={[
                  { key: "arr", label: "ARR Run-rate", color: "#f59e0b" },
                  { key: "pipeline", label: "Pipeline Coverage", color: "#0ea5e9" },
                ]}
                height={220}
                grid
                legend
              />
            ) : (
              <HubEmptyState message="Revenue series unavailable." />
            )}
          </div>

          {/* ARR by Health Tier */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Portfolio Health (ARR in Cr)</h3>
            <BarChart
              data={healthTierData}
              xKey="tier"
              bars={[{ key: "arr", label: "ARR", color: "#f59e0b" }]}
              height={180}
              grid
            />
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer KPIs</h3>
          <HubStatTile
            label="ARR Run-rate"
            value={formatValue(arr?.current, arr?.unit, arr?.state)}
            state={arr?.state}
            hint={arr?.target != null ? `target ${formatValue(arr.target, arr.unit)}` : undefined}
          />
          <HubStatTile
            label="Churn (30d)"
            value={formatValue(churn?.current, churn?.unit ?? "percent", churn?.state)}
            state={churn?.state}
          />
          <HubStatTile
            label="CSAT Score"
            value={formatValue(csat?.current, csat?.unit, csat?.state)}
            state={csat?.state}
          />

          <div className="mt-4 p-5 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <div className="w-24 h-24 rounded-full border-8 border-white" />
            </div>
            <h4 className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest">NPS Pulse</h4>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black mb-1">72</span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Excellent</span>
              <div className="mt-4 w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '72%' }} />
              </div>
              <div className="mt-2 flex justify-between w-full text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                <span>-100</span>
                <span>0</span>
                <span>+100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
