"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterRisks({ payload }: { payload: Payload }) {
  const items = payload.risks.slice(0, 4);

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-rose-200 overflow-hidden h-full shadow-sm rounded-2xl relative group hover:border-rose-300 transition-colors">
      <div className="absolute inset-0 bg-gradient-to-br from-rose-50/50 to-transparent pointer-events-none group-hover:from-rose-100/50 transition-all duration-500" />
      <div className="px-5 py-4 border-b border-rose-100 relative z-10 flex items-center justify-between bg-white/50">
        <div className="flex items-center gap-2">
           <AlertTriangle className="w-4 h-4 text-rose-500" />
           <h2 className="text-xs font-black text-rose-600 uppercase tracking-[0.2em]">Diagnostic Alerts</h2>
        </div>
        {items.some(i => i.severity === "high") && (
          <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-2 py-1 rounded-sm border border-rose-200 uppercase tracking-widest shadow-sm">
            Critical Signals
          </span>
        )}
      </div>
      <div className="p-5 flex flex-col gap-3 relative z-10">
        {items.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground italic">Operational posture is currently nominal.</div>
        )}
        {items.map((r, i) => (
          <div key={i} className="group/item cursor-pointer">
             <div className={cn(
               "p-3 rounded-xl border backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5",
               r.severity === "high" 
                 ? "bg-white border-rose-200 hover:shadow-[0_4px_12px_rgba(244,63,94,0.1)] hover:border-rose-300" 
                 : "bg-white border-amber-200 hover:shadow-[0_4px_12px_rgba(245,158,11,0.1)] hover:border-amber-300"
             )}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={cn(
                      "w-2 h-2 rounded-full relative z-10",
                      r.severity === "high" ? "bg-rose-500" : "bg-amber-500"
                    )} />
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-[11px] font-black uppercase tracking-widest line-clamp-1",
                      r.severity === "high" ? "text-rose-700" : "text-amber-700"
                    )}>
                      {r.label}
                    </span>
                    <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">{r.detail}</span>
                  </div>
                </div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
