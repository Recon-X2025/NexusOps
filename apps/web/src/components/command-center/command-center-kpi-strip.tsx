"use client";

import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

function GlowingRing({ score, color, isAwaitingData }: { score: number; color: string; isAwaitingData?: boolean }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = isAwaitingData ? 0 : (score / 100) * circ;
  return (
    <div className="relative w-[100px] h-[100px] flex items-center justify-center">
      <div className="absolute inset-0 rounded-full blur-[20px] opacity-20 mix-blend-multiply" style={{ backgroundColor: color }} />
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 2px 4px ${color}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-800">{isAwaitingData ? "—" : Math.round(score)}</span>
      </div>
    </div>
  );
}

export function CommandCenterKpiStrip({ payload, title = "Global Health" }: { payload: Payload; title?: string }) {
  const displayMetrics = payload.bullets.slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
      {/* Score tile */}
      <div className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between shadow-sm group hover:border-slate-300 transition-all">
        <div className={cn("absolute top-0 right-0 w-32 h-32 blur-[40px] rounded-full transition-all", 
          payload.scoreState === 'awaiting_data' ? "bg-slate-200/40" : "bg-[#D8FFE6]/60 group-hover:bg-[#D8FFE6]/80")} />
        <div className="flex flex-col gap-1 z-10">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs font-bold uppercase tracking-widest", 
              payload.scoreState === 'awaiting_data' ? "text-slate-400" : "text-[#00C971]")}>{title}</span>
            <div className="group/info relative">
              <div className="w-3 h-3 rounded-full border border-slate-300 text-[8px] flex items-center justify-center text-slate-400 cursor-help">?</div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-slate-800 text-white text-[9px] rounded shadow-xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                Composite health score based on aggregate performance over the last 30 days.
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 font-medium capitalize">
            {payload.scoreState === 'awaiting_data' ? 'Awaiting Data' : 
             payload.scoreState === 'healthy' ? 'System Nominal' : 
             payload.scoreState === 'watch' ? 'Monitoring Required' : 'Critical Intervention'}
          </span>
          {payload.scoreSubtext && <span className="text-[9px] text-slate-400 font-medium">{payload.scoreSubtext}</span>}
        </div>
        <GlowingRing 
          score={payload.score || 0} 
          isAwaitingData={payload.scoreState === 'awaiting_data'}
          color={payload.scoreState === 'awaiting_data' ? '#e2e8f0' : (payload.scoreState === 'healthy' ? '#00C971' : payload.scoreState === 'watch' ? '#f59e0b' : '#ef4444')} 
        />
      </div>

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
              <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1 line-clamp-1">
                {m.label}
              </h3>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-2xl font-black tracking-tighter text-slate-900 drop-shadow-sm">
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
