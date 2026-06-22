"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { ControlMatrix, type MatrixCell } from "./control-matrix";
import { formatDate } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function GrcContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.grc.useQuery(undefined, mergeTrpcQueryOpts("workbench.grc"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <ControlMatrix
          cells={(data?.matrix.data ?? null) as MatrixCell[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.matrix, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Stale evidence" hint="Controls with oldest test evidence">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.controlAge.data?.length ? (
              <WorkbenchEmpty state={data?.controlAge.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.controlAge.data.slice(0, 8).map((c) => (
                  <li key={c.controlId} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/app/security/controls/${c.controlId}`}
                      className="min-w-0 flex-1 text-indigo-700 dark:text-indigo-300 hover:underline truncate"
                    >
                      {c.controlNumber} — {c.title}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {c.daysSinceEvidence != null ? `${c.daysSinceEvidence}d` : "never tested"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Open audit findings" hint="Sorted by remediation date">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.findings.data?.length ? (
              <WorkbenchEmpty state={data?.findings.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.findings.data.slice(0, 8).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-200 truncate">{f.findingNumber}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{f.title}</div>
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      Due {formatDate(f.targetRemediationDate)}
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
