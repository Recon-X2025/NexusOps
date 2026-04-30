/**
 * Service Desk workbench payload.
 *
 * Aggregator across:
 *   • tickets        — live queue, SLA risk, VIP escalations
 *   • oncall         — who is on shift right now
 *   • approvals      — escalations awaiting CAB
 *
 * Primary visual: live queue table with inline assign/escalate actions
 * and an SLA countdown column color-coded by SLA risk.
 */

import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  tickets,
  ticketStatuses,
  ticketPriorities,
  oncallSchedules,
  approvalRequests,
  users,
} from "@coheronconnect/db";
import {
  envelope,
  noData,
  ok,
  panelError,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface QueueRow {
  id: string;
  number: string;
  title: string;
  priority: string;
  /** ms until SLA breach (negative if already breached). */
  slaInMs: number | null;
  /** Color bucket the UI uses for the countdown cell. */
  slaBucket: "ok" | "watch" | "warn" | "breach";
  assignee: string | null;
  channel: string;
}

export interface OnShiftRow {
  scheduleName: string;
  ownerName: string | null;
  /** When current shift ends (ISO) — UI renders countdown. */
  endsAt: string | null;
}

export interface ServiceDeskPayload extends WorkbenchEnvelope {
  queue: Panel<{ items: QueueRow[]; totalCount: number; page: number; totalPages: number }>;
  shift: Panel<OnShiftRow[]>;
  /** Capacity snapshot — open by status. */
  capacity: Panel<{ status: string; count: number }[]>;
}

const QUEUE_LIMIT = 25;

function bucketForSla(slaInMs: number | null): QueueRow["slaBucket"] {
  if (slaInMs === null) return "ok";
  if (slaInMs <= 0) return "breach";
  if (slaInMs <= 30 * 60 * 1000) return "warn";
  if (slaInMs <= 4 * 60 * 60 * 1000) return "watch";
  return "ok";
}

export async function buildServiceDeskPayload({
  db,
  orgId,
  page = 1,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
  page?: number;
}): Promise<ServiceDeskPayload> {
  const now = new Date();

  // ── Queue: open tickets, prioritised by SLA breach risk ──────────────────
  const queue = await runPanel<{ items: QueueRow[]; totalCount: number; page: number; totalPages: number }>("service-desk.queue", async () => {
    try {
      const condition = and(
        eq(tickets.orgId, orgId),
        // exclude resolved/closed tickets
        or(isNull(tickets.resolvedAt), isNull(tickets.closedAt)),
      );

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(condition);
      
      const totalCount = countResult?.count ?? 0;
      const totalPages = Math.ceil(totalCount / QUEUE_LIMIT) || 1;
      const safePage = Math.max(1, Math.min(page, totalPages));
      const offset = (safePage - 1) * QUEUE_LIMIT;

      const rows = await db
        .select({
          id: tickets.id,
          number: tickets.number,
          title: tickets.title,
          priorityName: ticketPriorities.name,
          impact: tickets.impact,
          slaResolveDueAt: tickets.slaResolveDueAt,
          slaBreached: tickets.slaBreached,
          assigneeName: users.name,
          intakeChannel: tickets.intakeChannel,
          isMajor: tickets.isMajorIncident,
          statusName: ticketStatuses.name,
        })
        .from(tickets)
        .leftJoin(ticketPriorities, eq(ticketPriorities.id, tickets.priorityId))
        .leftJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
        .leftJoin(users, eq(users.id, tickets.assigneeId))
        .where(condition)
        .orderBy(
          // null SLA dates sort to the end via NULLS LAST default in PG
          asc(tickets.slaResolveDueAt),
          desc(tickets.createdAt),
        )
        .limit(QUEUE_LIMIT)
        .offset(offset);

      const items = rows.map((r: {
        id: string; number: string; title: string;
        priorityName: string | null; impact: string;
        slaResolveDueAt: Date | null; slaBreached: boolean;
        assigneeName: string | null; intakeChannel: string;
        isMajor: boolean;
      }): QueueRow => {
        const slaInMs = r.slaResolveDueAt
          ? r.slaResolveDueAt.getTime() - now.getTime()
          : null;
        return {
          id: r.id,
          number: r.number,
          title: r.title,
          priority: r.priorityName ?? r.impact ?? "—",
          slaInMs,
          slaBucket: r.slaBreached ? "breach" : bucketForSla(slaInMs),
          assignee: r.assigneeName,
          channel: r.intakeChannel,
        };
      });
      
      return { items, totalCount, page: safePage, totalPages };
    } catch (e) {
      throw e;
    }
  });

  // ── Capacity by status ───────────────────────────────────────────────────
  const capacity = await runPanel<{ status: string; count: number }[]>("service-desk.capacity", async () => {
    const rows = await db
      .select({
        status: ticketStatuses.name,
        count: sql<number>`count(${tickets.id})::int`,
      })
      .from(tickets)
      .leftJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
      .where(and(eq(tickets.orgId, orgId), isNull(tickets.closedAt)))
      .groupBy(ticketStatuses.name)
      .orderBy(desc(sql`count(${tickets.id})`));
    return rows.map((r: { status: string | null; count: number }) => ({
      status: r.status ?? "Unknown",
      count: r.count,
    }));
  });

  // ── On-shift roster ──────────────────────────────────────────────────────
  const shift = await runPanel<OnShiftRow[]>("service-desk.shift", async () => {
    const rows = await db
      .select({
        name: oncallSchedules.name,
        team: oncallSchedules.team,
        members: oncallSchedules.members,
      })
      .from(oncallSchedules)
      .where(eq(oncallSchedules.orgId, orgId))
      .limit(8);
    if (!rows.length) return null;
    return rows.map((r: { name: string; team: string | null; members: Array<{ name: string }> | null }): OnShiftRow => ({
      scheduleName: `${r.name}${r.team ? ` · ${r.team}` : ""}`,
      ownerName: Array.isArray(r.members) && r.members.length > 0 ? (r.members[0]?.name ?? null) : null,
      endsAt: null,
    }));
  });

  // ── Action queue: SLA breach risks + unassigned + VIP escalations ────────
  const actions: ActionQueueItem[] = [];
  if (queue.state === "ok" && queue.data) {
    const breach = queue.data.items.filter((q) => q.slaBucket === "breach").slice(0, 3);
    for (const q of breach) {
      actions.push({
        id: `sla:${q.id}`,
        label: `${q.number} — SLA breached`,
        hint: q.title,
        severity: "breach",
        href: `/app/tickets/${q.id}`,
      });
    }
    const warn = queue.data.items.filter((q) => q.slaBucket === "warn").slice(0, 3);
    for (const q of warn) {
      actions.push({
        id: `warn:${q.id}`,
        label: `${q.number} — SLA in <30m`,
        hint: q.title,
        severity: "warn",
        href: `/app/tickets/${q.id}`,
      });
    }
    const unassigned = queue.data.items.filter((q) => !q.assignee).slice(0, 3);
    for (const q of unassigned) {
      actions.push({
        id: `assign:${q.id}`,
        label: `${q.number} — Unassigned`,
        hint: q.title,
        severity: "watch",
        href: `/app/tickets/${q.id}`,
      });
    }
  }

  // Pending CAB / escalation approvals visible to the service desk lead
  try {
    const pending = await db
      .select({
        id: approvalRequests.id,
        title: approvalRequests.title,
        type: approvalRequests.type,
        requestNumber: approvalRequests.requestNumber,
      })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.orgId, orgId), eq(approvalRequests.status, "pending")))
      .orderBy(asc(approvalRequests.dueDate))
      .limit(3);
    for (const p of pending) {
      actions.push({
        id: `approval:${p.id}`,
        label: `Approval pending — ${p.type ?? "request"}`,
        hint: p.title ?? p.requestNumber ?? undefined,
        severity: "info",
        href: "/app/approvals",
      });
    }
  } catch {
    /* approvals schema variant — skip. */
  }

  return {
    ...envelope("service-desk", actions),
    queue,
    shift,
    capacity,
  };
}

// Mark these as intentionally re-exported so the lint stays clean if a panel
// helper isn't used directly by this file but is part of the shared API.
void panelError;
void noData;
void ok;
