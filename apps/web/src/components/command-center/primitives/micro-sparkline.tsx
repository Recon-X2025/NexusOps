"use client";

/** Compact trend glyph for KPI tiles (reference-style sparkline). */
export function MicroSparkline({
  values,
  color = "#2563eb",
  width = 72,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const pts = values.length >= 2 ? values : [...values, values[0] ?? 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const path = pts
    .map((v, i) => {
      const x = pad + (i / Math.max(pts.length - 1, 1)) * (width - pad * 2);
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
