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

type ScoreState = "awaiting_data" | "healthy" | "watch" | "stressed";

/** Red/Amber/Green health presentation for the org rollup title. */
const HEALTH_RAG: Record<ScoreState, { title: string; dot: string; label: string }> = {
  healthy: { title: "text-[#00A15C]", dot: "bg-[#00C971]", label: "Nominal" },
  watch: { title: "text-amber-600", dot: "bg-amber-500", label: "Watch" },
  stressed: { title: "text-rose-600", dot: "bg-rose-500", label: "Critical" },
  awaiting_data: { title: "text-slate-400", dot: "bg-slate-300", label: "Awaiting data" },
};

export function CommandCenterBar({
  rangeId,
  onRangeId,
  onRefresh,
  isFetching,
  scoreState = "awaiting_data",
  scoreSubtext,
}: {
  rangeId: string;
  onRangeId: (id: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
  scoreState?: ScoreState;
  scoreSubtext?: string | null;
}) {
  const rag = HEALTH_RAG[scoreState];
  return (
    <div className="sticky top-0 z-20 mb-2">
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl px-6 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00BCFF]/10 border border-[#00BCFF]/20 rounded-lg shrink-0">
            <Zap className="w-5 h-5 text-[#00BCFF]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className={cn("text-h4 font-black tracking-tight transition-colors whitespace-nowrap", rag.title)}>
                CoheronConnect Control
              </h1>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/70 px-2 py-0.5 shrink-0"
                title={scoreSubtext ?? undefined}
              >
                <span className={cn("w-2 h-2 rounded-full", rag.dot)} />
                <span className={cn("text-[10px] font-bold uppercase tracking-wider whitespace-nowrap", rag.title)}>
                  {rag.label}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              {scoreSubtext ?? "Live Organisational Intelligence"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
          <ExecutivePeriodSelect id="cc-range" value={rangeId} onChange={onRangeId} className="h-8 text-caption min-w-[140px] bg-transparent border-none text-slate-700 focus:ring-0" />
          <div className="w-px h-5 bg-slate-300" />
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-caption font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            Sync
          </button>
        </div>
      </div>
    </div>
  );
}
