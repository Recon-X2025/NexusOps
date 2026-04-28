"use client";

import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

function GlowingRing({ score, color }: { score: number; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
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
        <span className="text-2xl font-black text-slate-800">{Math.round(score)}</span>
      </div>
    </div>
  );
}

export function CommandCenterKpiStrip({ payload }: { payload: Payload }) {
  const mockMetrics = [
    { label: "System Uptime", value: "99.99%", up: true, delta: "0.01%", color: "#00BCFF" },
    { label: "Active Incidents", value: "3", up: false, delta: "2", color: "#ef4444" },
    { label: "Deployment Velocity", value: "24/day", up: true, delta: "15%", color: "#00C971" },
    { label: "Threat Posture", value: "Secure", up: true, delta: "Stable", color: "#004FFB" },
    { label: "Infrastructure Cost", value: "$42k", up: false, delta: "5%", color: "#f59e0b" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
      {/* Score tile */}
      <div className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between shadow-sm group hover:border-slate-300 transition-all">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#D8FFE6]/60 blur-[40px] rounded-full group-hover:bg-[#D8FFE6]/80 transition-all" />
        <div className="flex flex-col gap-1 z-10">
          <span className="text-xs font-bold text-[#00C971] uppercase tracking-widest">Global Health</span>
          <span className="text-[10px] text-slate-500 font-medium">System nominal</span>
        </div>
        <GlowingRing score={payload.score || 94} color="#00C971" />
      </div>

      {/* Metric tiles */}
      {mockMetrics.map((m, i) => (
        <div
          key={i}
          className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm group hover:bg-white hover:-translate-y-1 transition-all duration-300"
        >
          <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] blur-[50px] opacity-10 rounded-full transition-all group-hover:opacity-20" style={{ backgroundColor: m.color }} />
          <div className="relative z-10">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              {m.label}
            </h3>
            <div className="flex items-baseline justify-between mt-3">
              <span className="text-3xl font-black tracking-tighter text-slate-900 drop-shadow-sm">
                {m.value}
              </span>
              <span className={cn("text-xs font-bold px-2 py-1 rounded-md bg-slate-50/80 border border-slate-100", m.up ? "text-[#00C971]" : "text-rose-500")}>
                {m.up ? "↑" : "↓"} {m.delta}
              </span>
            </div>
          </div>
          <div className="relative z-10 mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.random() * 60 + 40}%`, backgroundColor: m.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
