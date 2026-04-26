"use client";

import Link from "next/link";
import { BulletBar } from "./primitives/bullet-bar";
import { BarChart } from "@/components/charts";
import { bulletsTargetBars } from "./command-center-chart-data";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterBullets({ payload }: { payload: Payload }) {
  const targetCompare = bulletsTargetBars(payload);

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] border-t-sky-600">
      <div className="p-4 md:p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800 tracking-tight">Key targets</h2>
          <p className="text-xs text-slate-500 mt-1">Current vs target where defined</p>
        </div>
        {targetCompare.length > 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
            <BarChart
              data={targetCompare}
              xKey="name"
              bars={[
                { key: "Current", label: "Current", color: "#0284c7" },
                { key: "Target", label: "Target", color: "#94a3b8" },
              ]}
              height={240}
              grid
              legend
              horizontal
            />
          </div>
        ) : null}
        <div className="space-y-4">
          {payload.bullets.map((b) => {
            const max = Math.max(b.current, b.target ?? 0, 1) * 1.15;
            const targetFrac = b.target != null ? b.target / max : undefined;
            const invert = b.direction === "lower_is_better";
            const row = (
              <div>
                <div className="flex justify-between gap-2 text-xs font-semibold text-slate-800">
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
              <Link key={b.metricId} href={b.drillUrl} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
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
