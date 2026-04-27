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

  // Mock compliance calendar data
  const complianceGrid = [
    { month: "Jan", status: "completed", count: 4 },
    { month: "Feb", status: "completed", count: 2 },
    { month: "Mar", status: "overdue", count: 1 },
    { month: "Apr", status: "upcoming", count: 3 },
    { month: "May", status: "upcoming", count: 5 },
    { month: "Jun", status: "upcoming", count: 2 },
  ];

  return (
    <HubPrimaryCard
      title="Compliance & Governance"
      subtitle={`Filing calendar and matter management · ${granularity}-on-${granularity}`}
      accent="from-violet-500 to-purple-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Compliance Calendar Grid */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Compliance Filing Calendar</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {complianceGrid.map((c) => (
                <div
                  key={c.month}
                  className={cn(
                    "p-2 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all",
                    c.status === "completed" ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                      c.status === "overdue" ? "bg-rose-50 border-rose-100 text-rose-700 animate-pulse" :
                        "bg-white border-slate-100 text-slate-600"
                  )}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest">{c.month}</span>
                  <span className="text-lg font-black">{c.count}</span>
                  <span className="text-[8px] font-bold uppercase opacity-60">{c.status}</span>
                </div>
              ))}
            </div>
          </div>

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

          <div className="mt-4 space-y-3">
            <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
              <h4 className="text-xs font-bold text-violet-800 mb-2">Upcoming Deadlines</h4>
              <ul className="text-[11px] space-y-2">
                <li className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="font-bold text-violet-900">Annual GST Return</div>
                    <div className="text-[9px] text-violet-600 font-medium">Statutory Filing</div>
                  </div>
                  <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">2 Days</span>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="font-bold text-violet-900">Board Meeting Minutes</div>
                    <div className="text-[9px] text-violet-600 font-medium">Secretarial</div>
                  </div>
                  <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">5 Days</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <h4 className="text-xs font-bold text-slate-800 mb-3">Matter Status</h4>
              <div className="space-y-3">
                {[
                  { name: "Litigation", count: 12, pct: 45, color: "bg-rose-500" },
                  { name: "Contracts", count: 28, pct: 75, color: "bg-blue-500" },
                  { name: "Advisory", count: 8, pct: 90, color: "bg-emerald-500" },
                ].map((m) => (
                  <div key={m.name}>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                      <span>{m.name}</span>
                      <span>{m.count}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", m.color)} style={{ width: `${m.pct}%` }} />
                    </div>
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
