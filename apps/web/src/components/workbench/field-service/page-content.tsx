"use client";

import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { DispatchBoard, type DispatchRow } from "./dispatch-board";
import { formatNumber } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function FieldServiceContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.fieldService.useQuery(undefined, mergeTrpcQueryOpts("workbench.fieldService"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <DispatchBoard
          rows={(data?.board.data ?? null) as DispatchRow[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.board, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Technician load" hint="WOs per technician">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.technicianLoad.data?.length ? (
              <WorkbenchEmpty state={data?.technicianLoad.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.technicianLoad.data.slice(0, 8).map((t) => (
                  <li key={t.technicianId} className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-700 dark:text-slate-200">{t.technicianName ?? "Unnamed"}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t.openCount} open · {t.inProgressCount} active
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="State counts" hint="Snapshot of dispatch board">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.stateCounts.data?.length ? (
              <WorkbenchEmpty state={data?.stateCounts.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.stateCounts.data.map((s) => (
                  <li key={s.state} className="flex items-center justify-between">
                    <span className="capitalize text-slate-700 dark:text-slate-200">{s.state.replace(/_/g, " ")}</span>
                    <span className="font-semibold tabular-nums text-[#001B3D] dark:text-slate-100">{formatNumber(s.count)}</span>
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
