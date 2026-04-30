"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterBullets({ payload }: { payload: Payload }) {
  const items = payload.bullets.slice(0, 4);

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm rounded-2xl relative">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none" />
      <div className="px-5 py-4 border-b border-slate-200/60 relative z-10">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Performance Benchmarks</h2>
      </div>
      <div className="p-5 flex flex-col gap-5 relative z-10">
        {items.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground italic">No target metrics tracked for this view.</div>
        )}
        {items.map((b, i) => {
          const cellState = b.cellState || { kind: "no_data" };
          const isNoData = cellState.kind === "no_data";
          const hasTarget = b.target !== undefined;
          const target = b.target ?? 0;
          const current = b.current ?? 0;
          const pct = isNoData ? 0 : hasTarget ? Math.min(100, Math.max(0, (current / target) * 100)) : 100;
          
          const colorClass = isNoData 
            ? "bg-slate-100" 
            : cellState.kind === "unhealthy" 
            ? "bg-rose-500" 
            : cellState.kind === "watch" 
            ? "bg-amber-500" 
            : "bg-emerald-500";
          
          return (
            <div key={i} className="group">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-800 transition-colors line-clamp-1">{b.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-xl font-black drop-shadow-sm", isNoData ? "text-slate-300" : "text-slate-900")}>
                    {isNoData ? "—" : current.toLocaleString()}
                  </span>
                  {!isNoData && hasTarget && (
                    <span className="text-xs font-bold text-slate-400">/ {target.toLocaleString()}{b.unit === "percent" ? "%" : ""}</span>
                  )}
                </div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                {!isNoData && (
                  <div 
                    className={cn("h-full rounded-full transition-all duration-1000", colorClass)}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
