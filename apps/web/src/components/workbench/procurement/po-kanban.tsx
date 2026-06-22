"use client";

/**
 * Primary visual: open POs Kanban (columns by PO status).
 *
 * Q1: Buyer pushes POs across the lifecycle without filtering tables and
 *     digging through approval queues.
 * Q2: KANBAN BY PO STATUS. Distinct from Field Service's WO state lanes
 *     (smaller card scale, different status set, vendor-centric metadata).
 * Q3: Pulls from `purchaseOrders` (kanban), `vendors` (vendor watch),
 *     `contracts` (renewals).
 * Q4: Approve POs awaiting CAB; renew contracts before they expire.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatDate } from "../shared/format";

export interface PoCard {
  id: string;
  poNumber: string;
  vendorName: string | null;
  totalAmount: string;
  status: string;
  expectedDelivery: string | null;
  createdAt: string;
}

const COLUMNS: { status: string; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "sent", label: "Sent" },
  { status: "acknowledged", label: "Acknowledged" },
  { status: "partially_received", label: "Receiving" },
  { status: "received", label: "Received" },
];

export function PoKanban({
  cards,
  state,
}: {
  cards: PoCard[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Open POs"
      hint="Kanban by PO status · drag-equivalent transitions"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.orange, "bg-orange-500/70")}
    >
      {state !== "ok" || !cards ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No open purchase orders." : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          {COLUMNS.map((col) => {
            const items = cards.filter((c) => c.status === col.status);
            return (
              <div
                key={col.status}
                className="rounded-md border border-slate-200 dark:border-slate-700/70 bg-orange-50/40 dark:bg-orange-900/10 p-1.5"
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  <span>{col.label}</span>
                  <span className="rounded bg-white dark:bg-slate-800 px-1 tabular-nums text-slate-700 dark:text-slate-200">
                    {items.length}
                  </span>
                </div>
                <ul className="space-y-1">
                  {items.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/app/procurement/po/${p.id}`}
                        className="block rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-1.5 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
                      >
                        <div className="text-[11px] font-medium text-orange-700 dark:text-orange-300 truncate">{p.poNumber}</div>
                        <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate">{p.vendorName ?? "—"}</div>
                        <div className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          ₹{p.totalAmount} · {formatDate(p.expectedDelivery)}
                        </div>
                      </Link>
                    </li>
                  ))}
                  {items.length > 5 ? (
                    <li className="text-[10px] text-slate-500 dark:text-slate-400 text-center">+{items.length - 5} more</li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </WorkbenchSection>
  );
}
