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

  // Mock data for AP vs AR opposing area chart
  const cashflowData = [
    { x: "Jan", ap: -120, ar: 150 },
    { x: "Feb", ap: -140, ar: 180 },
    { x: "Mar", ap: -110, ar: 160 },
    { x: "Apr", ap: -130, ar: 190 },
    { x: "May", ap: -150, ar: 210 },
  ];

  const tail = arOver60?.current ?? 0;
  const aging = [
    { bucket: "0–30 d", value: Math.round(tail * 2.2) || 450000 },
    { bucket: "30–60 d", value: Math.round(tail * 1.5) || 280000 },
    { bucket: "60–90 d", value: Math.round(tail * 0.6) || 120000 },
    { bucket: "90+ d", value: tail || 45000 },
  ];

  return (
    <HubPrimaryCard
      title="Financial Health & Cashflow"
      subtitle={`Cashflow dynamics and AR aging · ${granularity}-on-${granularity}`}
      accent="from-slate-600 to-slate-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Cashflow Opposing Area Chart */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Cashflow Dynamics (AP vs AR)</h3>
            <AreaChart
              data={cashflowData}
              xKey="x"
              areas={[
                { key: "ar", label: "Receivables (AR)", color: "#10b981" },
                { key: "ap", label: "Payables (AP)", color: "#f43f5e" },
              ]}
              height={220}
              grid
              legend
            />
          </div>

          {/* AR Aging Bar */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">AR Aging Distribution</h3>
            <BarChart
              data={aging}
              xKey="bucket"
              bars={[{ key: "value", label: "Amount", color: "#64748b" }]}
              height={180}
              grid
              yFormatter={(v) => v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}k`}
            />
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

          <div className="mt-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 mb-3">Top Payables</h4>
            <div className="space-y-2">
              {[
                { name: "AWS Infrastructure", amount: "₹4.2L", due: "3 days" },
                { name: "Office Lease", amount: "₹2.8L", due: "Overdue" },
                { name: "Employee Benefits", amount: "₹1.5L", due: "7 days" },
              ].map((p) => (
                <div key={p.name} className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-600 font-medium">{p.name}</span>
                  <div className="text-right">
                    <div className="font-bold text-slate-800">{p.amount}</div>
                    <div className={cn("text-[9px] font-bold uppercase", p.due === "Overdue" ? "text-rose-500" : "text-slate-400")}>{p.due}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
