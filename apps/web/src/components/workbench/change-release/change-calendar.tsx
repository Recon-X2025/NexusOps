"use client";

/**
 * Primary visual: 14-day change calendar / timeline strip.
 *
 * Q1: Change managers see overlapping windows in a single glance — not in
 *     a table where collisions need cross-referencing.
 * Q2: TIMELINE STRIP. Distinct from Service Desk's queue table, Field
 *     Service's dispatch board, etc.
 * Q3: Pulls from `changeRequests` (windows + risk) and `changeApprovals`
 *     (CAB queue) — see header on payload builder.
 * Q4: Move pending CABs forward; reschedule colliding windows.
 */

import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";

export interface ChangeWindow {
  id: string;
  number: string;
  title: string;
  risk: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  collisions: string[];
}

const RISK_TONE: Record<string, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

export function ChangeCalendar({
  windows,
  state,
}: {
  windows: ChangeWindow[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <WorkbenchSection
      title="Change calendar"
      hint="Next 14 days · collision indicators on overlapping windows"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.violet, "bg-violet-500/70")}
    >
      {state !== "ok" || !windows ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={
            state === "no_data"
              ? "No changes scheduled in the next 14 days."
              : undefined
          }
        />
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {days.slice(0, 7).map((d) => (
              <DayHeader key={d.toISOString()} d={d} />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 mb-3">
            {days.slice(0, 7).map((d) => (
              <DayCell key={d.toISOString()} d={d} windows={windows} />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {days.slice(7).map((d) => (
              <DayHeader key={d.toISOString()} d={d} />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.slice(7).map((d) => (
              <DayCell key={d.toISOString()} d={d} windows={windows} />
            ))}
          </div>
        </div>
      )}
    </WorkbenchSection>
  );
}

function DayHeader({ d }: { d: Date }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">
      {d.toLocaleDateString(undefined, { weekday: "short" })}{" "}
      <span className="font-semibold text-slate-700 dark:text-slate-200">{d.getDate()}</span>
    </div>
  );
}

function DayCell({ d, windows }: { d: Date; windows: ChangeWindow[] }) {
  const start = d.getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const dayWindows = windows.filter((w) => {
    if (!w.scheduledStart) return false;
    const t = new Date(w.scheduledStart).getTime();
    return t >= start && t < end;
  });
  const collisions = dayWindows.some((w) => w.collisions.length > 0);
  return (
    <div
      className={cn(
        "rounded-md border px-1.5 py-1 min-h-[3.5rem] text-[10px]",
        collisions
          ? "border-rose-300 dark:border-rose-700/60 bg-rose-50/80 dark:bg-rose-900/20"
          : "border-slate-200 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-800/40",
      )}
      title={collisions ? "Window collisions on this day" : undefined}
    >
      {dayWindows.length === 0 ? (
        <span className="text-slate-400 dark:text-slate-500">—</span>
      ) : (
        <ul className="space-y-0.5">
          {dayWindows.slice(0, 3).map((w) => (
            <li key={w.id} className="flex items-center gap-1">
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", RISK_TONE[w.risk] ?? "bg-slate-400")} />
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{w.number}</span>
            </li>
          ))}
          {dayWindows.length > 3 ? (
            <li className="text-slate-500 dark:text-slate-400">+{dayWindows.length - 3} more</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
