"use client";

import { AreaChart } from "@/components/charts";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterTrends({ payload }: { payload: Payload }) {
  const trends = payload.trends.slice(0, 3);
  
  if (trends.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm rounded-2xl relative group min-h-[200px] flex items-center justify-center">
        <span className="text-caption text-muted-foreground italic">No velocity trajectory data available.</span>
      </div>
    );
  }

  // Align all series to the same X-axis labels
  const allLabels = Array.from(new Set(trends.flatMap(t => t.series.map(s => s.t)))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const chartData = allLabels.map(label => {
    const dataPoint: any = { x: label };
    trends.forEach((t, i) => {
      const match = t.series.find(s => s.t === label);
      dataPoint[`value${i}`] = match ? match.v : 0;
    });
    return dataPoint;
  });

  const colors = ["#00BCFF", "#00C971", "#F59E0B"];
  const areas = trends.map((t, i) => ({ 
    key: `value${i}`, 
    label: t.label, 
    color: colors[i % colors.length], 
    valueDataKey: `value${i}`, 
    formatValue: (v: number) => `${v}${t.unit === 'percent' ? '%' : ''}` 
  }));

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm rounded-2xl relative group flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-t from-slate-50/50 to-transparent pointer-events-none" />
      <div className="px-5 py-4 border-b border-slate-200/60 relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-caption font-black text-slate-700 uppercase tracking-[0.2em] whitespace-nowrap">Velocity Trajectory</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {trends.map((t, i) => (
            <div key={t.metricId} className="flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-2 flex-1 min-h-[160px] relative z-10 flex items-center">
        <div className="w-full opacity-90 filter drop-shadow-sm">
          <AreaChart
            data={chartData}
            xKey="x"
            areas={areas}
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
