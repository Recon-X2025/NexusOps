"use client";

/**
 * People & Workplace primary visual.
 *
 * Headcount trend (the canonical "is the org growing?" line) on the
 * left, hiring funnel on the right. Funnel stages are static — the
 * underlying recruiter pipeline metrics are workbench-only — but it
 * gives the People hub a visually distinct shape that's the right
 * mental model for the function (applied → screen → interview → offer
 * → hire).
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue } from "./shared";
import { LineChart } from "@/components/charts";
import { cn } from "@/lib/utils";

const FUNNEL_STAGES = [
  { key: "applied", label: "Applied", widthPct: 100, color: "bg-emerald-500/30 border-emerald-500/40" },
  { key: "screened", label: "Screened", widthPct: 78, color: "bg-emerald-500/45 border-emerald-500/60" },
  { key: "interviewed", label: "Interviewed", widthPct: 52, color: "bg-emerald-600/55 border-emerald-600/70" },
  { key: "offered", label: "Offered", widthPct: 28, color: "bg-emerald-600/70 border-emerald-700/80" },
  { key: "hired", label: "Hired", widthPct: 14, color: "bg-emerald-700/85 border-emerald-800" },
] as const;

export function PeoplePrimary({ payload, granularity }: HubPrimaryProps) {
  const headcount = findMetric(payload, "hr.headcount_actual_vs_plan");
  const headRows = headcount && headcount.series.length > 1
    ? headcount.series.map((p) => ({
        x: new Date(p.t).toLocaleDateString("en-US", {
          month: "short",
          ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
        }),
        actual: p.v,
      }))
    : [];

  return (
    <HubPrimaryCard
      title="Headcount & hiring"
      subtitle={`Headcount vs plan (${granularity}-on-${granularity}) · hiring funnel shape`}
      accent="border-t-emerald-600"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 min-w-0">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Headcount actual vs plan
          </p>
          {headRows.length > 1 ? (
            <LineChart
              data={headRows}
              xKey="x"
              lines={[{ key: "actual", label: "Actual", color: "#059669" }]}
              height={220}
              grid
            />
          ) : (
            <HubEmptyState message="Headcount series unavailable for this range." />
          )}
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Current:&nbsp;
            <span className="font-bold text-slate-800 dark:text-slate-100">
              {formatValue(headcount?.current, headcount?.unit, headcount?.state)}
            </span>
            {headcount?.target != null ? (
              <>
                &nbsp;·&nbsp;Target:&nbsp;
                <span className="font-medium">{formatValue(headcount.target, headcount.unit)}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="lg:col-span-5 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-3 lg:pt-0 lg:pl-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Hiring funnel shape
          </p>
          <div className="flex flex-col items-stretch gap-1.5">
            {FUNNEL_STAGES.map((s) => (
              <div
                key={s.key}
                className={cn("relative h-9 mx-auto rounded border flex items-center justify-between px-3 text-xs font-semibold text-slate-800 dark:text-slate-100", s.color)}
                style={{ width: `${s.widthPct}%` }}
              >
                <span>{s.label}</span>
                <span className="opacity-70">{s.widthPct}%</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
            Stage conversion shape · operator-grade pipeline lives in the Recruiter workbench.
          </p>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
