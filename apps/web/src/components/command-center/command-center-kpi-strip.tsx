"use client";

import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterKpiStrip({ payload }: { payload: Payload }) {
  const displayMetrics = payload.bullets.slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {/* Metric tiles */}
      {displayMetrics.map((m) => {
        const cellState = m.cellState || { kind: 'no_data' };
        const isNoData = cellState.kind === 'no_data';
        const color = isNoData ? '#e2e8f0' : (cellState.kind === 'healthy' ? '#00C971' : cellState.kind === 'watch' ? '#f59e0b' : '#ef4444');
        
        return (
          <div
            key={m.metricId}
            className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm group hover:bg-white hover:-translate-y-1 transition-all duration-300"
          >
            <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] blur-[50px] opacity-10 rounded-full transition-all group-hover:opacity-20" style={{ backgroundColor: color }} />
            <div className="relative z-10">
              <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">
                {m.label}
              </h3>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-h3 font-black tracking-tighter text-slate-900 drop-shadow-sm">
                  {m.displayValue ?? m.current}
                </span>
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-50/80 border border-slate-100", 
                  isNoData ? "text-slate-400" : (cellState.kind === 'healthy' ? "text-[#00C971]" : "text-rose-500"))}>
                  {isNoData ? "→" : (m.direction === 'higher_is_better' ? "↑" : "↓")}
                </span>
              </div>
            </div>
            <div className="relative z-10 mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              {!isNoData && (
                <div className="h-full rounded-full transition-all duration-1000 ease-out" 
                  style={{ width: `${m.state === 'healthy' ? 90 : m.state === 'watch' ? 60 : 30}%`, backgroundColor: color }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
