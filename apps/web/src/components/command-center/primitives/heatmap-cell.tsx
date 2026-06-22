"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/** Light-dashboard heatmap fills (high contrast on white grid). */
const FILL: Record<string, string> = {
  healthy: "bg-emerald-100 hover:bg-emerald-200/90",
  watch: "bg-amber-100 hover:bg-amber-200/90",
  stressed: "bg-rose-100 hover:bg-rose-200/90",
  no_data: "bg-slate-100 hover:bg-slate-200/80",
};

const TEXT: Record<string, string> = {
  healthy: "text-emerald-900",
  watch: "text-amber-900",
  stressed: "text-rose-900",
  no_data: "text-slate-500",
};

export function HeatmapCell({
  label,
  state,
  display,
  href,
  ariaLabel,
}: {
  label: string;
  state: "healthy" | "watch" | "stressed" | "no_data";
  display: string;
  href?: string;
  ariaLabel?: string;
}) {
  const inner = (
    <div
      className={cn(
        "rounded-lg px-2.5 py-2.5 min-h-[56px] flex flex-col justify-center border border-slate-200/80 transition shadow-sm",
        "hover:shadow-md hover:z-10 hover:ring-2 hover:ring-blue-400/30",
        FILL[state],
      )}
    >
      <div className={cn("text-[10px] font-semibold uppercase tracking-wide truncate", TEXT[state])}>{label}</div>
      <div className={cn("text-sm font-bold tabular-nums mt-0.5", TEXT[state])}>{display}</div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg" aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-lg focus:outline-none" aria-label={ariaLabel}>
      {inner}
    </div>
  );
}
