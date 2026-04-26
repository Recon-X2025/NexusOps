"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { ActionQueue } from "../shared/action-queue";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { panelUiState, useLoadingTimeout } from "../shared/use-workbench-data";
import { ComplianceCalendar, type FilingMarker, type MeetingMarker } from "./compliance-calendar";
import { formatDate, formatDateTime } from "../shared/format";
import type { ActionQueueItem } from "../shared/action-queue";

export function CompanySecretaryContent() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const q = trpc.workbench.companySecretary.useQuery(undefined, mergeTrpcQueryOpts("workbench.companySecretary"));
  const timedOut = useLoadingTimeout(q.isLoading);
  const data = q.data;

  const calendarState =
    data?.filings.state === "ok" || data?.meetings.state === "ok"
      ? panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: { state: "ok" }, loadingTimedOut: timedOut })
      : panelUiState({ isLoading: q.isLoading, isError: q.isError, panel: data?.filings, loadingTimedOut: timedOut });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
      <div className="xl:col-span-9 min-w-0 flex flex-col gap-4 md:gap-5">
        <ComplianceCalendar
          filings={(data?.filings.data ?? null) as FilingMarker[] | null}
          meetings={(data?.meetings.data ?? null) as MeetingMarker[] | null}
          state={calendarState}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <WorkbenchSection title="Upcoming meetings" hint="Board / committee · next 90 days">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.meetings.data?.length ? (
              <WorkbenchEmpty state={data?.meetings.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.meetings.data.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/app/secretarial/meetings/${m.id}`}
                      className="min-w-0 flex-1 text-violet-700 dark:text-violet-300 hover:underline truncate"
                    >
                      {m.number} — {m.title}
                    </Link>
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {formatDateTime(m.scheduledAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="Resolutions in motion" hint="Drafts / approved / circulated">
            {q.isLoading ? (
              <WorkbenchEmpty state="loading" />
            ) : !data?.resolutions.data?.length ? (
              <WorkbenchEmpty state={data?.resolutions.state === "error" ? "error" : "no_data"} />
            ) : (
              <ul className="text-xs space-y-1.5">
                {data.resolutions.data.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 dark:text-slate-200 truncate">{r.number}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.title}</div>
                    </div>
                    <span className="text-[11px] capitalize tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {r.status} · {formatDate(r.passedAt)}
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
