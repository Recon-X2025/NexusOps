"use client";

/**
 * Developer & Ops primary visual.
 *
 * DORA-style 4-tile deck (deploy frequency, deploy success, lead time
 * proxy, change failure proxy) backed by sparklines.
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue } from "./shared";
import { Sparkline } from "@/components/charts";
import { cn } from "@/lib/utils";

export function DevopsPrimary({ payload, granularity }: HubPrimaryProps) {
  const deploys = findMetric(payload, "devops.deploys_production_30d");
  const success = findMetric(payload, "devops.deploy_success_rate");

  const deploySeries = deploys?.series ?? [];
  const successSeries = success?.series ?? [];
  const failureSeries = successSeries.map((p) => ({ t: p.t, v: Math.max(0, 100 - p.v) }));

  const tiles = [
    {
      key: "freq",
      label: "Deploy Frequency",
      hint: "Deploys per period",
      value: formatValue(deploys?.current, deploys?.unit, deploys?.state),
      state: deploys?.state,
      series: deploySeries.map((p) => p.v),
      color: "#0ea5e9",
      bg: "bg-sky-50/50 border-sky-100",
    },
    {
      key: "success",
      label: "Change Success Rate",
      hint: "% successful changes",
      value: formatValue(success?.current, success?.unit ?? "percent", success?.state),
      state: success?.state,
      series: successSeries.map((p) => p.v),
      color: "#10b981",
      bg: "bg-emerald-50/50 border-emerald-100",
    },
    {
      key: "cfr",
      label: "Change Failure Rate",
      hint: "Derived (100% - success)",
      value:
        success && success.current != null && success.state !== "no_data"
          ? `${Math.max(0, 100 - success.current).toFixed(1)}%`
          : "—",
      state: success?.state === "stressed" ? "watch" : success?.state,
      series: failureSeries.map((p) => p.v),
      color: "#ef4444",
      bg: "bg-rose-50/50 border-rose-100",
    },
    {
      key: "leadtime",
      label: "Lead Time Proxy",
      hint: "Deploys per period",
      value: formatValue(deploys?.current, deploys?.unit, deploys?.state),
      state: deploys?.state,
      series: deploySeries.map((p) => p.v),
      color: "#8b5cf6",
      bg: "bg-violet-50/50 border-violet-100",
    },
  ] as const;

  const haveAny = deploySeries.length > 0 || successSeries.length > 0;

  return (
    <HubPrimaryCard
      title="DevOps Status"
      subtitle={`Core operational indicators · deployment velocity & stability · ${granularity}-on-${granularity}`}
      accent="from-cyan-500 to-teal-400"
    >
      {haveAny ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <div
              key={t.key}
              className={cn(
                "rounded-2xl border p-4 flex flex-col gap-2 shadow-sm transition-shadow hover:shadow-md",
                t.bg
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  t.state === "healthy" ? "bg-emerald-500" :
                    t.state === "watch" ? "bg-amber-400" :
                      t.state === "stressed" ? "bg-rose-500" : "bg-slate-300"
                )} />
                <span className="text-[10px] uppercase tracking-widest font-black text-slate-500">
                  {t.label}
                </span>
              </div>
              <div className="text-3xl font-black tabular-nums text-slate-900 leading-none">{t.value}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{t.hint}</div>
              {t.series.length > 1 ? (
                <div className="mt-2 pt-2 border-t border-white/40">
                  <Sparkline data={t.series} color={t.color} height={40} width={180} />
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-slate-400 italic">No series data</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <HubEmptyState message="DevOps metrics unavailable." />
      )}

    </HubPrimaryCard>
  );
}
