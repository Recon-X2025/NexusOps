import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Payload = inferRouterOutputs<AppRouter>["commandCenter"]["getView"];

const HEATMAP_DIMS = ["volume", "sla", "risk", "trend"] as const;

/** Counts heatmap cells by posture for donut / summary charts. */
export function heatmapPostureMix(payload: Payload): { name: string; value: number; color: string }[] {
  const counts = { healthy: 0, watch: 0, stressed: 0, no_data: 0 };
  for (const row of payload.heatmap) {
    for (const dim of HEATMAP_DIMS) {
      counts[row.cells[dim].state]++;
    }
  }
  const out = [
    { name: "Healthy", value: counts.healthy, color: "#16a34a" },
    { name: "Watch", value: counts.watch, color: "#ea580c" },
    { name: "Stressed", value: counts.stressed, color: "#dc2626" },
    { name: "No data", value: counts.no_data, color: "#94a3b8" },
  ];
  return out.filter((d) => d.value > 0);
}

export type TrendDeckLine = {
  key: string;
  label: string;
  color: string;
  /** Payload field holding the unscaled metric value for tooltips. */
  valueDataKey: string;
  formatValue: (n: number) => string;
};

function formatTrendTooltipValue(unit: string | undefined, n: number): string {
  if (!Number.isFinite(n)) return "—";
  switch (unit) {
    case "currency_inr":
      return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    case "ratio":
      return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    case "percent":
      return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "count":
    default:
      return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
}

/**
 * Multi-series area data for the Command Center trend deck.
 * Values are min–max normalized per series (0–100) so different units (INR vs ratios vs headcount)
 * remain visible on one chart; tooltips show real values via `valueDataKey`.
 */
export function buildTrendLinesData(
  payload: Payload,
  maxMetrics = 5,
): { data: Record<string, unknown>[]; lines: TrendDeckLine[] } {
  const withData = payload.trends.filter((t) => t.series.length > 1 && t.state !== "no_data");
  const take = withData.slice(0, maxMetrics);
  if (take.length === 0) {
    return { data: [], lines: [] };
  }
  const len = Math.max(...take.map((t) => t.series.length));
  const data: Record<string, unknown>[] = [];
  for (let i = 0; i < len; i++) {
    const row: Record<string, unknown> = { x: take[0]!.series[i]?.t ?? `P${i + 1}` };
    for (let j = 0; j < take.length; j++) {
      const v = take[j]!.series[i]?.v;
      row[`m${j}`] = v === undefined || v === null ? null : Number(v);
    }
    data.push(row);
  }

  const colors = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#7c3aed"];
  const lines: TrendDeckLine[] = take.map((t, j) => {
    const rawKey = `m${j}_raw`;
    const vals = data
      .map((r) => r[`m${j}`] as number | null)
      .filter((x): x is number => x != null && Number.isFinite(x));
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const raw = row[`m${j}`] as number | null;
      row[rawKey] = raw;
      if (raw == null || !Number.isFinite(raw)) {
        row[`m${j}`] = null;
      } else if (max === min) {
        row[`m${j}`] = 50;
      } else {
        row[`m${j}`] = ((raw - min) / (max - min)) * 100;
      }
    }
    const unit = t.unit;
    return {
      key: `m${j}`,
      label: t.label.length > 26 ? `${t.label.slice(0, 24)}…` : t.label,
      color: colors[j % colors.length]!,
      valueDataKey: rawKey,
      formatValue: (n: number) => formatTrendTooltipValue(unit, n),
    };
  });

  return { data, lines };
}

export function flowThroughputRecords(payload: Payload): Record<string, unknown>[] {
  return payload.flow.map((f) => ({
    name: f.label.length > 18 ? `${f.label.slice(0, 16)}…` : f.label,
    Created: f.created,
    Resolved: f.resolved,
  }));
}

export function bulletsTargetBars(payload: Payload): Record<string, unknown>[] {
  return payload.bullets
    .filter((b) => b.state !== "no_data" && b.target != null)
    .slice(0, 8)
    .map((b) => ({
      name: b.label.length > 22 ? `${b.label.slice(0, 20)}…` : b.label,
      Current: b.current,
      Target: b.target as number,
    }));
}
