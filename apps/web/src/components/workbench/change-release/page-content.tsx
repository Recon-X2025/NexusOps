"use client";

import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { ChangeCalendar, type ChangeWindow } from "./change-calendar";
import { formatNumber } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function ChangeReleaseContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.changeRelease.useQuery(undefined, mergeTrpcQueryOpts("workbench.changeRelease"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <ChangeCalendar
          windows={(data?.windows.data ?? null) as ChangeWindow[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.windows, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="CAB queue" hint="Pending change approvals">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.cab.data?.length ? (
              <WorkbenchEmpty state={data?.cab.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.cab.data.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-200 truncate">{c.changeNumber}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.changeTitle}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                      {c.approverName ?? "Unassigned approver"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Risk mix" hint="14-day window risk profile">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.riskMix.data?.length ? (
              <WorkbenchEmpty state={data?.riskMix.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.riskMix.data.map((r) => (
                  <li key={r.risk} className="flex items-center justify-between">
                    <span className="capitalize text-slate-700 dark:text-slate-200">{r.risk}</span>
                    <span className="font-semibold tabular-nums text-[#001B3D] dark:text-slate-100">{formatNumber(r.count)}</span>
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
