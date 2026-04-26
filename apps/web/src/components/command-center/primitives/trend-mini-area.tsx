"use client";

import { useId } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";

export function TrendMiniArea({
  series,
  color,
}: {
  series: Array<{ t: string; v: number }>;
  color: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `cc-trend-${uid}`;
  const data = series.length >= 2 ? series : [...series, { t: "·", v: series[0]?.v ?? 0 }];

  return (
    <ResponsiveContainer width="100%" height={104}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: -20, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] shadow-lg">
                <div className="font-medium text-slate-800">{label}</div>
                <div className="tabular-nums text-slate-600">{payload[0]?.value as number}</div>
              </div>
            ) : null
          }
        />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
