"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { executiveDefaultQuickRangeId } from "@/lib/executive-quick-ranges";
import { ExecutivePeriodPicker } from "@/components/dashboard/executive-period-picker";

/** Page shell: full-bleed executive background inside padded app main. */
export function ExecutiveDashShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "-m-4 min-h-full bg-[#F0F4F8] dark:bg-slate-950 p-5 md:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

const ACCENT_BAR: Record<string, string> = {
  blue: "bg-blue-600",
  emerald: "bg-emerald-600",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-600",
  cyan: "bg-cyan-600",
  orange: "bg-orange-500",
  slate: "bg-slate-600",
  indigo: "bg-indigo-600",
  teal: "bg-teal-600",
};

export function ExecutiveDashHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between border-b border-[#001B3D]/12 dark:border-slate-700 pb-4 mb-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#001B3D] dark:text-slate-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-xs md:text-sm font-semibold text-amber-700 dark:text-amber-400/90 mt-1 max-w-3xl leading-snug">
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-2 shrink-0 mt-2 sm:mt-0">{right}</div> : null}
    </div>
  );
}

/** Hub breadcrumb header (Platform → Hub) with executive typography. */
export function ExecutiveHubHeader({
  icon: Icon,
  iconWrapClassName,
  breadcrumbHref,
  breadcrumbLabel,
  hubTrailLabel,
  title,
  subtitle = "From operational signals to business impact — live metrics for this hub.",
  rightHint,
  right,
}: {
  icon: ElementType;
  iconWrapClassName: string;
  breadcrumbHref: string;
  breadcrumbLabel?: string;
  hubTrailLabel: string;
  title: string;
  subtitle?: string;
  rightHint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-[#001B3D]/10 dark:border-slate-700 pb-4 mb-1">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0",
            iconWrapClassName,
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#001B3D]/55 dark:text-slate-400">
            <Link href={breadcrumbHref} className="hover:text-[#001B3D] dark:hover:text-slate-200 font-medium">
              {breadcrumbLabel ?? "Platform"}
            </Link>
            <ChevronRight className="w-3 h-3 opacity-60" />
            <span className="text-[#001B3D]/75 dark:text-slate-300">{hubTrailLabel}</span>
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-[#001B3D] dark:text-slate-100 mt-0.5">
            {title}
          </h1>
          <p className="text-[11px] md:text-xs font-semibold text-amber-700 dark:text-amber-400/90 mt-1 max-w-2xl leading-snug">
            {subtitle}
          </p>
        </div>
      </div>
      {right ? (
        <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">{right}</div>
      ) : rightHint ? (
        <span className="text-[10px] text-[#001B3D]/40 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
          {rightHint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Drop-in time-range picker used across executive dashboards. Delegates
 * to {@link ExecutivePeriodPicker} which renders a popover with preset
 * groups + an inline two-month calendar for custom range selection.
 * The string `value` channel still carries either a preset id or a
 * `custom:YYYY-MM-DD:YYYY-MM-DD` token, so existing callers don't need
 * to track separate "custom range" state.
 */
export function ExecutivePeriodSelect({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  /** e.g. max-w-[min(100%,280px)] for long labels */
  className?: string;
}) {
  return <ExecutivePeriodPicker value={value} onChange={onChange} id={id} className={className} />;
}

export { ExecutivePeriodPicker };

/** @deprecated Use `executiveDefaultQuickRangeId` from `@/lib/executive-quick-ranges`. */
export function executiveCurrentPeriodValue(): string {
  return executiveDefaultQuickRangeId();
}

export function ExecutiveKpiCard({
  label,
  value,
  icon: Icon,
  href,
  isLoading,
  deltaLabel,
  hint,
  accent = "blue",
  valueClassName,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  href?: string;
  isLoading?: boolean;
  deltaLabel?: string;
  hint?: string;
  accent?: keyof typeof ACCENT_BAR;
  valueClassName?: string;
}) {
  const bar = ACCENT_BAR[accent] ?? ACCENT_BAR.blue;
  const inner = (
    <div className="relative overflow-hidden rounded-xl border border-white/90 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className={cn("h-1 w-full", bar)} />
      <div className="p-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <Icon className="w-4 h-4 text-[#001B3D]/30 dark:text-slate-500 shrink-0" />
        </div>
        <div
          className={cn(
            "text-2xl font-bold tabular-nums mt-1 text-[#001B3D] dark:text-slate-100",
            valueClassName,
          )}
        >
          {isLoading ? <span className="text-sm font-normal opacity-50">…</span> : value}
        </div>
        <div className="text-[10px] font-semibold text-[#001B3D]/50 dark:text-slate-400 uppercase tracking-wide mt-1 leading-tight">
          {label}
        </div>
        {deltaLabel ? (
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1.5 font-medium">{deltaLabel}</div>
        ) : null}
        {hint ? (
          <div className="text-[10px] text-[#001B3D]/45 dark:text-slate-500 mt-1 leading-snug">{hint}</div>
        ) : null}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function ExecutiveMetricCard({
  title,
  definition,
  formula,
  accent = "blue",
  children,
}: {
  title: string;
  definition: string;
  formula: ReactNode;
  accent?: keyof typeof ACCENT_BAR;
  children: ReactNode;
}) {
  const bar = ACCENT_BAR[accent] ?? ACCENT_BAR.blue;
  return (
    <div className="rounded-xl border border-white/90 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[200px]">
      <div className="flex-1 p-4 min-w-0">
        <div className={cn("h-0.5 w-12 rounded-full mb-2", bar)} />
        <h3 className="text-sm font-bold text-[#001B3D] dark:text-slate-100">{title}</h3>
        <p className="text-[11px] text-[#001B3D]/55 dark:text-slate-400 mt-1 leading-relaxed">{definition}</p>
        <div className="mt-3 h-36 w-full min-h-[9rem]">{children}</div>
      </div>
      <div className="md:w-[200px] shrink-0 border-t md:border-t-0 md:border-l border-dashed border-[#001B3D]/15 dark:border-slate-600 bg-[#f8fafc] dark:bg-slate-800/50 p-3 text-[11px] leading-snug text-[#001B3D]/80 dark:text-slate-300">
        <div className="font-bold text-[#001B3D] dark:text-slate-100 mb-1.5">Formula:</div>
        <div className="space-y-1 opacity-95">{formula}</div>
      </div>
    </div>
  );
}

export function ExecutiveInsightsBar({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6 rounded-xl border border-white/90 dark:border-slate-700/80 bg-white dark:bg-slate-900/70 shadow-sm px-4 py-3">
      <div className="text-[10px] font-bold text-[#001B3D]/50 dark:text-slate-400 uppercase tracking-wider mb-2">
        Additional insights
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {items.map((text, i) => (
          <p key={i} className="text-[11px] text-[#001B3D]/75 dark:text-slate-300 leading-snug border-l-2 border-[#001B3D]/10 pl-2">
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ExecutiveHowToStrip() {
  const steps = [
    "Ask questions",
    "Review trends",
    "Discuss causes",
    "Take action",
    "Repeat",
  ];
  return (
    <div className="mt-6 rounded-xl overflow-hidden border border-[#001B3D]/15 dark:border-slate-600">
      <div className="bg-[#001B3D] dark:bg-slate-800 text-white text-[11px] font-bold px-4 py-2">How to use this dashboard</div>
      <div className="bg-white dark:bg-slate-900/80 px-2 py-3 flex flex-wrap items-center justify-center gap-2 md:gap-4">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
              {i + 1}
            </span>
            <span className="text-[11px] font-medium text-[#001B3D] dark:text-slate-200">{s}</span>
            {i < steps.length - 1 ? <span className="hidden sm:inline text-slate-300 dark:text-slate-600">→</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutiveFooterQuote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg bg-[#001B3D] dark:bg-slate-800 text-center text-[11px] md:text-xs text-white/90 px-4 py-3 font-medium leading-relaxed">
      {children}
    </div>
  );
}
