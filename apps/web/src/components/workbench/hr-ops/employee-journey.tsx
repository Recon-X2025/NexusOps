"use client";

/**
 * Primary visual: employee journey strip.
 *
 * Q1: HR Ops watches the lifecycle pipeline — joining, onboarding, on leave,
 *     exiting — without flipping between four different list views.
 * Q2: HORIZONTAL JOURNEY STRIP with stages and counts. Distinct from any
 *     other workbench's primary visual.
 * Q3: Pulls from `employees`, `hrCases`, `leaveRequests` — three different
 *     domains, summarised on one visual.
 * Q4: Approve pending leaves; address high-priority cases.
 */

import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatDate } from "../shared/format";

export interface JourneyBucket {
  stage: "joining_soon" | "onboarding" | "active_leave" | "exit_30d";
  count: number;
  examples: { employeeId: string; name: string; date: string | null }[];
}

const STAGES: { key: JourneyBucket["stage"]; label: string; tone: string }[] = [
  { key: "joining_soon", label: "Joining ≤14d", tone: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200/60 dark:border-emerald-800/60" },
  { key: "onboarding", label: "Onboarding", tone: "bg-teal-50 dark:bg-teal-900/30 border-teal-200/60 dark:border-teal-800/60" },
  { key: "active_leave", label: "On leave", tone: "bg-amber-50 dark:bg-amber-900/30 border-amber-200/60 dark:border-amber-800/60" },
  { key: "exit_30d", label: "Exit ≤30d", tone: "bg-rose-50 dark:bg-rose-900/30 border-rose-200/60 dark:border-rose-800/60" },
];

export function EmployeeJourney({
  buckets,
  state,
}: {
  buckets: JourneyBucket[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Employee journey"
      hint="Lifecycle pipeline · joining → onboarding → leave → exit"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.emerald, "bg-emerald-500/70")}
    >
      {state !== "ok" || !buckets ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No employees in active lifecycle stages." : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STAGES.map((stage) => {
            const bucket = buckets.find((b) => b.stage === stage.key) ?? { stage: stage.key, count: 0, examples: [] };
            return (
              <div
                key={stage.key}
                className={cn("rounded-md border p-3 flex flex-col gap-2 min-h-[8rem]", stage.tone)}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-700 dark:text-slate-200">
                    {stage.label}
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-[#001B3D] dark:text-slate-100">
                    {bucket.count}
                  </span>
                </div>
                <ul className="space-y-0.5 text-[11px] text-slate-700 dark:text-slate-200 mt-auto">
                  {bucket.examples.length === 0 ? (
                    <li className="text-slate-500 dark:text-slate-400">—</li>
                  ) : (
                    bucket.examples.slice(0, 3).map((e) => (
                      <li key={e.employeeId} className="flex justify-between gap-2">
                        <span className="truncate">{e.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{formatDate(e.date)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </WorkbenchSection>
  );
}
