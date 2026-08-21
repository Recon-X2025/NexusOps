"use client";

/**
 * WorkbenchShell — page chrome shared across all 12 workbenches.
 *
 * Per §3.4 of the prompt the accent shows up on the page header strip and
 * the primary visual's leading edge — not on every surface. The shell
 * renders the strip; primary visuals consume `accent` via context.
 *
 * The shell renders the workbench's `children` directly. It previously
 * carried an `Analytics & Reporting` tab, but that tab resolved each
 * workbench to its parent FUNCTION and showed the hub's metrics rather
 * than the persona's. Every metric it displayed is already on the hub
 * Overview, so the tab was removed rather than re-scoped.
 */

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACCENT_BAR } from "./accent";
import type { WorkbenchAccent, WorkbenchKey } from "@coheronconnect/types";

interface WorkbenchContextValue {
  accent: WorkbenchAccent;
  workbenchKey: WorkbenchKey;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench() {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench() must be called inside <WorkbenchShell>");
  return ctx;
}

interface WorkbenchShellProps {
  workbenchKey: WorkbenchKey;
  persona: string;
  accent: WorkbenchAccent;
  title: string;
  subtitle: string;
  /** Right-side controls in the header (filters, refresh, etc.). */
  headerRight?: ReactNode;
  children: ReactNode;
}

export function WorkbenchShell({
  workbenchKey,
  persona,
  accent,
  title,
  subtitle,
  headerRight,
  children,
}: WorkbenchShellProps) {
  return (
    <WorkbenchContext.Provider value={{ accent, workbenchKey }}>
      <div className="-m-4 min-h-full bg-[#F0F4F8] dark:bg-slate-950 p-5 md:p-6">
        <div className={cn("mb-3 h-1 w-full rounded-full", ACCENT_BAR[accent] ?? "bg-slate-600")} />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between pb-3 border-b border-[#001B3D]/10 dark:border-slate-700">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              {persona}
            </div>
            <h1 className="text-h4 md:text-h3 font-bold tracking-tight text-[#001B3D] dark:text-slate-100">
              {title}
            </h1>
            <p className="text-caption md:text-body-sm font-medium text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-snug">
              {subtitle}
            </p>
          </div>
          {headerRight ? (
            <div className="flex items-center gap-2 shrink-0 mt-2 sm:mt-0">{headerRight}</div>
          ) : null}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </WorkbenchContext.Provider>
  );
}
