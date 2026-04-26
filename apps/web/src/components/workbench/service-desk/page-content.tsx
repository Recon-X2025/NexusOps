"use client";

import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { QueueTable, type QueueRow } from "./queue-table";
import { formatNumber } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function ServiceDeskContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.serviceDesk.useQuery(undefined, mergeTrpcQueryOpts("workbench.serviceDesk"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <QueueTable
          rows={(data?.queue.data ?? null) as QueueRow[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.queue, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="On shift" hint="Live on-call roster">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.shift.data?.length ? (
              <WorkbenchEmpty
                state={data?.shift.state === "error" ? "error" : "no_data"}
                message="No on-call schedules configured."
              />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.shift.data.map((s, i) => (
                  <li key={`${s.scheduleName}:${i}`} className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1 last:border-0">
                    <span className="truncate text-slate-700 dark:text-slate-200">{s.scheduleName}</span>
                    <span className="text-slate-500 dark:text-slate-400 truncate">{s.ownerName ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Capacity" hint="Open tickets by status">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.capacity.data?.length ? (
              <WorkbenchEmpty state={data?.capacity.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.capacity.data.map((row) => (
                  <li key={row.status} className="flex items-center justify-between gap-3">
                    <span className="text-slate-700 dark:text-slate-200">{row.status}</span>
                    <span className="font-semibold tabular-nums text-[#001B3D] dark:text-slate-100">
                      {formatNumber(row.count)}
                    </span>
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
