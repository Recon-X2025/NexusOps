"use client";

/**
 * Recharts wrapper components.
 * All wrappers are responsive-by-default (ResponsiveContainer), dark-mode aware,
 * and accept a minimal, typed props API.
 */

import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  BarChart as RBarChart,
  Bar,
  AreaChart as RAreaChart,
  Area,
  PieChart as RPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  TooltipProps,
} from "recharts";

// ── Shared colour palette (consistent across all charts) ─────────────────────
export const CHART_COLORS = [
  "hsl(196, 100%, 45%)", // CoheronConnect Blue (Purposeful)
  "hsl(224, 71%, 15%)",  // Deep Executive Navy
  "hsl(220, 14%, 46%)",  // Slate Professional
  "hsl(161, 94%, 25%)",  // Emerald Diagnostic (Success)
  "hsl(38, 92%, 45%)",   // Amber Signal (Warning)
  "hsl(350, 89%, 55%)",  // Rose Alert (Critical)
  "hsl(196, 100%, 30%)", // Deep Ocean
  "hsl(220, 14%, 55%)",  // Muted Grey (Darker for contrast)
];

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.dataKey as string} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name ?? entry.dataKey}:</span>
          <span className="font-medium text-foreground">{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── LineChart ─────────────────────────────────────────────────────────────────
export interface LineChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  lines: { key: string; label?: string; color?: string }[];
  height?: number;
  grid?: boolean;
  legend?: boolean;
  yFormatter?: (v: number) => string;
}

export function LineChart({
  data,
  xKey,
  lines,
  height = 200,
  grid = true,
  legend = false,
  yFormatter,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {grid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />}
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFormatter} width={yFormatter ? 48 : 36} />
        <Tooltip content={<ChartTooltip />} />
        {legend && <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--foreground))" }} />}
        {lines.map((l, i) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label ?? l.key}
            stroke={l.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </RLineChart>
    </ResponsiveContainer>
  );
}

// ── BarChart ──────────────────────────────────────────────────────────────────
export interface BarChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; label?: string; color?: string }[];
  height?: number;
  grid?: boolean;
  legend?: boolean;
  horizontal?: boolean;
  yFormatter?: (v: number) => string;
}

export function BarChart({
  data,
  xKey,
  bars,
  height = 200,
  grid = true,
  legend = false,
  horizontal = false,
  yFormatter,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
      >
        {grid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />}
        {horizontal ? (
          <>
            <YAxis dataKey={xKey} type="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={80} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFormatter} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFormatter} width={36} />
          </>
        )}
        <Tooltip content={<ChartTooltip />} />
        {legend && <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--foreground))" }} />}
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label ?? b.key}
            fill={b.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
          />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}

// ── AreaChart ─────────────────────────────────────────────────────────────────
export interface AreaChartAreaConfig {
  key: string;
  label?: string;
  color?: string;
  /** When set, tooltip shows this payload field (actual value) instead of the scaled `key` value. */
  valueDataKey?: string;
  formatValue?: (n: number) => string;
}

export interface AreaChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  areas: AreaChartAreaConfig[];
  height?: number;
  grid?: boolean;
  legend?: boolean;
  stacked?: boolean;
  yFormatter?: (v: number) => string;
}

type AreaTooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
};

function AreaChartTooltip({
  active,
  payload,
  label,
  areas,
}: {
  active?: boolean;
  payload?: AreaTooltipEntry[];
  label?: string;
  areas: AreaChartAreaConfig[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      {label != null && label !== "" && (
        <p className="font-semibold text-foreground mb-1">{String(label)}</p>
      )}
      {payload.map((entry) => {
        const key = entry.dataKey != null ? String(entry.dataKey) : "";
        const cfg = areas.find((a) => a.key === key);
        const rawKey = cfg?.valueDataKey;
        const pl = entry.payload;
        const raw = rawKey && pl && rawKey in pl ? pl[rawKey] : entry.value;
        const num = typeof raw === "number" ? raw : Number(raw);
        const text =
          cfg?.formatValue && Number.isFinite(num)
            ? cfg.formatValue(num)
            : Number.isFinite(num)
              ? num.toLocaleString()
              : String(raw ?? "—");
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name ?? key}:</span>
            <span className="font-medium text-foreground">{text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AreaChart({
  data,
  xKey,
  areas,
  height = 200,
  grid = true,
  legend = false,
  stacked = false,
  yFormatter,
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {grid && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />}
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFormatter} width={yFormatter ? 44 : 36} />
        <Tooltip
          content={({ active, payload, label }) => (
            <AreaChartTooltip
              active={active}
              payload={payload as AreaTooltipEntry[] | undefined}
              label={label != null ? String(label) : undefined}
              areas={areas}
            />
          )}
        />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {areas.map((a, i) => {
          const color = a.color ?? CHART_COLORS[i % CHART_COLORS.length];
          const gradId = `area-grad-${i}`;
          return (
            <Area
              key={a.key}
              type="monotone"
              dataKey={a.key}
              name={a.label ?? a.key}
              stroke={color}
              fill={`url(#${gradId})`}
              strokeWidth={2}
              stackId={stacked ? "s" : undefined}
            />
          );
        })}
        <defs>
          {areas.map((a, i) => {
            const color = a.color ?? CHART_COLORS[i % CHART_COLORS.length];
            return (
              <linearGradient key={i} id={`area-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
      </RAreaChart>
    </ResponsiveContainer>
  );
}

// ── DonutChart ────────────────────────────────────────────────────────────────
export interface DonutChartProps {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  legend?: boolean;
  /** Text in the donut hole */
  centreLabel?: string;
  centreValue?: string;
}

export function DonutChart({
  data,
  height = 200,
  innerRadius = 55,
  outerRadius = 80,
  legend = false,
  centreLabel,
  centreValue,
}: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {centreValue && (
          <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 dark:fill-slate-100">
            <tspan fontSize={20} fontWeight={700}>{centreValue}</tspan>
          </text>
        )}
        {centreLabel && (
          <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-500 dark:fill-slate-400">
            <tspan fontSize={10}>{centreLabel}</tspan>
          </text>
        )}
      </RPieChart>
    </ResponsiveContainer>
  );
}

// ── Sparkline (mini inline chart with no axes) ────────────────────────────────
export interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

export function Sparkline({ data, color = "hsl(var(--primary))", height = 40, width = 120 }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <RLineChart data={chartData} width={width} height={height} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </RLineChart>
  );
}
