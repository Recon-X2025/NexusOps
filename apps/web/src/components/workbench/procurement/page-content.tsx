"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { PoKanban, type PoCard } from "./po-kanban";
import { formatDate } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function ProcurementContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.procurement.useQuery(undefined, mergeTrpcQueryOpts("workbench.procurement"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <PoKanban
          cards={(data?.kanban.data ?? null) as PoCard[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.kanban, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Vendor watch" hint="Vendors needing attention">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.vendorWatch.data?.length ? (
              <WorkbenchEmpty state={data?.vendorWatch.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.vendorWatch.data.slice(0, 8).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-200 truncate">{v.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {v.paymentTerms ?? "—"} {v.isMsme ? "· MSME" : ""}
                      </div>
                    </div>
                    <span className="text-[11px] capitalize text-slate-600 dark:text-slate-300 shrink-0">{v.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Contract renewals · 60d" hint="Vendor contracts ending soon">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.contractRenewals.data?.length ? (
              <WorkbenchEmpty state={data?.contractRenewals.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.contractRenewals.data.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/app/contracts/${c.id}`}
                      className="min-w-0 flex-1 text-orange-700 dark:text-orange-300 hover:underline truncate"
                    >
                      {c.counterparty}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {c.daysToRenew}d · {formatDate(c.endDate)}
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
