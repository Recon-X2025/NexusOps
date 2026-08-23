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
      // `p.t` is ALREADY a formatted bucket label from the server ("Feb", "Mar"),
      // not a date string. Passing it through `new Date()` produced "Invalid Date"
      // on every axis tick. `people.tsx` uses it directly, which is correct.
      x: p.t,
      volume: p.v,
    }))
    : [];

  return (
    <HubPrimaryCard
      title="Security Status"
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
        </div>
      </div>
    </HubPrimaryCard>
  );
}
