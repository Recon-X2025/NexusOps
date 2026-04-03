/**
 * Assignment resolution service.
 *
 * resolveAssignment() is the single source of truth for auto-routing:
 *   • Called directly from tickets.create, work-orders.create, hr.cases.create
 *   • Will be called by the Workflow Engine's ACTION_ASSIGN node (future)
 *
 * Algorithm support:
 *   load_based  — pick agent with fewest open items; tie-break by oldest last_assigned_at
 *   round_robin — cycle purely by oldest last_assigned_at, ignoring current load
 *
 * Capacity protection:
 *   If every eligible agent is at or above capacityThreshold open items,
 *   the item is parked in the team queue (teamId set, assigneeId null)
 *   and the group lead is notified.
 */

import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@nexusops/db";
import { and, eq, inArray, isNull, sql, asc, count } from "@nexusops/db";
import {
  assignmentRules,
  userAssignmentStats,
  teamMembers,
  tickets,
  workOrders,
  hrCases,
} from "@nexusops/db";

type Db = PostgresJsDatabase<typeof schema>;

export type EntityType = "ticket" | "work_order" | "hr_case";

export interface AssignmentInput {
  entityType: EntityType;
  /**
   * The value to match against assignment_rules.match_value:
   *   ticket     → ticket category UUID (or undefined for uncategorised)
   *   work_order → WO type string  (e.g. "corrective")
   *   hr_case    → HR case type string (e.g. "onboarding")
   */
  matchValue?: string | null;
}

export interface AssignmentResult {
  assigneeId: string | null;
  teamId: string;
  algorithm: string;
  parkedAtCapacity: boolean;
}

/**
 * Count open (non-terminal) items per user for capacity calculations.
 */
async function countOpenItems(
  db: Db,
  orgId: string,
  entityType: EntityType,
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  let rows: Array<{ userId: string; c: number }> = [];

  if (entityType === "ticket") {
    // Open = no closedAt (tickets closed when resolvedAt/closedAt set)
    const result = await db
      .select({
        userId: tickets.assigneeId,
        c: count(),
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.orgId, orgId),
          inArray(tickets.assigneeId as any, userIds),
          isNull(tickets.closedAt),
        ),
      )
      .groupBy(tickets.assigneeId);
    rows = result
      .filter((r) => r.userId != null)
      .map((r) => ({ userId: r.userId!, c: Number(r.c) }));

  } else if (entityType === "work_order") {
    const result = await db
      .select({
        userId: workOrders.assignedToId,
        c: count(),
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.orgId, orgId),
          inArray(workOrders.assignedToId as any, userIds),
          // Terminal states: complete, cancelled, closed
          sql`${workOrders.state} NOT IN ('complete', 'cancelled', 'closed')`,
        ),
      )
      .groupBy(workOrders.assignedToId);
    rows = result
      .filter((r) => r.userId != null)
      .map((r) => ({ userId: r.userId!, c: Number(r.c) }));

  } else {
    // hr_case — count all assigned (no standardised terminal state in schema)
    const result = await db
      .select({
        userId: hrCases.assigneeId,
        c: count(),
      })
      .from(hrCases)
      .where(
        and(
          eq(hrCases.orgId, orgId),
          inArray(hrCases.assigneeId as any, userIds),
        ),
      )
      .groupBy(hrCases.assigneeId);
    rows = result
      .filter((r) => r.userId != null)
      .map((r) => ({ userId: r.userId!, c: Number(r.c) }));
  }

  const map = new Map<string, number>();
  for (const row of rows) map.set(row.userId, row.c);
  return map;
}

/**
 * Main entry point. Returns null when no matching rule exists for this org/entity.
 */
