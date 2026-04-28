"use client";

import { RefreshCw, Radio, Zap } from "lucide-react";
import { ExecutivePeriodSelect } from "@/components/dashboard/executive-dashboard-template";
import { cn } from "@/lib/utils";

/** Premium light dashboard canvas */
export function CommandCenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f8fafc] text-slate-900 -m-4 p-2 dark:bg-slate-950 dark:text-slate-100 flex flex-col gap-2">
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
    <div className="sticky top-0 z-20 mb-2">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <h1 className="text-[14px] font-bold tracking-tight text-slate-700 leading-none">
            Command Center
          </h1>
          <div className="h-3 w-px bg-slate-300 mx-1" />
          <p className="text-[10px] text-slate-500 font-medium">
            Organisation Intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExecutivePeriodSelect id="cc-range" value={rangeId} onChange={onRangeId} className="h-7 text-[10px] min-w-[140px]" />
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
