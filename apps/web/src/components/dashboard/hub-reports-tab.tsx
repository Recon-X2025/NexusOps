"use client";

/**
 * HubReportsTab — the "Analytics & Reporting" tab content rendered inside
 * each hub Overview. It feeds off the same `commandCenter.getHubView`
 * payload as the dashboard tab, so there's no second resolver fan-out
 * when the user toggles tabs. Output is intentionally tabular + dense
 * (rows per metric, posture pill, current vs target, sparkline, drill
 * link) — operators want a list they can scan, filter, and export, not
 * another set of cards.
 */

import Link from "next/link";
import { Download, ArrowUpRight } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";
import { MicroSparkline } from "@/components/command-center/primitives/micro-sparkline";
import { cn } from "@/lib/utils";
import { formatMetricValue } from "@/lib/format-metric";

const STATE_STROKE: Record<string, string> = {
  healthy: "#10b981",
  watch: "#f59e0b",
  stressed: "#ef4444",
  no_data: "#94a3b8",
};

type HubPayload = inferRouterOutputs<AppRouter>["commandCenter"]["getHubView"];
type Bullet = HubPayload["bullets"][number];
type Trend = HubPayload["trends"][number];

const STATE_PILL: Record<Bullet["state"], string> = {
  healthy: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  watch: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  stressed: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  no_data: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

/** Reports table rows want full precision (no compact suffix). */
function formatValue(value: number, unit?: string, state?: string) {
  return formatMetricValue(value, unit, state, { compact: false });
}

function targetGap(b: Bullet): string {
  if (b.target == null || b.state === "no_data") return "—";
  const delta = b.current - b.target;
  if (Math.abs(delta) < 0.05) return "on target";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatValue(delta, b.unit)}`;
}

/**
 * Build a unified row list. We include every metric the hub payload
 * surfaces — bullets give us current+target+state+drill, and we attach
 * the matching trend's series (if any) for the inline sparkline.
 */
function buildRows(payload: HubPayload) {
  const trendBy = new Map<string, Trend>();
  for (const t of payload.trends) trendBy.set(t.metricId, t);

  // Bullets are the canonical "key metric" list per hub. Trends without a
  // matching bullet still belong on the report (they describe motion even
  // if no target is registered).
  const seen = new Set<string>();
  const rows: Array<{
    metricId: string;
    label: string;
    current: number;
    target?: number;
    unit?: string;
    state: Bullet["state"];
    direction: Bullet["direction"];
    drillUrl?: string;
    series: Trend["series"];
  }> = [];

  for (const b of payload.bullets) {
    seen.add(b.metricId);
    rows.push({
      metricId: b.metricId,
      label: b.label,
      current: b.current,
      target: b.target,
      unit: b.unit,
      state: b.state,
      direction: b.direction,
      drillUrl: b.drillUrl,
      series: trendBy.get(b.metricId)?.series ?? [],
    });
  }
  for (const t of payload.trends) {
    if (seen.has(t.metricId)) continue;
    rows.push({
      metricId: t.metricId,
      label: t.label,
      current: t.current,
      unit: t.unit,
      state: t.state,
      direction: t.direction,
      drillUrl: t.drillUrl,
      series: t.series,
    });
  }
  return rows;
}

function exportCsv(rows: ReturnType<typeof buildRows>, filename: string) {
  const header = ["Metric", "Current", "Target", "Unit", "State", "Direction", "Drill"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      JSON.stringify(r.label),
      r.state === "no_data" ? "" : String(r.current),
      r.target != null ? String(r.target) : "",
      r.unit ?? "",
      r.state,
      r.direction,
      r.drillUrl ?? "",
    ];
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function HubReportsTab({ payload, hubTitle }: { payload: HubPayload; hubTitle: string }) {
  const rows = buildRows(payload);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm p-8 text-center text-sm text-slate-500 dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-400">
        No metrics registered for this hub yet. Once metric resolvers are
        contributed for {hubTitle}, this report will populate automatically.
      </div>
    );
  }

  const fileBase = hubTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-sm dark:bg-slate-900/80 dark:border-slate-700 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 md:px-5 md:py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
              {hubTitle} — analytics &amp; reporting
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {rows.length} metric{rows.length === 1 ? "" : "s"} in scope · current vs target with motion
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(rows, `${fileBase}-report-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-semibold py-2 px-4">Metric</th>
                <th className="text-right font-semibold py-2 px-4">Current</th>
                <th className="text-right font-semibold py-2 px-4">Target</th>
                <th className="text-right font-semibold py-2 px-4">Δ vs target</th>
                <th className="text-left font-semibold py-2 px-4">Posture</th>
                <th className="text-left font-semibold py-2 px-4 w-[160px]">Trend</th>
                <th className="text-right font-semibold py-2 px-4">Drill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.metricId} className="text-slate-800 dark:text-slate-200 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-medium">{r.label}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{formatValue(r.current, r.unit, r.state)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {r.target != null ? formatValue(r.target, r.unit) : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-600 dark:text-slate-300">{targetGap(r)}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize",
                        STATE_PILL[r.state],
                      )}
                    >
                      {r.state.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    {r.series.length > 1 ? (
                      <MicroSparkline
                        values={r.series.map((p) => p.v)}
                        color={STATE_STROKE[r.state] ?? STATE_STROKE.watch!}
                        width={140}
                        height={32}
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {r.drillUrl ? (
                      <Link
                        href={r.drillUrl}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        Open
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
