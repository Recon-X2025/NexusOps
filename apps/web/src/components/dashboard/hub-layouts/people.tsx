"use client";

/**
 * People & Workplace primary visual.
 *
 * Headcount lifecycle funnel (stacked horizontal bars) + headcount KPI row
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, HubStatTile } from "./shared";
import { LineChart } from "@/components/charts";
import { cn } from "@/lib/utils";

const FUNNEL_STAGES = [
  { key: "applied", label: "Applied", widthPct: 100, color: "from-emerald-400 to-emerald-500" },
  { key: "screened", label: "Screened", widthPct: 78, color: "from-emerald-500 to-teal-400" },
  { key: "interviewed", label: "Interviewed", widthPct: 52, color: "from-teal-400 to-teal-500" },
  { key: "offered", label: "Offered", widthPct: 28, color: "from-teal-500 to-cyan-400" },
  { key: "hired", label: "Hired", widthPct: 14, color: "from-cyan-400 to-cyan-500" },
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
      title="Workforce & Talent"
      subtitle={`Headcount actuals vs plan · hiring funnel shape · ${granularity}-on-${granularity}`}
      accent="from-emerald-500 to-teal-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Headcount Trend */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Headcount Actual vs Plan</h3>
            {headRows.length > 1 ? (
              <LineChart
                data={headRows}
                xKey="x"
                lines={[{ key: "actual", label: "Actual", color: "#10b981" }]}
                height={200}
                grid
              />
            ) : (
              <HubEmptyState message="Headcount series unavailable." />
            )}
          </div>

          {/* Funnel Visual */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Talent Acquisition Funnel</h3>
            <div className="flex flex-col items-center gap-1.5">
              {FUNNEL_STAGES.map((s) => (
                <div
                  key={s.key}
                  className={cn(
                    "relative h-9 rounded-lg bg-gradient-to-r shadow-sm border border-white/20 flex items-center justify-between px-4 text-[11px] font-black text-white",
                    s.color
                  )}
                  style={{ width: `${s.widthPct}%` }}
                >
                  <span className="uppercase tracking-wider">{s.label}</span>
                  <span className="opacity-80 tabular-nums">{s.widthPct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">People KPIs</h3>
          <HubStatTile
            label="Total Headcount"
            value={formatValue(headcount?.current, headcount?.unit, headcount?.state)}
            state={headcount?.state}
            hint={headcount?.target != null ? `target ${formatValue(headcount.target, headcount.unit)}` : undefined}
          />

          <div className="mt-4 space-y-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <h4 className="text-xs font-bold text-emerald-800 mb-2">Employee Sentiment</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-900">4.2</span>
                <span className="text-emerald-600 text-xs font-bold">/ 5.0</span>
              </div>
              <p className="text-[10px] text-emerald-600 mt-1 font-medium">↑ 0.3 from last month</p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <h4 className="text-xs font-bold text-slate-800 mb-3">Department Breakdown</h4>
              <div className="space-y-2">
                {[
                  { name: "Engineering", count: 142, color: "bg-blue-500" },
                  { name: "Sales", count: 86, color: "bg-amber-500" },
                  { name: "Operations", count: 64, color: "bg-emerald-500" },
                ].map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className={cn("h-1.5 w-1.5 rounded-full", d.color)} />
                    <span className="text-[11px] font-medium text-slate-600 flex-1">{d.name}</span>
                    <span className="text-[11px] font-bold text-slate-800">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
