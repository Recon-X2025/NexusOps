"use client";

/**
 * Primary visual: pipeline funnel + today's interview load.
 *
 * Q1: Recruiter sees stage drop-off and today's interview slots in one
 *     glance — no need to filter applications and check the calendar.
 * Q2: FUNNEL with horizontal bars + interview slot rail. Distinct shape from
 *     all others.
 * Q3: Pulls from `candidateApplications` (funnel), `interviews` (slots),
 *     `jobOffers` (action queue).
 * Q4: Fill empty interview slots; warm offers about to expire.
 */

import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatDateTime } from "../shared/format";

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface InterviewSlot {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  durationMins: number | null;
  candidateName: string | null;
  jobTitle: string | null;
}

export function PipelineFunnel({
  funnel,
  funnelState,
  slots,
  slotsState,
}: {
  funnel: FunnelStage[] | null;
  funnelState: "loading" | "ok" | "no_data" | "error";
  slots: InterviewSlot[] | null;
  slotsState: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Pipeline · interview load"
      hint="Stage funnel with conversion deltas · today's slots"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.teal, "bg-teal-500/70")}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3">
          {funnelState !== "ok" || !funnel ? (
            <WorkbenchEmpty state={funnelState === "ok" ? "no_data" : funnelState} />
          ) : (
            <Funnel stages={funnel} />
          )}
        </div>
        <div className="md:col-span-2 md:border-l md:border-slate-100 md:dark:border-slate-800 md:pl-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-2">
            Next 48h slots
          </div>
          {slotsState !== "ok" || !slots ? (
            <WorkbenchEmpty state={slotsState === "ok" ? "no_data" : slotsState} message={slotsState === "no_data" ? "No interviews scheduled." : undefined} />
          ) : (
            <ul className="space-y-1.5">
              {slots.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-xs">
                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700 dark:text-slate-200 truncate">
                      {s.candidateName ?? "Slot to fill"}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {formatDateTime(s.scheduledAt)} · {s.jobTitle ?? s.type}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </WorkbenchSection>
  );
}

function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <ul className="space-y-1.5">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        const prev = i > 0 ? stages[i - 1]!.count : null;
        const conv = prev != null && prev > 0 ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.stage} className="text-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">{s.stage.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                {s.count}
                {conv != null ? <span className="ml-2 text-teal-700 dark:text-teal-300">{conv}%</span> : null}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
              <div className="h-2 rounded bg-teal-500/80" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
