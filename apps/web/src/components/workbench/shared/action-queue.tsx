"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "./accent";
import { WorkbenchSection, WorkbenchEmpty } from "./workbench-section";

export interface ActionQueueItem {
  id: string;
  label: string;
  hint?: string;
  severity: "info" | "watch" | "warn" | "breach";
  href?: string;
  owner?: string;
  dueAt?: string;
}

/**
 * Shared right-rail action queue. The *items* differ per workbench; the
 * row renderer is intentionally consistent so operators don't have to
 * relearn the surface when switching workbenches.
 */
export function ActionQueue({
  items,
  loading,
}: {
  items: ActionQueueItem[];
  loading?: boolean;
}) {
  return (
    <WorkbenchSection title="Action queue" hint="Highest-priority items for you">
      {loading ? (
        <WorkbenchEmpty state="loading" />
      ) : items.length === 0 ? (
        <WorkbenchEmpty state="no_data" message="No actions for you right now." />
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const tone = SEVERITY_TONE[item.severity];
            const Inner = (
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                    item.severity === "breach"
                      ? "bg-rose-500"
                      : item.severity === "warn"
                        ? "bg-amber-500"
                        : item.severity === "watch"
                          ? "bg-amber-400"
                          : "bg-slate-400",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-[#001B3D] dark:text-slate-100 truncate">
                    {item.label}
                  </div>
                  {item.hint ? (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.hint}
                    </div>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    tone,
                  )}
                >
                  {item.severity}
                </span>
              </div>
            );
            return (
              <li
                key={item.id}
                className="rounded-md border border-slate-100 dark:border-slate-800 px-2 py-1.5 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
              >
                {item.href ? (
                  <Link href={item.href} className="block">
                    {Inner}
                  </Link>
                ) : (
                  Inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WorkbenchSection>
  );
}
