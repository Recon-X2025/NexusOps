"use client";

import { RefreshCw, Radio, Zap } from "lucide-react";
import { ExecutivePeriodSelect } from "@/components/dashboard/executive-dashboard-template";
import { cn } from "@/lib/utils";

/** Premium light dashboard canvas */
export function CommandCenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 text-slate-900 -m-4 p-4 md:p-6 dark:bg-slate-950 dark:text-slate-100">
      {children}
    </div>
  );
}

export function CommandCenterBar({
  rangeId,
  onRangeId,
  onRefresh,
  isFetching,
}: {
  rangeId: string;
  onRangeId: (id: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 mb-5">
      <div className="rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Gradient accent band */}
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400" />
        <div className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md shadow-blue-200">
              <Zap className="w-4 h-4 text-white" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none">
                Command Center
              </h1>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                Organisation-wide operational intelligence
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border border-emerald-200">
              <Radio className="w-2.5 h-2.5 animate-pulse" aria-hidden />
              Live
            </span>
            <ExecutivePeriodSelect id="cc-range" value={rangeId} onChange={onRangeId} className="max-w-[min(100%,280px)]" />
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-slate-500", isFetching && "animate-spin")} aria-hidden />
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
