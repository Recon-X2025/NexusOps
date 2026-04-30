/**
 * Change & Release workbench payload.
 *
 * Aggregator across:
 *   • changes (changeRequests)   — the 14-day calendar / collisions
 *   • changes (changeApprovals)  — pending CAB approvals
 *   • changes (releases)         — upcoming release windows
 *
 * Primary visual: 14-day timeline strip with collision indicators
 * (overlapping change windows on the same day).
 */

import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  changeRequests,
  changeApprovals,
  users,
} from "@coheronconnect/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface ChangeWindowRow {
  id: string;
  number: string;
  title: string;
  risk: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  /** Other change ids whose windows overlap with this one. */
  collisions: string[];
}

export interface CabApprovalRow {
  id: string;
  changeId: string;
  changeNumber: string;
  changeTitle: string;
  approverName: string | null;
  decidedAt: string | null;
}

export interface ChangeReleasePayload extends WorkbenchEnvelope {
  windows: Panel<ChangeWindowRow[]>;
  cab: Panel<CabApprovalRow[]>;
  /** Aggregate: counts of changes by risk level in the window. */
  riskMix: Panel<{ risk: string; count: number }[]>;
}

const HORIZON_DAYS = 14;

function findCollisions(rows: Array<{ id: string; scheduledStart: Date | null; scheduledEnd: Date | null }>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!;
    if (!a.scheduledStart || !a.scheduledEnd) continue;
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      const b = rows[j]!;
      if (!b.scheduledStart || !b.scheduledEnd) continue;
      const overlap =
        a.scheduledStart.getTime() < b.scheduledEnd.getTime() &&
        b.scheduledStart.getTime() < a.scheduledEnd.getTime();
      if (overlap) {
        const arr = out.get(a.id) ?? [];
        arr.push(b.id);
        out.set(a.id, arr);
      }
    }
  }
  return out;
}

export async function buildChangeReleasePayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<ChangeReleasePayload> {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const windows = await runPanel<ChangeWindowRow[]>("change-release.windows", async () => {
    const rows = await db
      .select({
        id: changeRequests.id,
        number: changeRequests.number,
        title: changeRequests.title,
        risk: changeRequests.risk,
        status: changeRequests.status,
        scheduledStart: changeRequests.scheduledStart,
        scheduledEnd: changeRequests.scheduledEnd,
      })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.orgId, orgId),
          gte(changeRequests.scheduledStart, now),
          lte(changeRequests.scheduledStart, horizon),
        ),
      )
      .orderBy(asc(changeRequests.scheduledStart))
      .limit(60);
    if (!rows.length) return null;
    const collisions = findCollisions(rows);
    return rows.map((r: {
      id: string; number: string; title: string;
      risk: string; status: string;
      scheduledStart: Date | null; scheduledEnd: Date | null;
    }): ChangeWindowRow => ({
      id: r.id,
      number: r.number,
      title: r.title,
      risk: r.risk,
      status: r.status,
      scheduledStart: r.scheduledStart ? r.scheduledStart.toISOString() : null,
      scheduledEnd: r.scheduledEnd ? r.scheduledEnd.toISOString() : null,
      collisions: collisions.get(r.id) ?? [],
    }));
  });

  const cab = await runPanel<CabApprovalRow[]>("change-release.cab", async () => {
    const rows = await db
      .select({
        id: changeApprovals.id,
        changeId: changeApprovals.changeId,
        decidedAt: changeApprovals.decidedAt,
        approverName: users.name,
        changeNumber: changeRequests.number,
        changeTitle: changeRequests.title,
      })
      .from(changeApprovals)
      .innerJoin(changeRequests, eq(changeRequests.id, changeApprovals.changeId))
      .leftJoin(users, eq(users.id, changeApprovals.approverId))
      .where(
        and(
          eq(changeRequests.orgId, orgId),
          eq(changeApprovals.decision, "pending"),
        ),
      )
      .limit(20);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; changeId: string; decidedAt: Date | null;
      approverName: string | null; changeNumber: string; changeTitle: string;
    }): CabApprovalRow => ({
      id: r.id,
      changeId: r.changeId,
      changeNumber: r.changeNumber,
      changeTitle: r.changeTitle,
      approverName: r.approverName,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    }));
  });

  const riskMix = await runPanel<{ risk: string; count: number }[]>("change-release.riskMix", async () => {
    if (windows.state !== "ok" || !windows.data) return null;
    const counts = new Map<string, number>();
    for (const w of windows.data) counts.set(w.risk, (counts.get(w.risk) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([risk, count]) => ({ risk, count }))
      .sort((a, b) => b.count - a.count);
  });

  const actions: ActionQueueItem[] = [];
  if (cab.state === "ok" && cab.data) {
    for (const c of cab.data.slice(0, 4)) {
      actions.push({
        id: `cab:${c.id}`,
        label: `${c.changeNumber} — CAB pending`,
        hint: c.changeTitle,
        severity: "warn",
        href: `/app/changes/${c.changeId}`,
      });
    }
  }
  if (windows.state === "ok" && windows.data) {
    const collisions = windows.data.filter((w) => w.collisions.length > 0).slice(0, 3);
    for (const w of collisions) {
      actions.push({
        id: `coll:${w.id}`,
        label: `${w.number} — Window collides with ${w.collisions.length} other`,
        hint: w.title,
        severity: "warn",
        href: `/app/changes/${w.id}`,
      });
    }
  }

  return {
    ...envelope("change-release", actions),
    windows,
    cab,
    riskMix,
  };
}
