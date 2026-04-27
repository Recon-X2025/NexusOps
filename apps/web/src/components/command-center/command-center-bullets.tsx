"use client";

import Link from "next/link";
import { BulletBar } from "./primitives/bullet-bar";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterBullets({ payload }: { payload: Payload }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden h-full">
      <div className="h-[3px] w-full bg-gradient-to-r from-sky-500 to-blue-600" />
      <div className="p-4 md:p-5 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight">Key Targets</h2>
          <p className="text-xs text-slate-500 mt-0.5">Current vs target where defined</p>
        </div>
        <div className="space-y-4">
          {payload.bullets.map((b) => {
            const max = Math.max(b.current, b.target ?? 0, 1) * 1.15;
            const targetFrac = b.target != null ? b.target / max : undefined;
            const invert = b.direction === "lower_is_better";
            const row = (
              <div>
                <div className="flex justify-between gap-2 text-xs font-bold text-slate-800 mb-1.5">
                  <span>{b.label}</span>
                  <span className="tabular-nums">
                    {formatMetricValue(b.current, b.unit, b.state, { compact: true })}
                    {b.target != null ? (
                      <span className="text-slate-400 font-medium">
                        {" / "}
                        {formatMetricValue(b.target, b.unit, undefined, { compact: true })}
                      </span>
                    ) : null}
                  </span>
                </div>
                <BulletBar
                  value={b.state === "no_data" ? 0 : invert ? max - b.current : b.current}
                  max={max}
                  targetFrac={targetFrac}
                  invert={invert}
                  ariaLabel={`${b.label} progress toward target`}
                />
              </div>
            );
            return b.drillUrl ? (
              <Link
                key={b.metricId}
                href={b.drillUrl}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
              >
                {row}
              </Link>
            ) : (
              <div key={b.metricId}>{row}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
