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
  const watch = payload.risks.filter((r) => r.severity !== "high").length;

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden h-full">
      <div className="h-[3px] w-full bg-gradient-to-r from-rose-500 to-orange-400" />
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Risk Register</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ranked signals by severity</p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {high > 0 && <SeverityBadge severity="high" count={high} />}
            {watch > 0 && <SeverityBadge severity="watch" count={watch} />}
          </div>
        </div>
        <div className="space-y-2">
          {payload.risks.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No ranked risks in this view.</p>
          ) : (
            payload.risks.map((r) => <RiskPill key={r.metricId} r={r} />)
          )}
        </div>
      </div>
    </div>
  );
}