export async function resolveAssignment(
  db: Db,
  orgId: string,
  input: AssignmentInput,
): Promise<AssignmentResult | null> {
  const { entityType, matchValue } = input;

  // ── 1. Find the best matching rule ─────────────────────────────────────────
  // Prefer specific match (matchValue = input) over catch-all (matchValue IS NULL).
  // Within same specificity, higher sortOrder wins.
  const allRules = await db
    .select()
    .from(assignmentRules)
    .where(
      and(
        eq(assignmentRules.orgId, orgId),
        eq(assignmentRules.entityType, entityType),
        eq(assignmentRules.isActive, true),
      ),
    )
    .orderBy(asc(assignmentRules.sortOrder));

  if (allRules.length === 0) return null;

  const specificRule = allRules.find(
    (r) => r.matchValue != null && r.matchValue === matchValue,
  );
  const fallbackRule = allRules.find((r) => r.matchValue == null);
  const rule = specificRule ?? fallbackRule ?? null;

  if (!rule) return null;

  // ── 2. Resolve team members ─────────────────────────────────────────────────
  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, rule.teamId));

  if (members.length === 0) {
    // Team exists but has no members — park in queue
    return {
      assigneeId: null,
      teamId: rule.teamId,
      algorithm: rule.algorithm,
      parkedAtCapacity: false,
    };
  }

  const userIds = members.map((m) => m.userId);

  // ── 3. Load stats (for round-robin tie-breaking / ordering) ─────────────────
  const stats = await db
    .select()
    .from(userAssignmentStats)
    .where(
      and(
        eq(userAssignmentStats.orgId, orgId),
        inArray(userAssignmentStats.userId, userIds),
        eq(userAssignmentStats.entityType, entityType),
      ),
    );

  const lastAssignedMap = new Map<string, Date>();
  for (const s of stats) lastAssignedMap.set(s.userId, s.lastAssignedAt);

  const epoch = new Date(0); // Never-assigned users sort first in round-robin

  // ── 4. Count open items per member ─────────────────────────────────────────
  const openCountMap = await countOpenItems(db, orgId, entityType, userIds);

  // ── 5. Pick candidate ──────────────────────────────────────────────────────
  let selectedUserId: string | null = null;

  if (rule.algorithm === "round_robin") {
    // Pure round-robin: sort by last_assigned_at ASC, pick first
    const sorted = [...userIds].sort((a, b) => {
      const ta = lastAssignedMap.get(a) ?? epoch;
      const tb = lastAssignedMap.get(b) ?? epoch;
      return ta.getTime() - tb.getTime();
    });
    selectedUserId = sorted[0] ?? null;

  } else {
    // load_based (default): min open count, tie-break by oldest last_assigned_at
    const sorted = [...userIds].sort((a, b) => {
      const ca = openCountMap.get(a) ?? 0;
      const cb = openCountMap.get(b) ?? 0;
      if (ca !== cb) return ca - cb;
      const ta = lastAssignedMap.get(a) ?? epoch;
      const tb = lastAssignedMap.get(b) ?? epoch;
      return ta.getTime() - tb.getTime();
    });
    selectedUserId = sorted[0] ?? null;
  }

  if (!selectedUserId) return null;

  // ── 6. Capacity check ──────────────────────────────────────────────────────
  const openCount = openCountMap.get(selectedUserId) ?? 0;
  if (openCount >= rule.capacityThreshold) {
    // Every eligible agent is at capacity — park in team queue
    return {
      assigneeId: null,
      teamId: rule.teamId,
      algorithm: rule.algorithm,
      parkedAtCapacity: true,
    };
  }

  // ── 7. Update last_assigned_at ─────────────────────────────────────────────
  // Upsert: ON CONFLICT update last_assigned_at
  await db
    .insert(userAssignmentStats)
    .values({
      orgId,
      userId: selectedUserId,
      entityType,
      lastAssignedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        userAssignmentStats.orgId,
        userAssignmentStats.userId,
        userAssignmentStats.entityType,
      ],
      set: { lastAssignedAt: new Date() },
    });

  return {
    assigneeId: selectedUserId,
    teamId: rule.teamId,
    algorithm: rule.algorithm,
    parkedAtCapacity: false,
  };
}
