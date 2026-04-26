"use client";

/**
 * IT Services hub primary visual.
 *
 * The story for ITSM is "queue motion": tickets coming in vs tickets
 * going out, with SLA compliance overlaid as the secondary trace.
 * Below the chart, four operator-grade tiles answer "where are we right
 * now?" — Open backlog, Created this period, Resolved this period, SLA
 * compliance.
 */

import type { HubPrimaryProps } from "./types";
import { HubPrimaryCard, HubStatTile, HubEmptyState, findMetric, mergeSeries, formatValue } from "./shared";
import { AreaChart, LineChart } from "@/components/charts";

export function ITServicesPrimary({ payload, granularity }: HubPrimaryProps) {
  const created = findMetric(payload, "tickets.throughput_created");
  const resolved = findMetric(payload, "tickets.throughput_resolved");
  const sla = findMetric(payload, "tickets.sla_compliance");
  const open = findMetric(payload, "tickets.open_total");

  const flowRows =
    created || resolved
      ? mergeSeries(created?.series ?? [], "created", resolved?.series ?? [], "resolved", granularity)
      : [];

  const slaRows = sla && sla.series.length > 1
    ? sla.series.map((p) => ({
        x: new Date(p.t).toLocaleDateString("en-US", {
          month: "short",
          ...(granularity === "month" ? { year: "2-digit" } : { day: "numeric" }),
        }),
        sla: p.v,
      }))
    : [];

  return (
    <HubPrimaryCard
      title="Queue motion"
      subtitle={`Tickets created vs resolved · SLA compliance overlay · ${granularity}-on-${granularity}`}
      accent="border-t-blue-600"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0">
          {flowRows.length > 1 ? (
            <AreaChart
              data={flowRows}
              xKey="x"
              areas={[
                { key: "created", label: "Created", color: "#2563eb" },
                { key: "resolved", label: "Resolved", color: "#10b981" },
              ]}
              height={240}
              grid
              legend
            />
          ) : (
            <HubEmptyState message="Ticket throughput series unavailable for this range." />
          )}
          {slaRows.length > 1 ? (
            <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-1">
                SLA compliance trend
              </p>
              <LineChart
                data={slaRows}
                xKey="x"
                lines={[{ key: "sla", label: "SLA %", color: "#7c3aed" }]}
                height={140}
                grid
                yFormatter={(v) => `${Math.round(v)}%`}
              />
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 content-start">
          <HubStatTile
            label="Open backlog"
            value={formatValue(open?.current, open?.unit, open?.state)}
            state={open?.state}
            hint={open?.target != null ? `target ${formatValue(open.target, open.unit)}` : undefined}
          />
          <HubStatTile
            label="Created this period"
            value={formatValue(created?.current, created?.unit, created?.state)}
            state={created?.state}
          />
          <HubStatTile
            label="Resolved this period"
            value={formatValue(resolved?.current, resolved?.unit, resolved?.state)}
            state={resolved?.state}
          />
          <HubStatTile
            label="SLA compliance"
            value={formatValue(sla?.current, sla?.unit ?? "percent", sla?.state)}
            state={sla?.state}
            hint={sla?.target != null ? `target ${formatValue(sla.target, sla.unit ?? "percent")}` : undefined}
          />
        </div>
      </div>
    </HubPrimaryCard>
  );
}
