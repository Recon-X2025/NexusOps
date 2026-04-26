/**
 * CSM workbench payload.
 *
 * Aggregator across:
 *   • crmAccounts        — account portfolio cards (ARR × health)
 *   • contracts          — renewals coming up in next 60/90 days
 *   • crmActivities      — recent touchpoints / NPS detractors signal proxy
 *
 * Primary visual: account portfolio grid (cards sized/colored by ARR × health).
 */

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { crmAccounts, contracts, users } from "@nexusops/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface AccountCard {
  id: string;
  name: string;
  industry: string | null;
  tier: string;
  healthScore: number | null;
  annualRevenue: string | null;
  ownerName: string | null;
}

export interface RenewalRow {
  id: string;
  contractNumber: string;
  title: string;
  counterparty: string;
  endDate: string | null;
  value: string | null;
  daysToRenew: number | null;
}

export interface CsmPayload extends WorkbenchEnvelope {
  portfolio: Panel<AccountCard[]>;
  renewals: Panel<RenewalRow[]>;
  /** Histogram: number of accounts per health bucket. */
  healthHistogram: Panel<{ bucket: string; count: number }[]>;
}

export async function buildCsmPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<CsmPayload> {
  const portfolio = await runPanel<AccountCard[]>("csm.portfolio", async () => {
    const rows = await db
      .select({
        id: crmAccounts.id,
        name: crmAccounts.name,
        industry: crmAccounts.industry,
        tier: crmAccounts.tier,
        healthScore: crmAccounts.healthScore,
        annualRevenue: crmAccounts.annualRevenue,
        ownerName: users.name,
      })
      .from(crmAccounts)
      .leftJoin(users, eq(users.id, crmAccounts.ownerId))
      .where(eq(crmAccounts.orgId, orgId))
      .orderBy(asc(crmAccounts.healthScore))
      .limit(40);
    if (!rows.length) return null;
    return rows as AccountCard[];
  });

  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const renewals = await runPanel<RenewalRow[]>("csm.renewals", async () => {
    const rows = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        title: contracts.title,
        counterparty: contracts.counterparty,
        endDate: contracts.endDate,
        value: contracts.value,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.orgId, orgId),
          inArray(contracts.status, ["active", "expiring_soon"]),
          gte(contracts.endDate, now),
          lte(contracts.endDate, in90),
        ),
      )
      .orderBy(asc(contracts.endDate))
      .limit(20);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; contractNumber: string; title: string;
      counterparty: string; endDate: Date | null; value: string | null;
    }): RenewalRow => ({
      id: r.id,
      contractNumber: r.contractNumber,
      title: r.title,
      counterparty: r.counterparty,
      endDate: r.endDate ? r.endDate.toISOString() : null,
      value: r.value,
      daysToRenew: r.endDate
        ? Math.ceil((r.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }));
  });

  const healthHistogram = await runPanel<{ bucket: string; count: number }[]>("csm.healthHistogram", async () => {
    if (portfolio.state !== "ok" || !portfolio.data) return null;
    const buckets = { "at_risk": 0, "watch": 0, "healthy": 0, "champion": 0 };
    for (const a of portfolio.data) {
      const s = a.healthScore ?? 50;
      if (s < 40) buckets.at_risk += 1;
      else if (s < 60) buckets.watch += 1;
      else if (s < 80) buckets.healthy += 1;
      else buckets.champion += 1;
    }
    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  });

  const actions: ActionQueueItem[] = [];
  if (portfolio.state === "ok" && portfolio.data) {
    const atRisk = portfolio.data
      .filter((a) => (a.healthScore ?? 100) < 50)
      .slice(0, 3);
    for (const a of atRisk) {
      actions.push({
        id: `at-risk:${a.id}`,
        label: `${a.name} — Health ${a.healthScore ?? "?"}`,
        hint: a.industry ?? undefined,
        severity: "breach",
        href: `/app/crm/accounts/${a.id}`,
      });
    }
  }
  if (renewals.state === "ok" && renewals.data) {
    const soon = renewals.data.filter((r) => r.daysToRenew !== null && r.daysToRenew < 60).slice(0, 3);
    for (const r of soon) {
      actions.push({
        id: `renewal:${r.id}`,
        label: `${r.counterparty} — Renewal in ${r.daysToRenew}d`,
        hint: r.title,
        severity: "warn",
        href: `/app/contracts/${r.id}`,
      });
    }
  }

  return {
    ...envelope("csm", actions),
    portfolio,
    renewals,
    healthHistogram,
  };
}
