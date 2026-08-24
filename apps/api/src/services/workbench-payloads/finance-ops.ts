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

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { invoices } from "@coheronconnect/db";
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

async function ageingPanel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  flow: "payable" | "receivable",
  name: string,
): Promise<Panel<AgingDistribution[]>> {
  return runPanel<AgingDistribution[]>(name, async () => {
    // Bucket and total in SQL, not in JS over a capped fetch. The previous
    // version pulled `.limit(2000)` rows and summed them in memory, so any org
    // with more than 2,000 open invoices had its ageing counts AND its rupee
    // exposure computed over an arbitrary (unordered) subset. GROUP BY covers
    // every matching row. Boundaries mirror the old bucket(): a null due date
    // and anything up to 30 days overdue fall in "0-30".
    const nowTs = new Date().toISOString();
    const daysOverdue = sql`FLOOR(EXTRACT(EPOCH FROM (${nowTs}::timestamptz - ${invoices.dueDate})) / 86400)`;
    const bucketExpr = sql<AgingBucket>`CASE
      WHEN ${invoices.dueDate} IS NULL THEN '0-30'
      WHEN ${daysOverdue} <= 30 THEN '0-30'
      WHEN ${daysOverdue} <= 60 THEN '31-60'
      WHEN ${daysOverdue} <= 90 THEN '61-90'
      ELSE '90+'
    END`;
    const rows = (await db
      .select({
        bucket: bucketExpr,
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${invoices.amount}), 0)::text`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, orgId),
          eq(invoices.invoiceFlow, flow),
          inArray(invoices.status, ["pending", "approved", "overdue"]),
        ),
      )
      // GROUP BY the output column's ordinal, not the CASE expression: the
      // bucket expression carries a bound parameter (`now`), and re-emitting it
      // in GROUP BY binds a different placeholder, so Postgres cannot match the
      // two and rejects `due_date` as ungrouped (error 42803).
      .groupBy(sql`1`)) as Array<{ bucket: AgingBucket; count: number; total: string }>;
    if (!rows.length) return null;
    const acc = new Map<AgingBucket, { count: number; total: number }>();
    for (const r of rows) {
      acc.set(r.bucket, { count: Number(r.count), total: Number(r.total) });
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
        href: `/app/financial/invoices/${inv.id}`,
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
        // No dedicated receivables route; the financial module index lists them.
        href: "/app/financial",
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
