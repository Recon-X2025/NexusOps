"use client";

/**
 * WorkbenchShell — page chrome shared across all 12 workbenches.
 *
 * Per §3.4 of the prompt the accent shows up on the page header strip and
 * the primary visual's leading edge — not on every surface. The shell
 * renders the strip; primary visuals consume `accent` via context.
 *
 * The shell now also renders an `Operate` / `Analytics & Reporting` tab
 * strip. The `Operate` tab is the workbench's normal `children` (queue,
 * board, calendar, etc.). The `Reports` tab is operator-KPI-only — it's
 * deliberately distinct from the hub Overview's reports tab, which is
 * strategic.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACCENT_BAR } from "./accent";
import { WorkbenchReportsTab } from "./workbench-reports-tab";
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

type TabId = "operate" | "reports";

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
  const [tab, setTab] = useState<TabId>("operate");
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "operate", label: "Operate" },
    { id: "reports", label: "Analytics & Reporting" },
  ];
  return (
    <WorkbenchContext.Provider value={{ accent, workbenchKey }}>
      <div className="-m-4 min-h-full bg-[#F0F4F8] dark:bg-slate-950 p-5 md:p-6">
        <div className={cn("mb-3 h-1 w-full rounded-full", ACCENT_BAR[accent] ?? "bg-slate-600")} />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between pb-3 border-b border-[#001B3D]/10 dark:border-slate-700">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              {persona}
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#001B3D] dark:text-slate-100">
              {title}
            </h1>
            <p className="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-snug">
              {subtitle}
            </p>
          </div>
          {headerRight && tab === "operate" ? (
            <div className="flex items-center gap-2 shrink-0 mt-2 sm:mt-0">{headerRight}</div>
          ) : null}
        </div>
        <div className="border-b border-[#001B3D]/10 dark:border-slate-700 mb-4">
          <nav className="-mb-px flex gap-6" role="tablist" aria-label="Workbench sections">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "py-2.5 text-xs font-semibold border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm",
                    active
                      ? "border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
        {tab === "operate" ? (
          children
        ) : (
          <WorkbenchReportsTab workbenchKey={workbenchKey} workbenchTitle={title} />
        )}
      </div>
    </WorkbenchContext.Provider>
  );
}
