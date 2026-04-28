"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

type Risk = Payload["risks"][number];

function SeverityBadge({ severity, count }: { severity: string; count: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
        severity === "high"
          ? "bg-rose-100 text-rose-700 border-rose-200"
          : "bg-amber-100 text-amber-700 border-amber-200",
      )}
    >
      {count} {severity}
    </span>
  );
}

function RiskPill({ r }: { r: Risk }) {
  const isHigh = r.severity === "high";
  const inner = (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5 border-l-4 text-xs transition-shadow hover:shadow-md",
        isHigh
          ? "bg-rose-50 border-l-rose-500 border border-rose-100"
          : "bg-amber-50 border-l-amber-400 border border-amber-100",
      )}
    >
      <div
        className={cn("font-bold leading-tight", isHigh ? "text-rose-900" : "text-amber-900")}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold mr-2 uppercase tracking-wide",
            isHigh ? "bg-rose-200 text-rose-800" : "bg-amber-200 text-amber-800",
          )}
        >
          {r.severity}
        </span>
        {r.label}
      </div>
      {r.detail ? <div className="text-slate-500 mt-0.5 leading-snug">{r.detail}</div> : null}
    </div>
  );

  return r.drillUrl ? (
    <Link href={r.drillUrl} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

export function CommandCenterRisks({ payload }: { payload: Payload }) {
  const high = payload.risks.filter((r) => r.severity === "high").length;

  return (
    <div className="bg-white border border-slate-200 overflow-hidden h-full shadow-sm">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Risk Register</h2>
        {high > 0 && (
          <span className="text-[9px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full border border-rose-200">
            {high} Critical
          </span>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        {payload.risks.length === 0 ? (
          <p className="text-[10px] text-slate-400 text-center py-4">No risks detected</p>
        ) : (
          payload.risks.slice(0, 4).map((r) => (
            <div key={r.metricId} className="group">
              {r.drillUrl ? (
                <Link href={r.drillUrl} className="block p-1.5 rounded bg-slate-50/50 border border-slate-100 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full", r.severity === "high" ? "bg-rose-500" : "bg-amber-400")} />
                    <span className="text-[10px] font-bold text-slate-700 line-clamp-1">{r.label}</span>
                  </div>
                </Link>
              ) : (
                <div className="p-1.5 rounded bg-slate-50/50 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full", r.severity === "high" ? "bg-rose-500" : "bg-amber-400")} />
                    <span className="text-[10px] font-bold text-slate-700 line-clamp-1">{r.label}</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
