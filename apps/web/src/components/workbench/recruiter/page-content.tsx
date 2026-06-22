"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { PipelineFunnel, type FunnelStage, type InterviewSlot } from "./pipeline-funnel";
import { formatDate } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function RecruiterContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.recruiter.useQuery(undefined, mergeTrpcQueryOpts("workbench.recruiter"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <PipelineFunnel
          funnel={(data?.funnel.data ?? null) as FunnelStage[] | null}
          funnelState={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.funnel, loadingTimedOut: timedOut })}
          slots={(data?.interviewsToday.data ?? null) as InterviewSlot[] | null}
          slotsState={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.interviewsToday, loadingTimedOut: timedOut })}
        />

        <WorkbenchSection title="Open offers" hint="Sent or in-draft offers awaiting acceptance">
          {q.isLoading ? (
            <WorkbenchEmpty state="loading" />
          ) : !data?.offers.data?.length ? (
            <WorkbenchEmpty state={data?.offers.state === "error" ? "error" : "no_data"} />
          ) : (
            <ul className="text-xs space-y-1.5">
              {data.offers.data.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/app/recruitment/offers/${o.id}`}
                    className="min-w-0 flex-1 text-teal-700 dark:text-teal-300 hover:underline truncate"
                  >
                    {o.title} — {o.candidateName ?? "—"}
                  </Link>
                  <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    Expires {formatDate(o.expiryDate)}
                  </span>
                  <span className="text-[11px] capitalize text-slate-600 dark:text-slate-300 shrink-0">{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </WorkbenchSection>
      </div>

      <div className="xl:col-span-3 min-w-0">
        <ActionQueue items={(data?.actions ?? []) as ActionQueueItem[]} loading={q.isLoading} />
      </div>
    </div>
  );
}
