"use client";

/**
 * Legal & Governance primary visual.
 *
 * Compliance filing calendar grid (12-month × category matrix)
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, HubStatTile } from "./shared";
import { LineChart } from "@/components/charts";
import { cn } from "@/lib/utils";

export function LegalPrimary({ payload, granularity }: HubPrimaryProps) {
  const matters = findMetric(payload, "legal.open_matters");
  const series = matters?.series ?? [];

  const trendRows = series.length > 1
    ? series.map((p) => ({
      x: new Date(p.t).toLocaleDateString("en-US", {
        month: "short",
        ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
      }),
      matters: p.v,
    }))
    : [];

  return (
    <HubPrimaryCard
      title="Legal Status"
      subtitle={`Filing calendar and matter management · ${granularity}-on-${granularity}`}
      accent="from-violet-500 to-purple-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Open Matters Trend */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Open Legal Matters Trend</h3>
            {trendRows.length > 1 ? (
              <LineChart
                data={trendRows}
                xKey="x"
                lines={[{ key: "matters", label: "Matters", color: "#8b5cf6" }]}
                height={180}
                grid
              />
            ) : (
              <HubEmptyState message="Matter series unavailable." />
            )}
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Legal KPIs</h3>
          <HubStatTile
            label="Open Matters"
            value={formatValue(matters?.current, matters?.unit, matters?.state)}
            state={matters?.state}
            hint={matters?.target != null ? `target ${formatValue(matters.target, matters.unit)}` : undefined}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}
