"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { AccountPortfolio, type AccountCard } from "./account-portfolio";
import { formatDate, formatNumber } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

const HEALTH_LABEL: Record<string, string> = {
  at_risk: "At risk",
  watch: "Watch",
  healthy: "Healthy",
  champion: "Champion",
};

export function CsmContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.csm.useQuery(undefined, mergeTrpcQueryOpts("workbench.csm"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <AccountPortfolio
          accounts={(data?.portfolio.data ?? null) as AccountCard[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.portfolio, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Renewals · next 90 days" hint="Sorted by closest renewal">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.renewals.data?.length ? (
              <WorkbenchEmpty state={data?.renewals.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.renewals.data.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/app/contracts/${r.id}`}
                      className="min-w-0 flex-1 text-amber-700 dark:text-amber-300 hover:underline truncate"
                    >
                      {r.counterparty}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {r.daysToRenew}d · {formatDate(r.endDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Health histogram" hint="Portfolio bucketed by health score">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.healthHistogram.data?.length ? (
              <WorkbenchEmpty state={data?.healthHistogram.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.healthHistogram.data.map((h) => (
                  <li key={h.bucket} className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">{HEALTH_LABEL[h.bucket] ?? h.bucket}</span>
                    <span className="font-semibold tabular-nums text-[#001B3D] dark:text-slate-100">{formatNumber(h.count)}</span>
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
