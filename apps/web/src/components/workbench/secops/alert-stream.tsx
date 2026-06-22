"use client";

/**
 * Primary visual for the SecOps workbench: chronological alert triage stream.
 *
 * Q1: Analysts ack/dismiss/triage alerts in time order — a list with timeline
 *     and severity bars surfaces the next thing to work on without filtering.
 * Q2: ALERT TRIAGE STREAM with severity bars and MITRE chips. Distinct from
 *     calendar (Change), kanban (Procurement), table (Service Desk), matrix (GRC).
 * Q3: Pulls from `securityIncidents` (stream + MITRE) and `vulnerabilities`
 *     (action queue). Cross-cutting helps analysts see incident + vuln pressure together.
 * Q4: Acknowledge unassigned alerts; remediate stale vulns.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatRelativeMs } from "../shared/format";

export interface AlertRow {
  id: string;
  number: string;
  title: string;
  severity: string;
  status: string;
  assigneeName: string | null;
  mitreTechniques: string[];
  attackVector: string | null;
  createdAt: string;
}

const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export function AlertStream({
  rows,
  state,
}: {
  rows: AlertRow[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Alert triage stream"
      hint="Most recent active incidents · ack / dismiss / assign"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.rose, "bg-rose-500/70")}
    >
      {state !== "ok" || !rows ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No active incidents — quiet shift." : undefined}
        />
      ) : (
        <ol className="relative pl-4 space-y-2 border-l border-rose-200 dark:border-rose-900/60">
          {rows.slice(0, 12).map((a) => {
            const ageMs = Date.now() - new Date(a.createdAt).getTime();
            return (
              <li key={a.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[9px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                    SEVERITY_BAR[a.severity] ?? "bg-slate-400",
                  )}
                />
                <div className="rounded border border-slate-100 dark:border-slate-800 px-2.5 py-1.5 hover:border-rose-200 dark:hover:border-rose-800 transition-colors">
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "mt-0.5 h-8 w-1 shrink-0 rounded",
                        SEVERITY_BAR[a.severity] ?? "bg-slate-400",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <Link
                          href={`/app/security/incidents/${a.id}`}
                          className="font-semibold text-rose-700 dark:text-rose-300 hover:underline truncate"
                        >
                          {a.number}
                        </Link>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 shrink-0">
                          {formatRelativeMs(-ageMs)} · {a.assigneeName ?? "Unassigned"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-200 truncate">{a.title}</div>
                      {a.mitreTechniques.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a.mitreTechniques.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center rounded border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </WorkbenchSection>
  );
}
