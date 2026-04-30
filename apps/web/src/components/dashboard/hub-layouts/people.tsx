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
export function PeoplePrimary({ payload, granularity }: HubPrimaryProps) {
  const headcount = findMetric(payload, "people.headcount_total");
  const headRows = (headcount?.series ?? []).map((p) => ({ x: p.t, actual: p.v }));

  return (
    <HubPrimaryCard
      title="People Status"
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
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">People KPIs</h3>
          <HubStatTile
            label="Total Headcount"
            value={formatValue(headcount?.current, headcount?.unit, headcount?.state)}
            state={headcount?.state}
            hint={headcount?.target != null ? `target ${formatValue(headcount.target, headcount.unit)}` : undefined}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}
