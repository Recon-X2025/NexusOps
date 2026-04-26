"use client";

import Link from "next/link";
import { BarChart } from "@/components/charts";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterRisks({ payload }: { payload: Payload }) {
  const high = payload.risks.filter((r) => r.severity === "high").length;
  const watch = payload.risks.filter((r) => r.severity !== "high").length;
  const severityChart =
    high + watch > 0
      ? [
          { name: "High", Risks: high },
          { name: "Watch", Risks: watch },
        ]
      : [];

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] border-t-rose-500 h-full">
      <div className="p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-800 tracking-tight">Risk register</h2>
        <p className="text-xs text-slate-500 mt-1">Severity mix and ranked signals</p>
        {severityChart.length > 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 mt-3">
            <BarChart
              data={severityChart}
              xKey="name"
              bars={[{ key: "Risks", label: "Count", color: "#e11d48" }]}
              height={130}
              grid={false}
            />
          </div>
        ) : null}
        <ul className="mt-4 space-y-3">
          {payload.risks.length === 0 ? (
            <li className="text-xs text-slate-400">No ranked risks in this view.</li>
          ) : (
            payload.risks.map((r) => (
              <li key={r.metricId} className="text-xs border-l-[3px] border-slate-200 pl-3">
                {r.drillUrl ? (
                  <Link
                    href={r.drillUrl}
                    className="font-semibold text-slate-800 hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    <span className={r.severity === "high" ? "text-rose-600" : "text-amber-600"}>[{r.severity}]</span> {r.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-800">{r.label}</span>
                )}
                <div className="text-slate-500 mt-0.5">{r.detail}</div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
