"use client";

/**
 * Security & Compliance hub primary visual.
 *
 * Top = threat volume area timeline, bottom = MITRE ATT&CK tactic coverage heatmap grid
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubEmptyState, findMetric, formatValue, HubStatTile } from "./shared";
import { AreaChart } from "@/components/charts";
import { cn } from "@/lib/utils";

export function SecurityPrimary({ payload, granularity }: HubPrimaryProps) {
  const critical = findMetric(payload, "security.critical_open");
  const incidents = findMetric(payload, "security.incidents_open_total");

  const threatRows = incidents && incidents.series && incidents.series.length > 1
    ? incidents.series.map((p) => ({
      x: new Date(p.t).toLocaleDateString("en-US", {
        month: "short",
        ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
      }),
      volume: p.v,
    }))
    : [];

  // Mock MITRE coverage data
  const mitreTactics = [
    { name: "Initial Access", coverage: 85 },
    { name: "Execution", coverage: 92 },
    { name: "Persistence", coverage: 78 },
    { name: "Privilege Esc", coverage: 64 },
    { name: "Defense Evasion", coverage: 88 },
    { name: "Credential Access", coverage: 72 },
    { name: "Discovery", coverage: 95 },
    { name: "Lateral Movement", coverage: 58 },
  ];

  return (
    <HubPrimaryCard
      title="Threat Landscape & Posture"
      subtitle={`Incident volume and MITRE ATT&CK coverage · ${granularity}-on-${granularity}`}
      accent="from-rose-500 to-red-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Threat Volume Timeline */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Incident Volume Timeline</h3>
            {threatRows.length > 1 ? (
              <AreaChart
                data={threatRows}
                xKey="x"
                areas={[{ key: "volume", label: "Incidents", color: "#ef4444" }]}
                height={200}
                grid
              />
            ) : (
              <HubEmptyState message="Threat volume series unavailable." />
            )}
          </div>

          {/* MITRE Grid */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">MITRE ATT&CK Tactic Coverage</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {mitreTactics.map((t) => (
                <div key={t.name} className="p-2 rounded-lg bg-white border border-slate-100 shadow-sm">
                  <div className="text-[9px] font-bold text-slate-400 uppercase truncate mb-1">{t.name}</div>
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-black text-slate-800">{t.coverage}%</span>
                    <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden mb-1">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          t.coverage > 80 ? "bg-emerald-500" : t.coverage > 60 ? "bg-amber-500" : "bg-rose-500"
                        )}
                        style={{ width: `${t.coverage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Security KPIs</h3>
          <HubStatTile
            label="Critical Vulnerabilities"
            value={formatValue(critical?.current, critical?.unit, critical?.state)}
            state={critical?.state}
          />
          <HubStatTile
            label="Active Incidents"
            value={formatValue(incidents?.current, incidents?.unit, incidents?.state)}
            state={incidents?.state}
          />

          <div className="mt-4 space-y-3">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100">
              <h4 className="text-xs font-bold text-rose-800 mb-2">High Risk Assets</h4>
              <ul className="text-[11px] space-y-1.5">
                <li className="flex justify-between text-rose-700">
                  <span>Core Banking DB</span>
                  <span className="font-bold">Critical</span>
                </li>
                <li className="flex justify-between text-rose-700">
                  <span>Edge Gateway 04</span>
                  <span className="font-bold">High</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 text-white shadow-lg">
              <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Compliance Score</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black">92.4</span>
                <span className="text-slate-500 text-sm">/ 100</span>
              </div>
              <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '92.4%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </HubPrimaryCard>
  );
}
