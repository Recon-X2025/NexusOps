"use client";

import { cn } from "@/lib/utils";

export function BulletBar({
  value,
  max,
  targetFrac,
  invert,
  ariaLabel,
}: {
  value: number;
  max: number;
  targetFrac?: number;
  invert?: boolean;
  ariaLabel: string;
}) {
  const cap = max > 0 ? max : 1;
  let frac = value / cap;
  if (invert) frac = 1 - frac;
  frac = Math.min(1, Math.max(0, frac));
  const fill = invert ? "#64748b" : "#059669";
  return (
    <div
      className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 relative"
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(frac * 100)}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${frac * 100}%`, backgroundColor: fill }}
      />
      {targetFrac != null ? (
        <div
          className="absolute top-[-3px] w-px h-4 bg-[#001B3D] dark:bg-slate-200 opacity-70"
          style={{ left: `${Math.min(100, Math.max(0, targetFrac * 100))}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
