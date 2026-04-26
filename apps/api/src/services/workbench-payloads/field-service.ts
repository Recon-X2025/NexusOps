/**
 * Field Service workbench payload.
 *
 * Aggregator across:
 *   • workOrders                — open / dispatched WOs feed the dispatch board
 *   • workOrders (assigned)     — technician load
 *   • workOrders (parts queue)  — WOs blocked awaiting parts (state-derived)
 *
 * Primary visual: dispatch board (unassigned vs in-progress vs en-route columns).
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { workOrders, users } from "@nexusops/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface DispatchRow {
  id: string;
  number: string;
  shortDescription: string;
  state: string;
  priority: string;
  location: string | null;
  assigneeName: string | null;
  scheduledStart: string | null;
}

export interface TechnicianLoad {
  technicianId: string;
  technicianName: string | null;
  openCount: number;
  inProgressCount: number;
}

export interface FieldServicePayload extends WorkbenchEnvelope {
  board: Panel<DispatchRow[]>;
  technicianLoad: Panel<TechnicianLoad[]>;
  /** Counts grouped by WO state — feeds the column headers. */
  stateCounts: Panel<{ state: string; count: number }[]>;
}

export async function buildFieldServicePayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<FieldServicePayload> {
  const ACTIVE_STATES = [
    "open",
    "pending_dispatch",
    "dispatched",
    "work_in_progress",
    "on_hold",
  ] as const;

  const board = await runPanel<DispatchRow[]>("field-service.board", async () => {
    const rows = await db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        shortDescription: workOrders.shortDescription,
        state: workOrders.state,
        priority: workOrders.priority,
        location: workOrders.location,
        assigneeId: workOrders.assignedToId,
        scheduledStart: workOrders.scheduledStartDate,
        assigneeName: users.name,
      })
      .from(workOrders)
      .leftJoin(users, eq(users.id, workOrders.assignedToId))
      .where(and(eq(workOrders.orgId, orgId), inArray(workOrders.state, [...ACTIVE_STATES])))
      .orderBy(asc(workOrders.scheduledStartDate))
      .limit(50);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; number: string; shortDescription: string;
      state: string; priority: string; location: string | null;
      assigneeName: string | null; scheduledStart: Date | null;
    }): DispatchRow => ({
      id: r.id,
      number: r.number,
      shortDescription: r.shortDescription,
      state: r.state,
      priority: r.priority,
      location: r.location,
      assigneeName: r.assigneeName,
      scheduledStart: r.scheduledStart ? r.scheduledStart.toISOString() : null,
    }));
  });

  const technicianLoad = await runPanel<TechnicianLoad[]>("field-service.technicianLoad", async () => {
    if (board.state !== "ok" || !board.data) return null;
    const acc = new Map<string, TechnicianLoad>();
    for (const r of board.data) {
      if (!r.assigneeName) continue;
      const key = r.assigneeName;
      const existing = acc.get(key) ?? {
        technicianId: key,
        technicianName: r.assigneeName,
        openCount: 0,
        inProgressCount: 0,
      };
      if (r.state === "work_in_progress" || r.state === "dispatched") existing.inProgressCount += 1;
      else existing.openCount += 1;
      acc.set(key, existing);
    }
    const list = Array.from(acc.values()).sort(
      (a, b) => b.openCount + b.inProgressCount - (a.openCount + a.inProgressCount),
    );
    return list.length ? list : null;
  });

  const stateCounts = await runPanel<{ state: string; count: number }[]>("field-service.stateCounts", async () => {
    if (board.state !== "ok" || !board.data) return null;
    const counts = new Map<string, number>();
    for (const r of board.data) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
  });

  const actions: ActionQueueItem[] = [];
  if (board.state === "ok" && board.data) {
    const unassigned = board.data.filter((r) => !r.assigneeName).slice(0, 4);
    for (const r of unassigned) {
      actions.push({
        id: `wo-unassigned:${r.id}`,
        label: `${r.number} — Needs dispatch`,
        hint: r.location ? `${r.shortDescription} · ${r.location}` : r.shortDescription,
        severity: r.priority.startsWith("1_") || r.priority.startsWith("2_") ? "warn" : "watch",
        href: `/app/work-orders/${r.id}`,
      });
    }
  }

  return {
    ...envelope("field-service", actions),
    board,
    technicianLoad,
    stateCounts,
  };
}
