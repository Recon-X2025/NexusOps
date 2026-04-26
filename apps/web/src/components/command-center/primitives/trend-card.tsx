"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { TrendMiniArea } from "./trend-mini-area";
import { formatMetricValue } from "@/lib/format-metric";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

type Trend = inferRouterOutputs<AppRouter>["commandCenter"]["getView"]["trends"][number];

function deltaGood(current: number, previous: number | undefined, direction: Trend["direction"]): "good" | "bad" | "neutral" {
  if (previous === undefined || Number.isNaN(previous)) return "neutral";
  const d = current - previous;
  if (Math.abs(d) < 1e-9) return "neutral";
  const up = d > 0;
  if (direction === "higher_is_better") return up ? "good" : "bad";
  return up ? "bad" : "good";
}

function pctPrev(current: number, previous: number | undefined): number | null {
  if (previous === undefined || Number.isNaN(previous) || Math.abs(previous) < 1e-9) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function TrendCard({ t, href }: { t: Trend; href?: string }) {
  const prev = t.previous;
  const dg = deltaGood(t.current, prev, t.direction);
  const sem =
    t.state === "no_data" ? "no_data" : dg === "good" ? "healthy" : dg === "bad" ? "stressed" : "neutral";
  const pct = pctPrev(t.current, prev);
  const deltaPct =
    prev != null && t.state !== "no_data" && pct != null ? (
      <span
        className={cn(
          "text-xs font-bold tabular-nums",
          sem === "healthy" && "text-emerald-600",
          sem === "stressed" && "text-rose-600",
          sem === "neutral" && "text-slate-500",
        )}
      >
        {pct >= 0 ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
      </span>
    ) : null;

  const stroke =
    sem === "healthy" ? "#059669" : sem === "stressed" ? "#dc2626" : sem === "no_data" ? "#94a3b8" : "#d97706";

  const borderAccent =
    sem === "healthy" ? "border-l-emerald-500" : sem === "stressed" ? "border-l-rose-500" : sem === "no_data" ? "border-l-slate-300" : "border-l-amber-500";

  const inner = (
    <div
      className={cn(
        "rounded-xl bg-white border border-slate-200/90 shadow-sm overflow-hidden h-full border-l-[4px]",
        borderAccent,
      )}
    >
      <div className="p-3.5">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide line-clamp-2">{t.label}</div>
        <div className="flex items-baseline justify-between gap-2 mt-1.5">
          <div className="text-xl font-bold tabular-nums text-slate-900">
            {formatMetricValue(t.current, t.unit, t.state, { compact: true })}
          </div>
          {deltaPct}
        </div>
        <div className="mt-2 -mx-0.5">
          <TrendMiniArea series={t.series.length ? t.series : [{ t: "—", v: 0 }]} color={stroke} />
        </div>
        {t.state === "no_data" ? <p className="text-[11px] text-slate-400 mt-1.5">Insufficient data</p> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
        {inner}
      </Link>
    );
  }
  return inner;
}
