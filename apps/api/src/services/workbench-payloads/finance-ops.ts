/**
 * AP / AR (finance-ops) workbench payload.
 *
 * Aggregator across:
 *   • invoices (invoiceFlow=payable)     — AP aging buckets
 *   • invoices (invoiceFlow=receivable)  — AR aging buckets
 *   • invoices (status=pending_approval) — invoices awaiting approval (action queue)
 *
 * Primary visual: dual-pane aging buckets (AP | AR side by side).
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { invoices } from "@nexusops/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export interface AgingDistribution {
  bucket: AgingBucket;
  count: number;
  totalAmount: string;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  flow: "payable" | "receivable";
  amount: string;
  dueDate: string | null;
  status: string;
  daysOverdue: number;
}

export interface FinanceOpsPayload extends WorkbenchEnvelope {
  apAging: Panel<AgingDistribution[]>;
  arAging: Panel<AgingDistribution[]>;
  approvalQueue: Panel<InvoiceRow[]>;
}

function bucket(now: Date, dueDate: Date | null): AgingBucket {
  if (!dueDate) return "0-30";
  const days = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

async function ageingPanel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  flow: "payable" | "receivable",
  name: string,
): Promise<Panel<AgingDistribution[]>> {
  return runPanel<AgingDistribution[]>(name, async () => {
    const rows = await db
      .select({
        id: invoices.id,
        amount: invoices.amount,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, orgId),
          eq(invoices.invoiceFlow, flow),
          inArray(invoices.status, ["pending", "approved", "overdue"]),
        ),
      )
      .limit(2000);
    if (!rows.length) return null;
    const now = new Date();
    const acc = new Map<AgingBucket, { count: number; total: number }>();
    for (const r of rows) {
      const b = bucket(now, r.dueDate);
      const cur = acc.get(b) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.amount ?? "0");
      acc.set(b, cur);
    }
    const order: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];
    return order.map((b) => ({
      bucket: b,
      count: acc.get(b)?.count ?? 0,
      totalAmount: (acc.get(b)?.total ?? 0).toFixed(2),
    }));
  });
}

export async function buildFinanceOpsPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<FinanceOpsPayload> {
  const apAging = await ageingPanel(db, orgId, "payable", "finance-ops.apAging");
  const arAging = await ageingPanel(db, orgId, "receivable", "finance-ops.arAging");

  const approvalQueue = await runPanel<InvoiceRow[]>("finance-ops.approvalQueue", async () => {
    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoices.amount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        invoiceFlow: invoices.invoiceFlow,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, orgId),
          inArray(invoices.status, ["pending"]),
        ),
      )
      .orderBy(asc(invoices.dueDate))
      .limit(20);
    if (!rows.length) return null;
    const now = new Date();
    return rows.map((r: {
      id: string; invoiceNumber: string; amount: string;
      dueDate: Date | null; status: string; invoiceFlow: string;
    }): InvoiceRow => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      flow: r.invoiceFlow === "receivable" ? "receivable" : "payable",
      amount: r.amount,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      status: r.status,
      daysOverdue: r.dueDate
        ? Math.max(0, Math.floor((now.getTime() - r.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
        : 0,
    }));
  });

  const actions: ActionQueueItem[] = [];
  if (approvalQueue.state === "ok" && approvalQueue.data) {
    for (const inv of approvalQueue.data.slice(0, 4)) {
      actions.push({
        id: `inv-approve:${inv.id}`,
        label: `${inv.invoiceNumber} — Awaiting approval`,
        hint: `${inv.flow.toUpperCase()} · ₹${inv.amount}`,
        severity: inv.daysOverdue > 30 ? "breach" : "warn",
        href: `/app/finance/invoices/${inv.id}`,
      });
    }
  }
  if (arAging.state === "ok" && arAging.data) {
    const aged = arAging.data.find((b) => b.bucket === "90+");
    if (aged && aged.count > 0) {
      actions.push({
        id: "ar-90plus",
        label: `${aged.count} AR invoices > 90 days`,
        hint: `Total exposure ₹${aged.totalAmount}`,
        severity: "breach",
        href: "/app/finance/receivables",
      });
    }
  }

  return {
    ...envelope("finance-ops", actions),
    apAging,
    arAging,
    approvalQueue,
  };
}
