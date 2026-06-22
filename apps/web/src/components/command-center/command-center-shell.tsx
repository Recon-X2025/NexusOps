"use client";

import { RefreshCw, Zap } from "lucide-react";
import { ExecutivePeriodSelect } from "@/components/dashboard/executive-dashboard-template";
import { cn } from "@/lib/utils";

/** Premium light Coheron brand dashboard canvas */
export function CommandCenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-64px)] relative bg-slate-50 text-slate-900 -m-4 p-4 overflow-hidden flex flex-col gap-4 font-sans">
      {/* Background Orbs (Coheron Light) */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#00BCFF]/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#00C971]/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-4">
        {children}
      </div>
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
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl px-6 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00BCFF]/10 border border-[#00BCFF]/20 rounded-lg">
            <Zap className="w-5 h-5 text-[#00BCFF]" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">
              CoheronConnect Control
            </h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              Live Organisational Intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
          <ExecutivePeriodSelect id="cc-range" value={rangeId} onChange={onRangeId} className="h-8 text-xs min-w-[140px] bg-transparent border-none text-slate-700 focus:ring-0" />
          <div className="w-px h-5 bg-slate-300" />
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            Sync
          </button>
        </div>
      </div>
    </div>
  );
}
