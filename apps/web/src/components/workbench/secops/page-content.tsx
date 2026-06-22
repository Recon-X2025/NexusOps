"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { AlertStream, type AlertRow } from "./alert-stream";
import { formatNumber } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function SecOpsContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.secops.useQuery(undefined, mergeTrpcQueryOpts("workbench.secops"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <AlertStream
          rows={(data?.alerts.data ?? null) as AlertRow[] | null}
          state={panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.alerts, loadingTimedOut: timedOut })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Top open vulnerabilities" hint="Sorted by CVSS">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.vulnerabilities.data?.length ? (
              <WorkbenchEmpty state={data?.vulnerabilities.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.vulnerabilities.data.slice(0, 8).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/app/security/vulnerabilities/${v.id}`}
                      className="min-w-0 flex-1 text-rose-700 dark:text-rose-300 hover:underline truncate"
                    >
                      {v.cveId ?? v.title}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      CVSS {v.cvssScore ?? "—"}
                    </span>
                    <span className="capitalize text-[11px] text-slate-600 dark:text-slate-300 shrink-0">{v.severity}</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="MITRE technique rollup" hint="Across active incidents">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.mitreRollup.data?.length ? (
              <WorkbenchEmpty
                state={data?.mitreRollup.state === "error" ? "error" : "no_data"}
                message="No MITRE techniques tagged on active incidents."
              />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.mitreRollup.data.map((m) => (
                  <li key={m.technique} className="flex items-center justify-between">
                    <span className="font-mono text-rose-700 dark:text-rose-300">{m.technique}</span>
                    <span className="font-semibold tabular-nums text-[#001B3D] dark:text-slate-100">{formatNumber(m.count)}</span>
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
