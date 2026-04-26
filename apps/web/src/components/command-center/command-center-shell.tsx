"use client";

import { RefreshCw, Radio } from "lucide-react";
import { ExecutivePeriodSelect } from "@/components/dashboard/executive-dashboard-template";
import { cn } from "@/lib/utils";

/** Light, high-density dashboard canvas (reference-style; not dark-first). */
export function CommandCenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[#eef2f6] text-slate-900 -m-4 p-4 md:p-6 dark:bg-slate-950 dark:text-slate-100">
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
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm px-4 py-3 md:px-5 md:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Command Center</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Organization overview · requires <span className="font-medium text-slate-600 dark:text-slate-300">command_center.read</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border border-emerald-200/80 dark:border-emerald-800">
            <Radio className="w-3 h-3" aria-hidden />
            Live
          </span>
          <ExecutivePeriodSelect id="cc-range" value={rangeId} onChange={onRangeId} className="max-w-[min(100%,280px)]" />
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-600 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
