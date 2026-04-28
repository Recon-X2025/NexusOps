"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterBullets({ payload }: { payload: Payload }) {
  // Mock vibrant data for the surprise
  const mockTargets = [
    { label: "Revenue Target Q3", current: 8.5, target: 10, unit: "M", color: "#00C971" },
    { label: "Customer Acquisition", current: 420, target: 500, unit: "", color: "#00BCFF" },
    { label: "Churn Rate", current: 2.1, target: 1.5, unit: "%", invert: true, color: "#ef4444" },
    { label: "NPS Score", current: 72, target: 80, unit: "", color: "#004FFB" }
  ];

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm rounded-2xl relative">
      <div className="absolute inset-0 bg-gradient-to-b from-[#00C971]/5 to-transparent pointer-events-none" />
      <div className="px-5 py-4 border-b border-slate-200/60 relative z-10">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Key Targets</h2>
      </div>
      <div className="p-5 flex flex-col gap-5 relative z-10">
        {mockTargets.map((b, i) => {
          const pct = Math.min(100, (b.current / b.target) * 100);
          return (
            <div key={i} className="group cursor-pointer">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-800 transition-colors">{b.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900 drop-shadow-sm">{b.current}</span>
                  <span className="text-xs font-bold text-slate-400">/ {b.target}{b.unit}</span>
                </div>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/50">
                <div 
                  className="absolute top-0 bottom-0 left-0 rounded-full transition-all duration-1000 ease-out" 
                  style={{ width: `${pct}%`, backgroundColor: b.color, boxShadow: `0 2px 4px ${b.color}40` }}
                />
                <div 
                  className="absolute top-0 bottom-0 w-[2px] bg-white z-10"
                  style={{ left: b.invert ? '15%' : '80%', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.2))' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
