"use client";

import { heatmapPostureMix } from "./command-center-chart-data";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const STATE_COLORS: Record<string, string> = {
  Healthy: "#00C971", // Happy Green
  Watch: "#f59e0b",
  Stressed: "#ef4444",
  "No data": "#94a3b8", // slate-400
};

export function CommandCenterSidebarCharts({ payload }: { payload: Payload }) {
  const postureMix = heatmapPostureMix(payload);
  const total = postureMix.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden flex flex-col h-full shadow-sm rounded-2xl relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#00BCFF]/5 to-transparent pointer-events-none" />
      <div className="px-5 py-4 border-b border-slate-200/60 relative z-10">
        <h3 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Signal Mix Entropy</h3>
      </div>
      <div className="p-5 flex-1 flex flex-col justify-center gap-4 relative z-10">
        {postureMix.length > 0 ? (
          <div className="flex flex-col gap-3">
            {postureMix.map((item) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    <span style={{ color: STATE_COLORS[item.name] }}>{item.name}</span>
                    <span className="text-slate-900 drop-shadow-sm">{item.value}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                    <div 
                      className="h-full rounded-full transition-all duration-1000" 
                      style={{ 
                        width: `${pct}%`, 
                        backgroundColor: STATE_COLORS[item.name],
                        boxShadow: `0 2px 4px ${STATE_COLORS[item.name]}40`
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">No data feed</p>
        )}
      </div>
    </div>
  );
}
