"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { PortfolioMatrix, type PortfolioPoint } from "./portfolio-matrix";
import { formatDate } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function PmoContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.pmo.useQuery(undefined, mergeTrpcQueryOpts("workbench.pmo"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <PortfolioMatrix
          points={(data?.portfolio.data ?? null) as PortfolioPoint[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.portfolio, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Milestones at risk" hint="Due in 14 days or overdue">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.milestoneRisks.data?.length ? (
              <WorkbenchEmpty state={data?.milestoneRisks.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.milestoneRisks.data.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/app/projects/${m.projectId}`}
                      className="min-w-0 flex-1 text-blue-700 dark:text-blue-300 hover:underline truncate"
                    >
                      {m.projectName} — {m.title}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {m.daysOverdue > 0 ? `${m.daysOverdue}d over` : `Due ${formatDate(m.dueDate)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Cross-project dependencies" hint="Blocked / blocking edges">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.dependencies.data?.length ? (
              <WorkbenchEmpty state={data?.dependencies.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.dependencies.data.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="truncate text-slate-700 dark:text-slate-200">{d.fromProjectName}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {d.dependencyType.replace(/_/g, " ")} →
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-200">{d.toProjectName}</span>
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
