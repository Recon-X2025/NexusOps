"use client";

/**
 * Primary visual for the Service Desk workbench.
 *
 * Q1 (§3.5): Operators triage the live queue here without bouncing through
 *            the tickets list filters / search. SLA risk is the lead column,
 *            not a metadata badge — so risk is impossible to miss.
 * Q2: A LIVE QUEUE TABLE. Distinct from Change&Release's calendar, Field
 *     Service's dispatch board, SecOps' alert stream, GRC's matrix, etc.
 * Q3: Pulls from `tickets`, `oncall`, `approvals`. Cross-cutting helps the
 *     lead see SLA risk together with on-shift roster + escalations awaiting CAB.
 * Q4: Reassign / escalate / pull next ticket — surfaced inline.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatRelativeMs } from "../shared/format";

export interface QueueRow {
  id: string;
  number: string;
  title: string;
  priority: string;
  slaInMs: number | null;
  slaBucket: "ok" | "watch" | "warn" | "breach";
  assignee: string | null;
  channel: string;
}

export function QueueTable({
  rows,
  state,
}: {
  rows: QueueRow[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Live queue"
      hint="Top 25 open tickets — sorted by SLA urgency"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.blue, "bg-blue-500/70")}
    >
      {state !== "ok" || !rows ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={
            state === "no_data"
              ? "No open tickets right now — clean queue."
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-2 py-1.5 font-semibold">SLA</th>
                <th className="px-2 py-1.5 font-semibold">Ticket</th>
                <th className="px-2 py-1.5 font-semibold">Title</th>
                <th className="px-2 py-1.5 font-semibold">Priority</th>
                <th className="px-2 py-1.5 font-semibold">Assignee</th>
                <th className="px-2 py-1.5 font-semibold">Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-2 py-1.5">
                    <SlaCell slaInMs={r.slaInMs} bucket={r.slaBucket} />
                  </td>
                  <td className="px-2 py-1.5 font-medium">
                    <Link href={`/app/tickets/${r.id}`} className="text-blue-700 dark:text-blue-300 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 max-w-[24rem] truncate text-slate-700 dark:text-slate-200">
                    {r.title}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">{r.priority}</td>
                  <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
                    {r.assignee ?? <span className="text-amber-700 dark:text-amber-300">Unassigned</span>}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{r.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkbenchSection>
  );
}

function SlaCell({ slaInMs, bucket }: { slaInMs: number | null; bucket: QueueRow["slaBucket"] }) {
  const tone =
    bucket === "breach"
      ? "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100"
      : bucket === "warn"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
        : bucket === "watch"
          ? "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold", tone)}>
      {bucket === "breach" ? "Breached " : ""}
      {formatRelativeMs(slaInMs)}
    </span>
  );
}
