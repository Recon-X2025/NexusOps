"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const DIMS = ["volume", "sla", "risk", "trend"] as const;

export function CommandCenterHeatmap({ payload }: { payload: Payload }) {
  const getGlow = (state: string, kind?: string) => {
    if (kind === "not_applicable") return "border-slate-100/50 text-slate-300 bg-slate-50/20";
    switch (state) {
      case "healthy": return "border-[#00C971]/40 text-[#00C971] bg-[#D8FFE6]/50 shadow-sm hover:shadow-[0_4px_12px_rgba(0,201,113,0.15)]";
      case "watch": return "border-amber-400/40 text-amber-600 bg-amber-50/80 shadow-sm hover:shadow-[0_4px_12px_rgba(245,158,11,0.15)]";
      case "stressed": return "border-rose-400/40 text-rose-600 bg-rose-50/80 shadow-sm hover:shadow-[0_4px_12px_rgba(244,63,94,0.15)]";
      case "no_data": return "border-slate-200/60 text-slate-400 bg-slate-100/40";
      default: return "border-slate-200/80 text-slate-600 bg-slate-100/50 shadow-inner";
    }
  };

  const isHubView = payload.heatmap.length === 1;
  const hubRows = isHubView ? payload.heatmap : payload.heatmap.filter(r => r.function !== "devops");

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm flex flex-col rounded-2xl relative group">
      
      <div className="px-5 py-4 border-b border-slate-200/60 flex items-center justify-between relative z-10">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Diagnostic Heatmap</h2>
      </div>
      
      <div className="p-4 flex-1 relative z-10 bg-slate-50/30">
        <div className="overflow-x-auto">
          {isHubView ? (
            /* HUB VIEW: Old layout (Functions as Rows, Dimensions as Columns) */
            <div className="grid gap-2" style={{ gridTemplateColumns: `140px repeat(${DIMS.length}, minmax(100px,1fr))` }}>
              <div className="" />
              {DIMS.map((d) => (
                <div key={d} className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest pb-2">
                  {d}
                </div>
              ))}
              {hubRows.map((row) => (
                <div key={row.function} className="contents group/row">
                  <div className="text-[11px] font-black uppercase tracking-widest py-3 px-2 flex items-center text-slate-600 group-hover/row:text-slate-900 transition-colors">
                    <span className="truncate">{row.function.replace(/_/g, " ")}</span>
                  </div>
                  {DIMS.map((d) => {
                    const cell = row.cells[d];
                    const glowClass = getGlow(cell.state, cell.cellState?.kind);
                    const isNA = cell.cellState?.kind === "not_applicable";
                    return (
                      <div key={d} className="p-1">
                        <div className={cn("h-full w-full rounded-lg border flex flex-col items-center justify-center p-2 transition-all duration-300 relative overflow-hidden", glowClass)}>
                          <span className={cn("relative z-10 text-sm font-black tracking-tighter", isNA && "text-slate-300 font-medium tracking-normal text-xs")}>{isNA ? "N/A" : cell.state === 'no_data' ? "—" : (cell.displayValue ?? cell.value)}</span>
                          <span className="relative z-10 text-[9px] font-bold uppercase tracking-widest opacity-80 mt-0.5 text-center">{cell.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            /* GLOBAL VIEW: New layout (Dimensions as Rows, Functions as Columns) */
            <div className="grid gap-3" style={{ gridTemplateColumns: `140px repeat(${hubRows.length}, minmax(100px,1fr))` }}>
              <div className="" />
              {hubRows.map((row) => (
                <div key={row.function} className="text-[10px] font-black text-center text-slate-500 uppercase tracking-[0.2em] pb-3 border-b border-slate-200/50">
                  {row.function.replace(/_/g, " ")}
                </div>
              ))}
              {DIMS.map((dim) => (
                <div key={dim} className="contents group/row">
                  <div className="text-[11px] font-black uppercase tracking-widest py-4 px-2 flex items-center text-slate-400 group-hover/row:text-slate-900 transition-colors">
                    <span className="truncate">{dim}</span>
                  </div>
                  {hubRows.map((row) => {
                    const cell = row.cells[dim];
                    const glowClass = getGlow(cell.state, cell.cellState?.kind);
                    const isNA = cell.cellState?.kind === "not_applicable";
                    return (
                      <div key={row.function} className="p-1">
                        <div className={cn("h-full w-full rounded-lg border flex flex-col items-center justify-center p-3 min-h-[70px] transition-all duration-300 relative overflow-hidden", glowClass)}>
                          <span className={cn("relative z-10 text-base font-black tracking-tighter leading-none", isNA && "text-slate-300 font-medium tracking-normal text-sm")}>{isNA ? "N/A" : cell.state === 'no_data' ? "—" : (cell.displayValue ?? cell.value)}</span>
                          <span className="relative z-10 text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1.5 text-center line-clamp-1">{cell.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
