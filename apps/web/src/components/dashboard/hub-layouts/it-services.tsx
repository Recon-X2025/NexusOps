"use client";

/**
 * IT Services hub primary visual.
 *
 * Dual-pane: left = SLA burn-down bar chart by priority, right = live queue table with SLA countdown badges
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubStatTile, HubEmptyState, findMetric, mergeSeries, formatValue } from "./shared";
import { AreaChart, BarChart } from "@/components/charts";

export function ITServicesPrimary({ payload, granularity }: HubPrimaryProps) {
  const created = findMetric(payload, "tickets.throughput_created");
  const resolved = findMetric(payload, "tickets.throughput_resolved");
  const sla = findMetric(payload, "tickets.sla_compliance");
  const open = findMetric(payload, "tickets.open_total");

  const flowRows =
    created || resolved
      ? mergeSeries(created?.series ?? [], "created", resolved?.series ?? [], "resolved", granularity)
      : [];

  const mutedGrey = "hsl(220, 14%, 55%)"; // Muted Grey (Darker for contrast)

  return (
    <HubPrimaryCard
      title="IT Status"
      subtitle={`Ticket throughput and SLA performance · ${granularity}-on-${granularity}`}
      accent="from-blue-500 to-sky-400"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Main Throughput Chart */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Throughput Trend</h3>
            {flowRows.length > 1 ? (
              <AreaChart
                data={flowRows}
                xKey="x"
                areas={[
                  { key: "created", label: "Created", color: "#3b82f6" },
                  { key: "resolved", label: "Resolved", color: "#10b981" },
                ]}
                height={220}
                grid
                legend
              />
            ) : (
              <HubEmptyState message="Ticket throughput series unavailable." />
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Key Indicators</h3>
          <HubStatTile
            label="Open Backlog"
            value={formatValue(open?.current, open?.unit, open?.state)}
            state={open?.state}
            hint={open?.target != null ? `target ${formatValue(open.target, open.unit)}` : undefined}
          />
          <HubStatTile
            label="SLA Compliance"
            value={formatValue(sla?.current, sla?.unit ?? "percent", sla?.state)}
            state={sla?.state}
            hint={sla?.target != null ? `target ${formatValue(sla.target, sla.unit ?? "percent")}` : undefined}
          />
          <HubStatTile
            label="Created (Period)"
            value={formatValue(created?.current, created?.unit, created?.state)}
            state={created?.state}
          />
          <HubStatTile
            label="Resolved (Period)"
            value={formatValue(resolved?.current, resolved?.unit, resolved?.state)}
            state={resolved?.state}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}
