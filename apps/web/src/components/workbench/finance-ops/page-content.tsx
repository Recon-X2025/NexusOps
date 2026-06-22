"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { AgingBuckets, type AgingDistribution } from "./aging-buckets";
import { formatDate } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function FinanceOpsContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.financeOps.useQuery(undefined, mergeTrpcQueryOpts("workbench.financeOps"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <AgingBuckets
          ap={(data?.apAging.data ?? null) as AgingDistribution[] | null}
          apState={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.apAging, loadingTimedOut: timedOut })}
          ar={(data?.arAging.data ?? null) as AgingDistribution[] | null}
          arState={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.arAging, loadingTimedOut: timedOut })}
        />

        <WorkbenchSection title="Invoice approval queue" hint="Sorted by due date">
          {q.isLoading ? (
            <WorkbenchEmpty state="loading" />
          ) : !data?.approvalQueue.data?.length ? (
            <WorkbenchEmpty state={data?.approvalQueue.state === "error" ? "error" : "no_data"} />
          ) : (
            <ul className="text-xs divide-y divide-slate-100 dark:divide-slate-800">
              {data.approvalQueue.data.slice(0, 10).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-1.5">
                  <Link
                    href={`/app/finance/invoices/${inv.id}`}
                    className="min-w-0 flex-1 text-slate-700 dark:text-slate-200 hover:underline truncate"
                  >
                    {inv.invoiceNumber}
                  </Link>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 shrink-0">
                    {inv.flow}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                    ₹{inv.amount}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    Due {formatDate(inv.dueDate)}
                    {inv.daysOverdue > 0 ? <span className="ml-1 text-rose-600 dark:text-rose-300">·{inv.daysOverdue}d</span> : null}
                  </span>
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
