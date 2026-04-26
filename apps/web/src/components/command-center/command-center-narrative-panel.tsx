"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterNarrativePanel({ payload }: { payload: Payload }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden border-t-[3px] border-t-emerald-600">
      <div className="p-4 md:p-5">
        <h3 className="text-sm font-semibold text-slate-800">Executive summary</h3>
        <p className="text-sm text-slate-700 leading-relaxed mt-2">{payload.narrative}</p>
        <div className="mt-5 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Attention queue</h4>
          <ul className="mt-2 space-y-2.5">
            {payload.attention.length === 0 ? (
              <li className="text-xs text-slate-400">No flagged items.</li>
            ) : (
              payload.attention.map((a) => (
                <li key={a.metricId} className="text-xs">
                  {a.drillUrl ? (
                    <Link href={a.drillUrl} className="font-medium text-slate-800 hover:text-blue-700 hover:underline">
                      <span className={a.severity === "high" ? "text-rose-600" : "text-amber-600"}>
                        {a.severity === "high" ? "●" : "◐"}{" "}
                      </span>
                      {a.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-800">{a.label}</span>
                  )}
                  <div className="text-slate-500 mt-0.5">{a.message}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
