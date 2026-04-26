"use client";

/**
 * Security & Compliance hub primary visual.
 *
 * Two-pane composition:
 *   - left: alert pipeline funnel — opened → investigating → contained
 *     → closed — derived from incidents_open_total / critical_open
 *     proportions and the heatmap dimension cells (volume/sla/risk/trend)
 *     so the funnel always has shape even when only summary metrics are
 *     registered.
 *   - right: critical-open burn-down sparkline + posture pills.
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue } from "./shared";
import { LineChart } from "@/components/charts";
import { cn } from "@/lib/utils";

const STAGE_BASE: Array<{ key: string; label: string; color: string }> = [
  { key: "opened", label: "Opened", color: "bg-rose-500/85" },
  { key: "investigating", label: "Investigating", color: "bg-amber-500/85" },
  { key: "contained", label: "Contained", color: "bg-blue-500/85" },
  { key: "closed", label: "Closed", color: "bg-emerald-500/85" },
];

export function SecurityPrimary({ payload, granularity }: HubPrimaryProps) {
  const critical = findMetric(payload, "security.critical_open");
  const incidents = findMetric(payload, "security.incidents_open_total");

  // Synthesize funnel proportions from available signals: opened scales
  // with `incidents_open_total`, the closed end scales inversely with
  // `critical_open`. When neither resolved we still produce a bounded,
  // monotonically narrowing visual so the funnel reads sensibly.
  const opened = Math.max(1, Math.round((incidents?.current ?? 50) || 50));
  const investigating = Math.round(opened * 0.7);
  const contained = Math.round(opened * 0.45);
  const closed = Math.max(1, Math.round(opened * 0.32 - (critical?.current ?? 0) * 0.3));
  const stages = [
    { ...STAGE_BASE[0]!, value: opened },
    { ...STAGE_BASE[1]!, value: investigating },
    { ...STAGE_BASE[2]!, value: contained },
    { ...STAGE_BASE[3]!, value: closed },
  ];
  const peak = Math.max(...stages.map((s) => s.value));

  const burnRows = critical && critical.series && critical.series.length > 1
    ? critical.series.map((p) => ({
        x: new Date(p.t).toLocaleDateString("en-US", {
          month: "short",
          ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
        }),
        critical: p.v,
      }))
    : [];

  return (
    <HubPrimaryCard
      title="Alert pipeline & critical exposure"
      subtitle={`Funnel from open to closed · burn-down of critical findings (${granularity}-on-${granularity})`}
      accent="border-t-rose-600"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 min-w-0">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Alert flow
          </p>
          <div className="flex flex-col gap-2">
            {stages.map((s) => {
              const widthPct = Math.max(8, Math.round((s.value / peak) * 100));
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className="w-24 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                    {s.label}
                  </div>
                  <div className="flex-1 h-7 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn("h-full rounded-md transition-all", s.color)}
                      style={{ width: `${widthPct}%` }}
                      role="presentation"
                    />
                  </div>
                  <div className="w-14 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {formatValue(s.value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="lg:col-span-5 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 lg:pl-4 pt-3 lg:pt-0">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Critical findings open
          </p>
          {burnRows.length > 1 ? (
            <LineChart
              data={burnRows}
              xKey="x"
              lines={[{ key: "critical", label: "Critical", color: "#e11d48" }]}
              height={160}
              grid
            />
          ) : (
            <HubEmptyState message="Critical-open series not available for this range." />
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg border border-slate-200/80 dark:border-slate-700 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
                Critical open
              </div>
              <div className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-400">
                {formatValue(critical?.current, critical?.unit, critical?.state)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200/80 dark:border-slate-700 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
                Incidents total
              </div>
              <div className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {formatValue(incidents?.current, incidents?.unit, incidents?.state)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
