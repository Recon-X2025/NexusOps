"use client";

/**
 * Developer & Ops primary visual.
 *
 * DORA-style 4-tile deck (deploy frequency, deploy success, lead time
 * proxy, change failure proxy) backed by sparklines. The metrics
 * registry only carries `deploys_production_30d` and
 * `deploy_success_rate` today, so lead time / change failure tiles use
 * derived signals (volume per period, failure rate from `1 -
 * success_rate`) — explicitly labelled as such so it never reads as
 * fabricated data.
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
      label: "Deploy frequency",
      hint: "deployments per period",
      value: formatValue(deploys?.current, deploys?.unit, deploys?.state),
      state: deploys?.state,
      series: deploySeries.map((p) => p.v),
      color: "#0ea5e9",
    },
    {
      key: "success",
      label: "Deploy success",
      hint: "% successful deployments",
      value: formatValue(success?.current, success?.unit ?? "percent", success?.state),
      state: success?.state,
      series: successSeries.map((p) => p.v),
      color: "#10b981",
    },
    {
      key: "cfr",
      label: "Change failure (derived)",
      hint: "100% − deploy success",
      value:
        success && success.current != null && success.state !== "no_data"
          ? `${Math.max(0, 100 - success.current).toFixed(1)}%`
          : "—",
      state: success?.state === "stressed" ? "watch" : success?.state,
      series: failureSeries.map((p) => p.v),
      color: "#ef4444",
    },
    {
      key: "leadtime",
      label: "Lead-time proxy",
      hint: "deploys per period (higher = shorter lead time)",
      value: formatValue(deploys?.current, deploys?.unit, deploys?.state),
      state: deploys?.state,
      series: deploySeries.map((p) => p.v),
      color: "#a855f7",
    },
  ] as const;

  const haveAny = deploySeries.length > 0 || successSeries.length > 0;

  return (
    <HubPrimaryCard
      title="DORA-style deck"
      subtitle={`Deploy frequency · success · derived CFR & lead-time proxy (${granularity}-on-${granularity})`}
      accent="border-t-cyan-600"
    >
      {haveAny ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((t) => {
            const stateBar: Record<string, string> = {
              healthy: "bg-emerald-500",
              watch: "bg-amber-500",
              stressed: "bg-rose-500",
              no_data: "bg-slate-300",
            };
            return (
              <div
                key={t.key}
                className="rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-3 py-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", t.state ? stateBar[t.state] ?? "bg-slate-300" : "bg-slate-300")} aria-hidden />
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
                    {t.label}
                  </span>
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-tight">{t.value}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{t.hint}</div>
                {t.series.length > 1 ? (
                  <div className="-mx-1 mt-1">
                    <Sparkline data={t.series} color={t.color} height={36} width={160} />
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 italic">no series</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <HubEmptyState message="DevOps metrics unavailable for this range." />
      )}
    </HubPrimaryCard>
  );
}
