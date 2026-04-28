"use client";

import Link from "next/link";
import { BulletBar } from "./primitives/bullet-bar";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterBullets({ payload }: { payload: Payload }) {
  return (
    <div className="bg-white border border-slate-200 overflow-hidden h-full shadow-sm">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50">
        <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Key Targets</h2>
      </div>
      <div className="p-2 space-y-3">
        {payload.bullets.slice(0, 4).map((b) => {
          const max = Math.max(b.current, b.target ?? 0, 1) * 1.15;
          const targetFrac = b.target != null ? b.target / max : undefined;
          const invert = b.direction === "lower_is_better";
          const row = (
            <div>
              <div className="flex justify-between gap-1 text-[10px] font-bold text-slate-600 mb-0.5">
                <span className="truncate">{b.label}</span>
                <span className="tabular-nums">
                  {formatMetricValue(b.current, b.unit, b.state, { compact: true })}
                </span>
              </div>
              <BulletBar
                value={b.state === "no_data" ? 0 : invert ? max - b.current : b.current}
                max={max}
                targetFrac={targetFrac}
                invert={invert}
              />
            </div>
          );
          return (
            <div key={b.metricId} className="group">
              {b.drillUrl ? (
                <Link href={b.drillUrl} className="block hover:bg-slate-50 transition-colors rounded p-0.5 -m-0.5">
                  {row}
                </Link>
              ) : (
                <div className="p-0.5">{row}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
