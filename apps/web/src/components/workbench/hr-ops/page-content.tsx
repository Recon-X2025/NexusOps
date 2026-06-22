"use client";

import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { EmployeeJourney, type JourneyBucket } from "./employee-journey";
import { formatDate } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function HrOpsContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.hrOps.useQuery(undefined, mergeTrpcQueryOpts("workbench.hrOps"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <EmployeeJourney
          buckets={(data?.journey.data ?? null) as JourneyBucket[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.journey, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Open HR cases" hint="Recent first">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.cases.data?.length ? (
              <WorkbenchEmpty state={data?.cases.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.cases.data.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-200 truncate capitalize">
                        {c.caseType.replace(/_/g, " ")}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {c.assigneeName ?? "Unassigned"}
                      </div>
                    </div>
                    <span className="text-[11px] capitalize tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                      {c.priority}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Pending leave approvals" hint="Sorted by start date">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.leaves.data?.length ? (
              <WorkbenchEmpty state={data?.leaves.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.leaves.data.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-200 truncate capitalize">{l.type}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDate(l.startDate)} → {formatDate(l.endDate)}
                      </div>
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300 shrink-0">{l.days}d</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>
        </div>
      </div>

      <div className="xl:col-span-3 min-w-0">
        <ActionQueue items={(data?.actions ?? []) as ActionQueueItem[]} loading={q.isLoading} />
      </div>
    </div>
  );
}
