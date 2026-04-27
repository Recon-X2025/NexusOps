"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

type AttentionItem = Payload["attention"][number];

function AttentionPill({ a }: { a: AttentionItem }) {
  const isHigh = a.severity === "high";
  const inner = (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3 py-2 border text-xs transition-shadow hover:shadow-sm",
        isHigh
          ? "bg-rose-50 border-rose-200"
          : "bg-amber-50 border-amber-200",
      )}
    >
      <span
        className={cn(
          "mt-0.5 h-2 w-2 rounded-full shrink-0",
          isHigh ? "bg-rose-500 animate-pulse" : "bg-amber-400",
        )}
      />
      <div>
        <span className={cn("font-bold", isHigh ? "text-rose-800" : "text-amber-800")}>{a.label}</span>
        {a.message ? (
          <p className="text-slate-500 mt-0.5 leading-snug">{a.message}</p>
        ) : null}
      </div>
    </div>
  );
  return a.drillUrl ? (
    <Link href={a.drillUrl} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

export function CommandCenterNarrativePanel({ payload }: { payload: Payload }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100 overflow-hidden h-full">
      <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 to-teal-400" />
      <div className="p-4 md:p-5">
        <h3 className="text-base font-bold text-slate-800 tracking-tight">Executive Summary</h3>
        <p className="text-sm text-slate-700 leading-relaxed mt-2 font-serif italic">
          {payload.narrative}
        </p>

        {payload.attention.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Attention Queue
            </h4>
            <div className="space-y-2">
              {payload.attention.map((a) => (
                <AttentionPill key={a.metricId} a={a} />
              ))}
            </div>
          </div>
        )}

        {payload.attention.length === 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">No flagged items.</p>
          </div>
        )}
      </div>
    </div>
  );
}
