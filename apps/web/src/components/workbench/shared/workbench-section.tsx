"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard card wrapper used by every workbench's secondary panels. Visual
 * tokens match the executive dashboard's card patterns (per §7).
 */
export function WorkbenchSection({
  title,
  hint,
  children,
  className,
  /** Render a thin accent edge — used by the primary visual only. */
  accentEdgeClassName,
  right,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  accentEdgeClassName?: string;
  right?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative bg-white dark:bg-slate-900/80 border border-white/90 dark:border-slate-700/80 rounded-xl shadow-sm overflow-hidden",
        className,
      )}
    >
      {accentEdgeClassName ? (
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", accentEdgeClassName)} />
      ) : null}
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#001B3D] dark:text-slate-100 truncate">{title}</h2>
          {hint ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

/** Per-panel empty/loading/error states — never bring down the whole page. */
export function WorkbenchEmpty({
  state,
  message,
  cta,
}: {
  state: "loading" | "no_data" | "error";
  message?: string;
  cta?: ReactNode;
}) {
  if (state === "loading") {
    return (
      <div className="space-y-2 py-2" aria-busy="true" aria-live="polite">
        <div className="h-3 w-3/4 rounded bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="py-2 text-xs text-rose-700 dark:text-rose-300">
        {message ?? "Couldn’t load this panel. It will retry shortly."}
      </div>
    );
  }
  return (
    <div className="py-2 text-xs text-slate-500 dark:text-slate-400">
      {message ?? "No data yet."}
      {cta ? <div className="mt-1">{cta}</div> : null}
    </div>
  );
}
