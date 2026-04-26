"use client";

/**
 * Customer & Sales primary visual.
 *
 * Two stacked panels: pipeline-coverage + ARR run-rate as the headline
 * trend, plus a churn / CSAT health strip. The mental model is
 * "growth pipe + health pulse".
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, mergeSeries } from "./shared";
import { AreaChart } from "@/components/charts";

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

  return (
    <HubPrimaryCard
      title="Revenue motion & customer health"
      subtitle={`ARR vs pipeline (${granularity}-on-${granularity}) · churn + CSAT pulse`}
      accent="border-t-amber-600"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 min-w-0">
          {rows.length > 1 ? (
            <AreaChart
              data={rows}
              xKey="x"
              areas={[
                { key: "arr", label: "ARR run-rate", color: "#d97706" },
                { key: "pipeline", label: "Pipeline coverage", color: "#0891b2" },
              ]}
              height={220}
              grid
              legend
            />
          ) : (
            <HubEmptyState message="Revenue series unavailable — ARR / pipeline have not resolved for this range." />
          )}
        </div>
        <div className="lg:col-span-4 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-3 lg:pt-0 lg:pl-4 flex flex-col gap-2.5">
          <HealthTile
            label="ARR run-rate"
            value={formatValue(arr?.current, arr?.unit, arr?.state)}
            target={arr?.target != null ? formatValue(arr.target, arr.unit) : undefined}
            state={arr?.state}
          />
          <HealthTile
            label="Pipeline coverage"
            value={formatValue(pipeline?.current, pipeline?.unit, pipeline?.state)}
            target={pipeline?.target != null ? formatValue(pipeline.target, pipeline.unit) : undefined}
            state={pipeline?.state}
          />
          <HealthTile
            label="Churn (30d)"
            value={formatValue(churn?.current, churn?.unit ?? "percent", churn?.state)}
            state={churn?.state}
          />
          <HealthTile
            label="CSAT"
            value={formatValue(csat?.current, csat?.unit, csat?.state)}
            state={csat?.state}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}

function HealthTile({
  label,
  value,
  target,
  state,
}: {
  label: string;
  value: string;
  target?: string;
  state?: "healthy" | "watch" | "stressed" | "no_data";
}) {
  const ring: Record<string, string> = {
    healthy: "ring-emerald-200 dark:ring-emerald-900",
    watch: "ring-amber-200 dark:ring-amber-900",
    stressed: "ring-rose-200 dark:ring-rose-900",
    no_data: "ring-slate-200 dark:ring-slate-700",
  };
  return (
    <div className={`rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-3 py-2 ring-1 ${state ? ring[state] : ring.no_data}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-tight">{value}</div>
      {target ? <div className="text-[11px] text-slate-500 dark:text-slate-400">target {target}</div> : null}
    </div>
  );
}
