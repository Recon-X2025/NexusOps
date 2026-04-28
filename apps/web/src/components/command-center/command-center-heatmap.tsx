"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const DIMS = ["volume", "sla", "risk", "trend"] as const;

export function CommandCenterHeatmap({ payload }: { payload: Payload }) {
  const getGlow = (state: string) => {
    switch (state) {
      case "healthy": return "border-[#00C971]/40 text-[#00C971] bg-[#D8FFE6]/50 shadow-sm hover:shadow-[0_4px_12px_rgba(0,201,113,0.15)]";
      case "watch": return "border-amber-400/40 text-amber-600 bg-amber-50/80 shadow-sm hover:shadow-[0_4px_12px_rgba(245,158,11,0.15)]";
      case "stressed": return "border-rose-400/40 text-rose-600 bg-rose-50/80 shadow-sm hover:shadow-[0_4px_12px_rgba(244,63,94,0.15)]";
      default: return "border-slate-200/60 text-slate-400 bg-slate-50/50";
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm flex flex-col rounded-2xl relative group">
      
      <div className="px-5 py-4 border-b border-slate-200/60 flex items-center justify-between relative z-10">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Matrix Topography</h2>
      </div>
      
      <div className="p-4 flex-1 relative z-10 bg-slate-50/30">
        <div className="overflow-x-auto">
          <div className="grid gap-2" style={{ gridTemplateColumns: `140px repeat(${DIMS.length}, minmax(100px,1fr))` }}>
            {/* Header */}
            <div className="" />
            {DIMS.map((d) => (
              <div key={d} className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest pb-2">
                {d}
              </div>
            ))}

            {/* Rows */}
            {payload.heatmap.map((row) => (
              <div key={row.function} className="contents group/row">
                <div className="text-[11px] font-black uppercase tracking-widest py-3 px-2 flex items-center text-slate-600 group-hover/row:text-slate-900 transition-colors">
                  <span className="truncate">{row.function.replace(/_/g, " ")}</span>
                </div>
                {DIMS.map((d) => {
                  const cell = row.cells[d];
                  const glowClass = getGlow(cell.state);
                  return (
                    <div key={d} className="p-1">
                      <div className={cn("h-full w-full rounded-lg border flex flex-col items-center justify-center p-2 transition-all duration-300 hover:-translate-y-0.5 relative cursor-pointer overflow-hidden", glowClass)}>
                        <span className="relative z-10 text-sm font-black tracking-tighter">{cell.value ?? "—"}</span>
                        <span className="relative z-10 text-[9px] font-bold uppercase tracking-widest opacity-80 mt-0.5">{cell.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
