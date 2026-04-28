"use client";

import { AreaChart } from "@/components/charts";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterTrends({ payload }: { payload: Payload }) {
  // Hardcoded mock data for the surprise redesign
  const mockData = [
    { x: "Jan", "System Load": 30, "Throughput": 50, "Errors": 10 },
    { x: "Feb", "System Load": 45, "Throughput": 65, "Errors": 5 },
    { x: "Mar", "System Load": 60, "Throughput": 45, "Errors": 20 },
    { x: "Apr", "System Load": 85, "Throughput": 90, "Errors": 15 },
    { x: "May", "System Load": 50, "Throughput": 70, "Errors": 5 },
  ];

  const mockAreas = [
    { key: "Throughput", label: "Throughput", color: "#00BCFF", valueDataKey: "Throughput", formatValue: (v: number) => String(v) },
    { key: "System Load", label: "System Load", color: "#00C971", valueDataKey: "System Load", formatValue: (v: number) => String(v) },
    { key: "Errors", label: "Errors", color: "#ef4444", valueDataKey: "Errors", formatValue: (v: number) => String(v) },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm rounded-2xl relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-slate-50/50 to-transparent pointer-events-none" />
      <div className="px-5 py-4 border-b border-slate-200/60 relative z-10 flex items-center justify-between">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Velocity Trajectory</h2>
        <div className="flex gap-3">
          {mockAreas.map((l, i) => (
            <div key={l.key} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
              <div className="h-2 w-2 rounded-full shadow-[0_2px_4px_currentColor]" style={{ background: l.color, color: l.color }} />
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 min-h-[160px] relative z-10">
        <div className="opacity-90 filter drop-shadow-sm">
          <AreaChart
            data={mockData}
            xKey="x"
            areas={mockAreas}
            height={140}
            grid={false}
            stacked={false}
            legend={false}
            yFormatter={(v) => `${v}`}
          />
        </div>
      </div>
    </div>
  );
}
