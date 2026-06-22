"use client";

/**
 * Finance & Procurement primary visual.
 *
 * Cashflow area chart (AP vs AR opposing) + aging bar
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, HubStatTile } from "./shared";
import { AreaChart, BarChart } from "@/components/charts";
import { cn } from "@/lib/utils";

export function FinancePrimary({ payload, granularity }: HubPrimaryProps) {
  const runway = findMetric(payload, "financial.cash_runway_months");
  const burn = findMetric(payload, "financial.burn_rate");
  const margin = findMetric(payload, "financial.gross_margin");
  const arOver60 = findMetric(payload, "financial.ar_aged_60_plus");

  const marginSeries = margin?.series ?? [];
  const burnRows = burn && burn.series.length > 1
    ? burn.series.map((p) => ({
      x: new Date(p.t).toLocaleDateString("en-US", {
        month: "short",
        ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
      }),
      burn: p.v,
      margin: marginSeries.find((m) => m.t === p.t)?.v ?? null,
    }))
    : [];

  return (
    <HubPrimaryCard
      title="Finance Status"
      subtitle={`Cashflow dynamics and AR aging · ${granularity}-on-${granularity}`}
      accent="from-slate-600 to-slate-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* AR Aging Bar */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">AR Aging Distribution</h3>
            <HubEmptyState message="AR aging data unavailable." />
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Finance KPIs</h3>
          <div className="p-4 rounded-xl bg-slate-900 text-white shadow-lg mb-2">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Cash Runway</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{formatValue(runway?.current, "", runway?.state)}</span>
              <span className="text-slate-500 text-sm font-bold">Months</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 italic">At current burn rate</p>
          </div>

          <HubStatTile
            label="Current Burn Rate"
            value={formatValue(burn?.current, burn?.unit, burn?.state)}
            state={burn?.state}
          />
          <HubStatTile
            label="Gross Margin"
            value={formatValue(margin?.current, margin?.unit ?? "percent", margin?.state)}
            state={margin?.state}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}
