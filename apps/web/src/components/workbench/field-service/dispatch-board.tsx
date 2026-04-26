"use client";

/**
 * Primary visual: dispatch board (kanban-like columns by WO state).
 *
 * Q1: Dispatchers move WOs across lanes — assignment + state transitions live
 *     here. Other surfaces require lots of clicks to move a WO between states.
 * Q2: DISPATCH BOARD (lanes by state). Distinct from kanban cards used by
 *     Procurement (PO status) — this lane structure is dispatcher-shaped.
 * Q3: Pulls from `workOrders`, joins `users` for technician names; the
 *     payload also derives technician load + state counts.
 * Q4: Assign idle WO to least-loaded technician; flag parts shortages.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";

export interface DispatchRow {
  id: string;
  number: string;
  shortDescription: string;
  state: string;
  priority: string;
  location: string | null;
  assigneeName: string | null;
  scheduledStart: string | null;
}

const LANES: { state: string; label: string }[] = [
  { state: "pending_dispatch", label: "Awaiting dispatch" },
  { state: "dispatched", label: "Dispatched" },
  { state: "work_in_progress", label: "On site" },
  { state: "on_hold", label: "On hold" },
];

export function DispatchBoard({
  rows,
  state,
}: {
  rows: DispatchRow[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Dispatch board"
      hint="Active work orders by state · drag-equivalent transitions"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.cyan, "bg-cyan-500/70")}
    >
      {state !== "ok" || !rows ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No active work orders." : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {LANES.map((lane) => {
            const cards = rows.filter((r) => r.state === lane.state);
            return (
              <div key={lane.state} className="rounded-md border border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-slate-900/40 p-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  <span className="font-semibold">{lane.label}</span>
                  <span className="rounded bg-white dark:bg-slate-800 px-1.5 py-0.5 font-medium tabular-nums text-slate-700 dark:text-slate-200">
                    {cards.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {cards.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/app/work-orders/${r.id}`}
                        className="block rounded border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-1.5 hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-cyan-700 dark:text-cyan-300">{r.number}</span>
                          <span className="text-slate-500 dark:text-slate-400 truncate">{r.assigneeName ?? "—"}</span>
                        </div>
                        <div className="text-[11px] text-slate-700 dark:text-slate-200 truncate">{r.shortDescription}</div>
                        {r.location ? (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{r.location}</div>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                  {cards.length > 6 ? (
                    <li className="text-[10px] text-slate-500 dark:text-slate-400 text-center">+{cards.length - 6} more</li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </WorkbenchSection>
  );
}
