"use client";

/**
 * Strategy & Projects primary visual.
 *
 * Two-pane: a 2x2 portfolio matrix (size x health, derived from the
 * hub's bullets) on the left, and OKR progress bars on the right
 * driven by `strategy.okr_progress_avg` plus the top bullets as
 * sub-OKR proxies.
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue } from "./shared";
import { cn } from "@/lib/utils";

const QUADRANTS = [
  { key: "high_size_low_health", label: "Big · at risk", className: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900" },
  { key: "high_size_high_health", label: "Big · healthy", className: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900" },
  { key: "low_size_low_health", label: "Small · at risk", className: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900" },
  { key: "low_size_high_health", label: "Small · healthy", className: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900" },
] as const;

export function StrategyPrimary({ payload, granularity }: HubPrimaryProps) {
  const okr = findMetric(payload, "strategy.okr_progress_avg");

  // Bucket bullets into the 2x2 by current value (size proxy) + state
  // (health proxy). With ≤5 bullets per hub the bucket sizes are small,
  // but that's fine — this is a portfolio shape view, not a packed list.
  const bullets = payload.bullets;
  const sizeMedian = bullets.length > 0
    ? [...bullets].map((b) => Math.abs(b.current ?? 0)).sort((a, b) => a - b)[Math.floor(bullets.length / 2)]!
    : 0;
  const isHighSize = (v: number) => Math.abs(v ?? 0) >= sizeMedian;
  const isHealthy = (s: string) => s === "healthy";
  const grouped = {
    high_size_low_health: bullets.filter((b) => isHighSize(b.current) && !isHealthy(b.state)),
    high_size_high_health: bullets.filter((b) => isHighSize(b.current) && isHealthy(b.state)),
    low_size_low_health: bullets.filter((b) => !isHighSize(b.current) && !isHealthy(b.state)),
    low_size_high_health: bullets.filter((b) => !isHighSize(b.current) && isHealthy(b.state)),
  } as const;

  const okrPct =
    okr && okr.current != null && okr.state !== "no_data" ? Math.round(okr.current) : null;
  const okrTarget = okr?.target != null ? Math.round(okr.target) : 100;

  return (
    <HubPrimaryCard
      title="Portfolio shape & OKR progress"
      subtitle={`2x2 size × health from hub metrics · OKR progress (${granularity}-on-${granularity})`}
      accent="border-t-blue-700"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 min-w-0">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Portfolio matrix
          </p>
          {bullets.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {QUADRANTS.map((q) => {
                const items = grouped[q.key];
                return (
                  <div
                    key={q.key}
                    className={cn("rounded-lg border px-3 py-2.5 min-h-[110px] flex flex-col gap-1", q.className)}
                  >
                    <div className="text-[10px] uppercase tracking-wide font-bold text-slate-700 dark:text-slate-200">
                      {q.label}
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{items.length}</div>
                    <ul className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug list-disc list-inside truncate">
                      {items.slice(0, 3).map((b) => (
                        <li key={b.metricId} className="truncate">
                          {b.label}
                        </li>
                      ))}
                      {items.length > 3 ? <li className="opacity-70">+{items.length - 3} more</li> : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <HubEmptyState message="No portfolio metrics resolved for this hub." />
          )}
        </div>
        <div className="lg:col-span-5 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-3 lg:pt-0 lg:pl-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-1">
            OKR progress
          </p>
          <div className="rounded-lg border border-slate-200/80 dark:border-slate-700 px-3 py-3 bg-slate-50/60 dark:bg-slate-900/40">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Average progress</span>
              <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {okrPct != null ? `${okrPct}%` : "—"}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500"
                style={{ width: `${okrPct != null ? Math.min(100, okrPct) : 0}%` }}
                role="presentation"
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              target {okrTarget}% &nbsp;·&nbsp; current&nbsp;
              {formatValue(okr?.current, okr?.unit ?? "percent", okr?.state)}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
              Sub-objectives (top metrics)
            </p>
            {bullets.slice(0, 4).map((b) => {
              const t = b.target ?? 0;
              const pct =
                t > 0
                  ? Math.min(100, Math.max(0, Math.round((b.current / t) * 100)))
                  : Math.min(100, Math.max(0, Math.round(b.current)));
              return (
                <div key={b.metricId}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate mr-2">{b.label}</span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        b.state === "healthy"
                          ? "bg-emerald-500"
                          : b.state === "watch"
                          ? "bg-amber-500"
                          : b.state === "stressed"
                          ? "bg-rose-500"
                          : "bg-slate-300",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
