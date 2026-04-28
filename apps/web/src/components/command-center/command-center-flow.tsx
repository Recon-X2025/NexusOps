"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { Zap } from "lucide-react";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

export function CommandCenterFlow({ payload }: { payload: Payload }) {
  // Mock futuristic flow data
  const mockFlow = [
    { label: "Incoming Vectors", value: "1,240/s", color: "#00BCFF" },
    { label: "Processing Nodes", value: "84 Active", color: "#004FFB" },
    { label: "Resolved Output", value: "1,238/s", color: "#00C971" },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 overflow-hidden h-full shadow-sm rounded-2xl relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#00BCFF]/5 to-[#004FFB]/5 pointer-events-none" />
      <div className="px-5 py-4 border-b border-slate-200/60 relative z-10 flex justify-between items-center">
        <h2 className="text-xs font-black text-slate-700 uppercase tracking-[0.2em]">Throughput Matrix</h2>
        <div className="animate-pulse bg-[#00BCFF]/10 p-1 rounded-full border border-[#00BCFF]/20">
          <Zap className="w-3 h-3 text-[#00BCFF]" />
        </div>
      </div>
      <div className="p-5 min-h-[160px] relative z-10 flex flex-col justify-between">
        
        {/* Animated Particle Stream Mockup */}
        <div className="relative h-24 w-full bg-slate-50/80 rounded-xl overflow-hidden border border-slate-200/50 flex items-center shadow-inner">
           {/* Stream lines */}
           <div className="absolute inset-0 opacity-20 bg-[linear-gradient(90deg,transparent_25%,rgba(0,188,255,0.2)_50%,transparent_75%)] bg-[length:200%_100%] animate-[flow_2s_linear_infinite]" />
           
           <div className="w-full flex justify-between px-4 z-10">
              <div className="flex flex-col items-center gap-1">
                 <div className="w-12 h-12 rounded-full border border-[#00BCFF]/30 shadow-[0_2px_10px_rgba(0,188,255,0.2)] bg-white flex items-center justify-center">
                   <div className="w-8 h-8 bg-[#00BCFF] rounded-full animate-pulse shadow-[0_0_8px_rgba(0,188,255,0.4)]" />
                 </div>
              </div>
              <div className="flex-1 border-t-2 border-dashed border-slate-300 my-auto mx-2 relative">
                <div className="absolute top-[-5px] left-1/4 w-2 h-2 rounded-full bg-[#004FFB] shadow-[0_2px_4px_rgba(0,79,251,0.4)] animate-[ping_1.5s_infinite]" />
                <div className="absolute top-[-5px] left-2/4 w-2 h-2 rounded-full bg-[#00BCFF] shadow-[0_2px_4px_rgba(0,188,255,0.4)] animate-[ping_2s_infinite]" />
                <div className="absolute top-[-5px] left-3/4 w-2 h-2 rounded-full bg-[#00C971] shadow-[0_2px_4px_rgba(0,201,113,0.4)] animate-[ping_1.2s_infinite]" />
              </div>
              <div className="flex flex-col items-center gap-1">
                 <div className="w-12 h-12 rounded-full border border-[#00C971]/30 shadow-[0_2px_10px_rgba(0,201,113,0.2)] bg-white flex items-center justify-center">
                   <div className="w-8 h-8 bg-[#00C971] rounded-full animate-pulse shadow-[0_0_8px_rgba(0,201,113,0.4)]" />
                 </div>
              </div>
           </div>
        </div>

        <div className="flex justify-between mt-4">
          {mockFlow.map((f, i) => (
            <div key={i} className="flex flex-col gap-1 items-center">
               <span className="text-xl font-black text-slate-900 drop-shadow-sm">{f.value}</span>
               <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{f.label}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
