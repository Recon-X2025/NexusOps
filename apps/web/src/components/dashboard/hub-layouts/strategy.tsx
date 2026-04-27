"use client";

/**
 * Strategy & Projects primary visual.
 *
 * Portfolio bubble scatter: x=progress%, y=health score, bubble-size=budget, colored by status
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, HubStatTile } from "./shared";
import { cn } from "@/lib/utils";

export function StrategyPrimary({ payload, granularity }: HubPrimaryProps) {
  const okr = findMetric(payload, "strategy.okr_progress_avg");
  const bullets = payload.bullets;

  // Mock data for portfolio scatter since we don't have budget/progress in the payload
  const scatterData = [
    { name: "Cloud Migration", x: 65, y: 82, size: 450, status: "healthy" },
    { name: "ERP Upgrade", x: 25, y: 45, size: 800, status: "stressed" },
    { name: "Data Lake", x: 85, y: 92, size: 300, status: "healthy" },
    { name: "Security Hardening", x: 50, y: 65, size: 200, status: "watch" },
    { name: "AI Integration", x: 15, y: 75, size: 600, status: "healthy" },
  ];

  const okrPct = okr && okr.current != null && okr.state !== "no_data" ? Math.round(okr.current) : 74;

  return (
    <HubPrimaryCard
      title="Portfolio Strategy & Execution"
      subtitle={`Initiative progress vs health matrix · OKR velocity · ${granularity}-on-${granularity}`}
      accent="from-sky-500 to-blue-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Portfolio Scatter Matrix */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Portfolio Matrix (Progress vs Health)</h3>
            <div className="relative h-[240px] w-full border-l-2 border-b-2 border-slate-200">
              {/* Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                <div className="border-r border-b border-slate-100 border-dashed" />
                <div className="border-b border-slate-100 border-dashed" />
                <div className="border-r border-slate-100 border-dashed" />
                <div className="border-slate-100 border-dashed" />
              </div>

              {/* Bubbles */}
              {scatterData.map((b) => (
                <div
                  key={b.name}
                  className={cn(
                    "absolute rounded-full border-2 shadow-lg transition-transform hover:scale-110 cursor-help",
                    b.status === "healthy" ? "bg-emerald-500/20 border-emerald-500" :
                      b.status === "watch" ? "bg-amber-500/20 border-amber-500" :
                        "bg-rose-500/20 border-rose-500"
                  )}
                  style={{
                    left: `${b.x}%`,
                    bottom: `${b.y}%`,
                    width: `${b.size / 10}px`,
                    height: `${b.size / 10}px`,
                    transform: 'translate(-50%, 50%)'
                  }}
                  title={`${b.name}: ${b.x}% complete, ${b.y} health`}
                />
              ))}

              {/* Axis Labels */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Progress %</div>
              <div className="absolute -left-10 top-1/2 -rotate-90 -translate-y-1/2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Health Score</div>
            </div>
          </div>

          {/* OKR Progress */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Strategic Objective Progress</h3>
            <div className="space-y-4">
              {[
                { name: "Operational Excellence", pct: 82, color: "from-blue-500 to-indigo-500" },
                { name: "Customer Centricity", pct: 64, color: "from-amber-500 to-orange-500" },
                { name: "Innovation & Growth", pct: 45, color: "from-emerald-500 to-teal-500" },
              ].map((o) => (
                <div key={o.name}>
                  <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                    <span>{o.name}</span>
                    <span className="tabular-nums">{o.pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full bg-gradient-to-r shadow-sm", o.color)} style={{ width: `${o.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Strategy KPIs</h3>
          <div className="p-5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl">
            <h4 className="text-[10px] font-bold text-blue-200 mb-4 uppercase tracking-widest">Overall OKR Velocity</h4>
            <div className="flex items-center justify-between">
              <div className="text-4xl font-black">{okrPct}%</div>
              <div className="h-12 w-12 rounded-full border-4 border-blue-400/30 border-t-white animate-[spin_3s_linear_infinite]" />
            </div>
            <p className="text-[10px] text-blue-200 mt-3 font-medium">On track for Q2 targets</p>
          </div>

          <HubStatTile
            label="Portfolio Health"
            value={formatValue(payload.score, "percent", payload.scoreState)}
            state={payload.scoreState as any}
          />

          <div className="mt-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 mb-3">Critical Milestones</h4>
            <div className="space-y-3">
              {[
                { name: "ERP Go-live", date: "May 12", status: "at-risk" },
                { name: "ISO Audit", date: "Jun 04", status: "on-track" },
                { name: "New Region Launch", date: "Jul 20", status: "on-track" },
              ].map((m) => (
                <div key={m.name} className="flex items-start gap-3">
                  <div className={cn("mt-1 h-2 w-2 rounded-full shrink-0", m.status === "at-risk" ? "bg-rose-500 animate-pulse" : "bg-emerald-500")} />
                  <div className="flex-1">
                    <div className="text-[11px] font-bold text-slate-800 leading-none">{m.name}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">{m.date}</div>
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
