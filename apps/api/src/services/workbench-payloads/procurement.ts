/**
 * Procurement workbench payload.
 *
 * Aggregator across:
 *   • purchaseOrders         — open POs (Kanban by status)
 *   • vendors                — vendor health (status / MSME flag)
 *   • contracts (vendor)     — contract renewals coming up
 *
 * Primary visual: open POs Kanban (columns by PO status).
 */

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { purchaseOrders, vendors, contracts } from "@coheronconnect/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface PoCard {
  id: string;
  poNumber: string;
  vendorName: string | null;
  totalAmount: string;
  status: string;
  expectedDelivery: string | null;
  createdAt: string;
}

export interface VendorRiskRow {
  id: string;
  name: string;
  status: string;
  tdsSection: string;
  isMsme: boolean;
  paymentTerms: string | null;
}

export interface ContractRenewalRow {
  id: string;
  contractNumber: string;
  counterparty: string;
  endDate: string | null;
  daysToRenew: number | null;
}

export interface ProcurementPayload extends WorkbenchEnvelope {
  kanban: Panel<PoCard[]>;
  vendorWatch: Panel<VendorRiskRow[]>;
  contractRenewals: Panel<ContractRenewalRow[]>;
}

const OPEN_PO_STATUSES = [
  "draft",
  "sent",
  "acknowledged",
  "partially_received",
  "received",
] as const;

export async function buildProcurementPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<ProcurementPayload> {
  const kanban = await runPanel<PoCard[]>("procurement.kanban", async () => {
    const rows = await db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        totalAmount: purchaseOrders.totalAmount,
        status: purchaseOrders.status,
        expectedDelivery: purchaseOrders.expectedDelivery,
        createdAt: purchaseOrders.createdAt,
        vendorName: vendors.name,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(
        and(
          eq(purchaseOrders.orgId, orgId),
          inArray(purchaseOrders.status, [...OPEN_PO_STATUSES]),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(60);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; poNumber: string; totalAmount: string;
      status: string; expectedDelivery: Date | null; createdAt: Date;
      vendorName: string | null;
    }): PoCard => ({
      id: r.id,
      poNumber: r.poNumber,
      vendorName: r.vendorName,
      totalAmount: r.totalAmount,
      status: r.status,
      expectedDelivery: r.expectedDelivery ? r.expectedDelivery.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  const vendorWatch = await runPanel<VendorRiskRow[]>("procurement.vendorWatch", async () => {
    const rows = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        status: vendors.status,
        tdsSection: vendors.tdsSection,
        isMsme: vendors.isMsme,
        paymentTerms: vendors.paymentTerms,
      })
      .from(vendors)
      .where(and(eq(vendors.orgId, orgId)))
      .orderBy(asc(vendors.name))
      .limit(15);
    if (!rows.length) return null;
    return rows as VendorRiskRow[];
  });

  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const contractRenewals = await runPanel<ContractRenewalRow[]>("procurement.contractRenewals", async () => {
    const rows = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        counterparty: contracts.counterparty,
        endDate: contracts.endDate,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.orgId, orgId),
          eq(contracts.type, "vendor"),
          gte(contracts.endDate, now),
          lte(contracts.endDate, in60),
        ),
      )
      .orderBy(asc(contracts.endDate))
      .limit(10);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; contractNumber: string; counterparty: string; endDate: Date | null;
    }): ContractRenewalRow => ({
      id: r.id,
      contractNumber: r.contractNumber,
      counterparty: r.counterparty,
      endDate: r.endDate ? r.endDate.toISOString() : null,
      daysToRenew: r.endDate
        ? Math.ceil((r.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }));
  });

  const actions: ActionQueueItem[] = [];
  if (kanban.state === "ok" && kanban.data) {
    const awaiting = kanban.data.filter((p) => p.status === "draft").slice(0, 3);
    for (const p of awaiting) {
      actions.push({
        id: `po-draft:${p.id}`,
        label: `${p.poNumber} — Draft awaiting send`,
        hint: p.vendorName ? `${p.vendorName} · ₹${p.totalAmount}` : `₹${p.totalAmount}`,
        severity: "warn",
        href: `/app/procurement/po/${p.id}`,
      });
    }
  }
  if (contractRenewals.state === "ok" && contractRenewals.data) {
    for (const c of contractRenewals.data.slice(0, 2)) {
      actions.push({
        id: `contract-renew:${c.id}`,
        label: `${c.counterparty} — Contract renews in ${c.daysToRenew}d`,
        severity: "watch",
        href: `/app/contracts/${c.id}`,
      });
    }
  }

  return {
    ...envelope("procurement", actions),
    kanban,
    vendorWatch,
    contractRenewals,
  };
}
