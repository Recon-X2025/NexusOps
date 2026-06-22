"use client";

/**
 * Primary visual: AP / AR aging buckets (dual-pane stacked bars).
 *
 * Q1: AP/AR manager sees both sides of the cash conversion cycle in one
 *     glance — instead of bouncing between payables and receivables modules.
 * Q2: SIDE-BY-SIDE STACKED BAR PANELS by age bucket. Distinct shape from
 *     calendars, kanban, lists, etc.
 * Q3: Pulls from `invoices` (AP and AR flows) and the same source for the
 *     approval queue used in the action queue.
 * Q4: Approve invoices; trigger payment runs; chase aged AR.
 */

import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatNumber } from "../shared/format";

export interface AgingDistribution {
  bucket: "0-30" | "31-60" | "61-90" | "90+";
  count: number;
  totalAmount: string;
}

const BUCKET_TONE: Record<AgingDistribution["bucket"], string> = {
  "0-30": "bg-emerald-500/80",
  "31-60": "bg-amber-500/80",
  "61-90": "bg-orange-500/80",
  "90+": "bg-rose-500/80",
};

export function AgingBuckets({
  ap,
  apState,
  ar,
  arState,
}: {
  ap: AgingDistribution[] | null;
  apState: "loading" | "ok" | "no_data" | "error";
  ar: AgingDistribution[] | null;
  arState: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="AP · AR aging"
      hint="Days overdue · count + total amount"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.slate, "bg-slate-500/70")}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgingPane label="Accounts payable" data={ap} state={apState} />
        <AgingPane label="Accounts receivable" data={ar} state={arState} />
      </div>
    </WorkbenchSection>
  );
}

function AgingPane({
  label,
  data,
  state,
}: {
  label: string;
  data: AgingDistribution[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  if (state !== "ok" || !data) {
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-2">
          {label}
        </div>
        <WorkbenchEmpty state={state === "ok" ? "no_data" : state} />
      </div>
    );
  }
  const totalCount = data.reduce((s, b) => s + b.count, 0);
  const totalAmount = data.reduce((s, b) => s + Number(b.totalAmount), 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          {formatNumber(totalCount)} invoices · ₹{totalAmount.toFixed(0)}
        </span>
      </div>
      <ul className="space-y-1.5 text-xs">
        {data.map((b) => {
          const pct = totalCount > 0 ? (b.count / totalCount) * 100 : 0;
          return (
            <li key={b.bucket}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-medium text-slate-700 dark:text-slate-200">{b.bucket} days</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {b.count} · ₹{Number(b.totalAmount).toFixed(0)}
                </span>
              </div>
              <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
                <div className={cn("h-2 rounded", BUCKET_TONE[b.bucket])} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
