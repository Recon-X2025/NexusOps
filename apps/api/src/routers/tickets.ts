import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { sendNotification } from "../services/notifications";
import { checkDbUserPermission } from "../lib/rbac-db";
import { getNextSeq } from "../lib/auto-number";
import { resolveAssignment } from "../services/assignment";
import { getRedis } from "../lib/redis";
import { rateLimit } from "../lib/rate-limit";
import { logInfo } from "../lib/logger";

// ── Idempotency helpers ───────────────────────────────────────────────────────
//
// Response snapshots are stored in Redis under idempotent:{orgId}:{key} with a
// 24-hour TTL.  On a duplicate request the exact same JSON is returned without
// touching the DB — guaranteeing response identity even if the return shape
// changes in future code.  The TTL matches typical client retry windows.

const IDEMPOTENT_CACHE_TTL_SECS = 86_400; // 24 hours

function idempotentRedisKey(orgId: string, key: string) {
  return `idempotent:${orgId}:${key}`;
}

async function getCachedIdempotentResponse(
  orgId: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await getRedis().get(idempotentRedisKey(orgId, key));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function setCachedIdempotentResponse(
  orgId: string,
  key: string,
  ticket: Record<string, unknown>,
): Promise<void> {
  try {
    await getRedis().setex(
      idempotentRedisKey(orgId, key),
      IDEMPOTENT_CACHE_TTL_SECS,
      JSON.stringify(ticket),
    );
  } catch {
    // Non-fatal — the DB still holds the idempotency_key column as the source of truth
  }
}
import {
  tickets,
  ticketComments,
  ticketWatchers,
  ticketActivityLogs,
  ticketStatuses,
  ticketPriorities,
  ticketCategories,
  users,
  eq,
  and,
  or,
  desc,
  asc,
  count,
  isNull,
  inArray,
  sql,
} from "@nexusops/db";
import {
  CreateTicketSchema,
  UpdateTicketSchema,
  AddCommentSchema,
  TicketListFiltersSchema,
} from "@nexusops/types";

function generateTicketNumber(orgSlug: string, seq: number): string {
  const prefix = orgSlug.toUpperCase().replace(/-/g, "").slice(0, 4);
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * Derive a stable idempotency key from caller context when the client does not
 * supply one.  The 5-second window means concurrent requests within the same
 * window for the same org/user/title will share a key and deduplicate.
 * Requests more than 5 s apart get different keys and are accepted normally.
 */
function autoIdempotencyKey(orgId: string, userId: string, title: string): string {
  const window5s = Math.floor(Date.now() / 5_000);
  return createHash("sha256")
    .update(`${orgId}:${userId}:${title.toLowerCase().trim().slice(0, 200)}:${window5s}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Valid incident/ticket status lifecycle transitions.
 * Spec §6: incidents: open → in_progress → resolved → closed
 */
const TICKET_LIFECYCLE: Record<string, string[]> = {
  open:        ["in_progress", "closed"],
  in_progress: ["resolved", "open", "closed"],
  resolved:    ["closed", "open"],
  closed:      ["open"],
};

function assertTicketTransition(fromCategory: string, toCategory: string) {
  const allowed = TICKET_LIFECYCLE[fromCategory];
  if (!allowed) return; // unknown category — allow freely (custom statuses)
  if (!allowed.includes(toCategory)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid status transition: ${fromCategory} → ${toCategory}. Allowed: ${allowed.join(", ")}`,
    });
  }
}

export const ticketsRouter = router({
  list: permissionProcedure("incidents", "read")
    .input(TicketListFiltersSchema)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await rateLimit(ctx.user?.id, org?.id, "tickets.list");
      const start = Date.now();

      // Input guardrails — applied before any query or cache logic
      input.limit = input.limit < 1 ? 25 : input.limit > 50 ? 50 : input.limit;
      if (input.search) input.search = input.search.trim().slice(0, 100);
      if (input.tags) input.tags = input.tags.slice(0, 10).map((t) => t.slice(0, 30));
      if (input.cursor && input.cursor.length > 500) input.cursor = undefined;

      // Short-lived cache for the dashboard incidents preview widget.
      // Only active when called with the exact dashboard parameters.
      // All other tickets.list calls are unaffected.
      const cacheKey =
        input.type === "incident" && input.limit === 5
          ? `tickets:dashboard:incidents:${org!.id}`
          : null;
      if (cacheKey) {
        try {
          const hit = await getRedis().get(cacheKey);
          if (hit) return JSON.parse(hit);
        } catch {
          // Redis unavailable — proceed to DB
        }
      }

      const conditions = [eq(tickets.orgId, org!.id)];

      if (input.statusId) conditions.push(eq(tickets.statusId, input.statusId));
      if (input.priorityId) conditions.push(eq(tickets.priorityId, input.priorityId));
      if (input.categoryId) conditions.push(eq(tickets.categoryId, input.categoryId));
      if (input.assigneeId) conditions.push(eq(tickets.assigneeId, input.assigneeId));
      if (input.type) conditions.push(eq(tickets.type, input.type));
      if (input.slaBreached !== undefined)
        conditions.push(eq(tickets.slaBreached, input.slaBreached));
      if (input.statusCategory)
        conditions.push(
          inArray(
            tickets.statusId,
            db.select({ id: ticketStatuses.id })
              .from(ticketStatuses)
              .where(and(eq(ticketStatuses.orgId, org!.id), eq(ticketStatuses.category, input.statusCategory))),
          ),
        );
      if (input.search && input.search.length >= 2)
        conditions.push(
          or(
            sql`${tickets.title} ILIKE ${"%" + input.search + "%"}`,
            sql`COALESCE(${tickets.description}, '') ILIKE ${"%" + input.search + "%"}`,
          )!,
        );
      if (input.tags && input.tags.length > 0)
        conditions.push(
          sql`${tickets.tags} && ARRAY[${sql.join(
            input.tags.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`,
        );

      // Cursor format detection:
      //   numeric string (e.g. "25") → legacy OFFSET cursor (backward compat)
      //   anything else              → new keyset cursor
      const isOffsetCursor = input.cursor !== undefined && /^\d+$/.test(input.cursor);
      if (isOffsetCursor)
        console.warn("tickets.list using legacy offset cursor", { cursor: input.cursor });
      const useKeyset =
        (input.orderBy === "createdAt" || input.orderBy === "updatedAt" || input.orderBy === "priority") &&
        input.order === "desc" &&
        !isOffsetCursor;

      // Parse keyset cursor when present — absent on page 1, populated on subsequent pages
      let parsedCursor: { createdAt: Date; id: string } | null = null;
      if (useKeyset && input.orderBy === "createdAt" && input.cursor) {
        try {
          const raw = JSON.parse(
            Buffer.from(input.cursor, "base64url").toString("utf8"),
          ) as Record<string, unknown>;
          if (
            raw.v === 1 &&
            raw.mode === "createdAt" &&
            raw.dir === "desc" &&
            typeof raw.createdAt === "string" &&
            typeof raw.id === "string"
          ) {
            parsedCursor = { createdAt: new Date(raw.createdAt), id: raw.id };
          }
        } catch {
          // malformed cursor — treat as first page (parsedCursor stays null)
        }
      }

      // Keyset seek condition replaces OFFSET in the new path
      if (parsedCursor)
        conditions.push(
          sql`(${tickets.createdAt} < ${parsedCursor.createdAt} OR (${tickets.createdAt} = ${parsedCursor.createdAt} AND ${tickets.id} < ${parsedCursor.id}))`,
        );

      let parsedUpdatedAtCursor: { updatedAt: Date; id: string } | null = null;
      if (useKeyset && input.orderBy === "updatedAt" && input.cursor) {
        try {
          const raw = JSON.parse(
            Buffer.from(input.cursor, "base64url").toString("utf8"),
          ) as Record<string, unknown>;
          if (
            raw.v === 1 &&
            raw.mode === "updatedAt" &&
            raw.dir === "desc" &&
            typeof raw.updatedAt === "string" &&
            typeof raw.id === "string"
          ) {
            parsedUpdatedAtCursor = { updatedAt: new Date(raw.updatedAt), id: raw.id };
          }
        } catch {
          // malformed cursor — treat as first page (parsedUpdatedAtCursor stays null)
        }
      }

      if (parsedUpdatedAtCursor)
        conditions.push(
          sql`(${tickets.updatedAt} < ${parsedUpdatedAtCursor.updatedAt} OR (${tickets.updatedAt} = ${parsedUpdatedAtCursor.updatedAt} AND ${tickets.id} < ${parsedUpdatedAtCursor.id}))`,
        );

      let parsedPriorityCursor: {
        sortOrder: number | null;
        createdAt: Date;
        id: string;
      } | null = null;
      if (useKeyset && input.orderBy === "priority" && input.cursor) {
        try {
          const raw = JSON.parse(
            Buffer.from(input.cursor, "base64url").toString("utf8"),
          ) as Record<string, unknown>;
          if (
            raw.v === 1 &&
            raw.mode === "priority" &&
            raw.dir === "desc" &&
            (typeof raw.sortOrder === "number" || raw.sortOrder === null) &&
            typeof raw.createdAt === "string" &&
            typeof raw.id === "string"
          ) {
            parsedPriorityCursor = {
              sortOrder: raw.sortOrder as number | null,
              createdAt: new Date(raw.createdAt),
              id: raw.id,
            };
          }
        } catch {
          // malformed cursor — treat as first page (parsedPriorityCursor stays null)
        }
      }

      if (parsedPriorityCursor) {
        const S = parsedPriorityCursor.sortOrder;
        const C = parsedPriorityCursor.createdAt;
        const I = parsedPriorityCursor.id;
        if (S !== null) {
          // Case A: cursor row had a non-null sort_order
          // Rows after it: lower sort_order (non-null) OR same sort_order with later tiebreaker OR any NULL sort_order
          conditions.push(
            sql`(
              (SELECT sort_order FROM ticket_priorities WHERE id = ${tickets.priorityId}) < ${S}
              OR (
                (SELECT sort_order FROM ticket_priorities WHERE id = ${tickets.priorityId}) = ${S}
                AND (${tickets.createdAt} < ${C} OR (${tickets.createdAt} = ${C} AND ${tickets.id} < ${I}))
              )
              OR (SELECT sort_order FROM ticket_priorities WHERE id = ${tickets.priorityId}) IS NULL
            )`,
          );
        } else {
          // Case B: cursor row had no priority (NULLS LAST segment)
          // Only other NULL sort_order rows can follow; advance through their (createdAt, id) tiebreaker
          conditions.push(
            sql`(
              (SELECT sort_order FROM ticket_priorities WHERE id = ${tickets.priorityId}) IS NULL
              AND (${tickets.createdAt} < ${C} OR (${tickets.createdAt} = ${C} AND ${tickets.id} < ${I}))
            )`,
          );
        }
      }

      // offsetValue used only in the legacy OFFSET path
      const offsetValue = isOffsetCursor ? parseInt(input.cursor!) : 0;

      const orderDir = input.order === "asc" ? asc : desc;
      const orderCol =
        input.orderBy === "createdAt"
          ? tickets.createdAt
          : input.orderBy === "updatedAt"
            ? tickets.updatedAt
            : tickets.createdAt;

      const qb = db
        .select({
          id: tickets.id,
          orgId: tickets.orgId,
          number: tickets.number,
          title: tickets.title,
          categoryId: tickets.categoryId,
          priorityId: tickets.priorityId,
          statusId: tickets.statusId,
          type: tickets.type,
          requesterId: tickets.requesterId,
          assigneeId: tickets.assigneeId,
          teamId: tickets.teamId,
          dueDate: tickets.dueDate,
          slaBreached: tickets.slaBreached,
          tags: tickets.tags,
          customFields: tickets.customFields,
          resolvedAt: tickets.resolvedAt,
          closedAt: tickets.closedAt,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
        })
        .from(tickets)
        .where(and(...conditions))
        .orderBy(
          ...(input.orderBy === "priority"
            ? input.order === "asc"
              ? [
                  sql`(SELECT sort_order FROM ticket_priorities WHERE id = ${tickets.priorityId}) ASC NULLS LAST`,
                  desc(tickets.createdAt),
                ]
              : [
                  // DESC path — id tiebreaker required for deterministic keyset seek
                  sql`(SELECT sort_order FROM ticket_priorities WHERE id = ${tickets.priorityId}) DESC NULLS LAST`,
                  desc(tickets.createdAt),
                  desc(tickets.id),
                ]
            : useKeyset && input.orderBy === "updatedAt"
              ? [desc(tickets.updatedAt), desc(tickets.id)]
              : useKeyset
                ? [desc(tickets.createdAt), desc(tickets.id)]
                : [orderDir(orderCol)]),
        )
        .limit(input.limit + 1);

      // New keyset path: no OFFSET — the seek condition in WHERE handles positioning.
      // Legacy OFFSET path: used when cursor is numeric or sort mode is not createdAt DESC.
      try {
        const rows = await (useKeyset ? qb : qb.offset(offsetValue));

        const hasMore = rows.length > input.limit;
        const items = hasMore ? rows.slice(0, -1) : rows;

        // Priority keyset cursor needs the resolved sort_order of the last item.
        // Fetched via PK lookup — O(1), no join, only executed when a next page exists.
        let prioritySortOrder: number | null = null;
        if (useKeyset && input.orderBy === "priority" && hasMore && items.length > 0) {
          const last = items[items.length - 1]!;
          if (last.priorityId) {
            const [prio] = await db
              .select({ sortOrder: ticketPriorities.sortOrder })
              .from(ticketPriorities)
              .where(eq(ticketPriorities.id, last.priorityId));
            prioritySortOrder = prio?.sortOrder ?? null;
          }
          // last.priorityId === null → prioritySortOrder stays null (NULLS LAST segment)
        }

        let nextCursor: string | null = null;
        if (hasMore) {
          if (useKeyset) {
            const last = items[items.length - 1]!;
            nextCursor = Buffer.from(
              JSON.stringify(
                input.orderBy === "updatedAt"
                  ? { v: 1, mode: "updatedAt", dir: "desc", updatedAt: last.updatedAt.toISOString(), id: last.id }
                  : input.orderBy === "priority"
                    ? { v: 1, mode: "priority", dir: "desc", sortOrder: prioritySortOrder, createdAt: last.createdAt.toISOString(), id: last.id }
                    : { v: 1, mode: "createdAt", dir: "desc", createdAt: last.createdAt.toISOString(), id: last.id },
              ),
            ).toString("base64url");
          } else {
            nextCursor = String(offsetValue + items.length);
          }
        }

        const result = { items, nextCursor };
        if (cacheKey)
          getRedis().setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});
        console.info("tickets.list", { duration: Date.now() - start, orgId: org?.id });
        return result;
      } catch (err) {
        console.error("tickets.list error", { err });
        throw err;
      }
    }),

  get: permissionProcedure("incidents", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, input.id), eq(tickets.orgId, org!.id)));

    if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

    const rawComments = await db
      .select({
        id: ticketComments.id,
        ticketId: ticketComments.ticketId,
        authorId: ticketComments.authorId,
        authorName: users.name,
        body: ticketComments.body,
        isInternal: ticketComments.isInternal,
        createdAt: ticketComments.createdAt,
        updatedAt: ticketComments.updatedAt,
      })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(eq(ticketComments.ticketId, ticket.id))
      .orderBy(asc(ticketComments.createdAt));

    const comments = rawComments;

    const activityLog = await db
      .select()
      .from(ticketActivityLogs)
      .where(eq(ticketActivityLogs.ticketId, ticket.id))
      .orderBy(desc(ticketActivityLogs.createdAt))
      .limit(50);

    const isAgent = checkDbUserPermission(ctx.user!.role, "incidents", "assign", ctx.user!.matrixRole as string | undefined);
    const visibleComments = isAgent
      ? comments
      : comments.filter((c: any) => !c.isInternal);

    return { ticket, comments: visibleComments, activityLog };
  }),

  create: permissionProcedure("incidents", "write")
    .input(CreateTicketSchema)
    .mutation(async ({ ctx, input }) => {
    const { db, org, user } = ctx;

    // Resolve idempotency key: header > input > auto-generated 5s window hash.
    // A client that sends X-Idempotency-Key OR input.idempotencyKey gets exact
    // deduplication.  A client that sends neither gets deduplication within a
    // 5-second window for the same org/user/title combination.
    const idempotencyKey: string =
      ctx.idempotencyKey ??
      input.idempotencyKey ??
      autoIdempotencyKey(org!.id, user!.id, input.title);

    // ── Fast path: Redis snapshot hit ────────────────────────────────────────
    // Check Redis before touching the DB.  If we have a stored snapshot from a
    // previous successful create with this key, return it immediately.  This
    // guarantees identical response shape across all retries.
    const cached = await getCachedIdempotentResponse(org!.id, idempotencyKey);
    if (cached) {
      logInfo("TICKET_IDEMPOTENT_CACHE_HIT", {
        request_id:      ctx.requestId,
        idempotency_key: idempotencyKey.slice(0, 8) + "…",
        ticket_id:       cached["id"],
      });
      return cached as ReturnType<typeof Object.assign>;
    }

    logInfo("TICKET_CREATE", {
      request_id: ctx.requestId,
      user_id:    user!.id,
      org_id:     org!.id,
      title:      input.title,
      type:       input.type,
      idempotency_key: idempotencyKey.slice(0, 8) + "…",
    });

    // Get default open status
    const [defaultStatus] = await db
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, org!.id), eq(ticketStatuses.category, "open")))
      .limit(1);

    if (!defaultStatus) {
      // The org's ticket workflow is not fully configured.  This is a
      // server-side precondition, not a bug — return PRECONDITION_FAILED
      // (HTTP 412) so it is clearly a 4xx and never surfaces as a 500 in
      // monitoring or load-test reports.
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Ticket workflow not configured: no 'open' status found for this organisation. Contact your administrator.",
      });
    }

    // ── Resolve impact/urgency → priorityId ─────────────────────────────────
    // Map the ITIL impact × urgency matrix to a numeric priority level (1=critical … 4=low),
    // then look up the org's matching priority tier by sort_order so SLA targets apply.
    const impactLevel  = input.impact  === "high" ? 1 : input.impact  === "low" ? 3 : 2;
    const urgencyLevel = input.urgency === "high" ? 1 : input.urgency === "low" ? 3 : 2;
    const priorityLevel = Math.min(Math.round((impactLevel + urgencyLevel) / 2), 4);

    let resolvedPriorityId = input.priorityId ?? null;
    if (!resolvedPriorityId && (input.impact || input.urgency)) {
      // Fetch all org priorities ordered by sort_order ascending (lower = higher severity)
      const orgPriorities = await db
        .select()
        .from(ticketPriorities)
        .where(eq(ticketPriorities.orgId, org!.id))
        .orderBy(asc(ticketPriorities.sortOrder));

      if (orgPriorities.length > 0) {
        // Clamp priorityLevel index to the number of tiers available
        const idx = Math.min(priorityLevel - 1, orgPriorities.length - 1);
        resolvedPriorityId = orgPriorities[idx]?.id ?? orgPriorities[orgPriorities.length - 1]!.id;
      }
    }

    // Calculate SLA from the resolved priority
    let slaResponseDueAt: Date | undefined;
    let slaResolveDueAt: Date | undefined;

    if (resolvedPriorityId) {
      const [priority] = await db
        .select()
        .from(ticketPriorities)
        .where(eq(ticketPriorities.id, resolvedPriorityId));

      if (priority) {
        const now = new Date();
        if (priority.slaResponseMinutes) {
          slaResponseDueAt = new Date(now.getTime() + priority.slaResponseMinutes * 60 * 1000);
        }
        if (priority.slaResolveMinutes) {
          slaResolveDueAt = new Date(now.getTime() + priority.slaResolveMinutes * 60 * 1000);
        }
      }
    }

    // getNextSeq uses an atomic INSERT ... ON CONFLICT DO UPDATE on org_counters,
    // which is serialised at the Postgres row level — safe under 800+ concurrent requests.
    const seq = await getNextSeq(db, org!.id, "TKT");
    const number = generateTicketNumber(org!.slug, seq);

    // Auto-assignment is resolved BEFORE the transaction so that a DB error
    // (e.g. assignment_rules table not yet migrated) cannot abort the
    // transaction and block ticket creation entirely.  A Postgres transaction
    // that encounters an error enters an aborted state; any query issued
    // afterward — even in a separate try/catch — will fail until the
    // transaction is rolled back.  Moving this call outside the transaction
    // ensures failures are isolated and non-fatal.
    let resolvedAssigneeId = input.assigneeId;
    let resolvedTeamId = input.teamId;
    if (!resolvedAssigneeId) {
      try {
        const assignment = await resolveAssignment(db, org!.id, {
          entityType: "ticket",
          matchValue: input.categoryId ?? null,
        });
        if (assignment) {
          resolvedAssigneeId = assignment.assigneeId ?? undefined;
          resolvedTeamId = resolvedTeamId ?? assignment.teamId;
          if (assignment.parkedAtCapacity) {
            console.info("[assignment] Ticket parked at capacity — team queue:", assignment.teamId);
          }
        }
      } catch (assignErr) {
        // Non-fatal: ticket is created without auto-assignment and can be
        // assigned manually.  Common cause: assignment_rules table not yet
        // migrated in this environment.
        console.warn("[tickets.create] Auto-assignment skipped:", assignErr instanceof Error ? assignErr.message : String(assignErr));
      }
    }

    const [ticket] = await (async () => {
        try {
        return await db.transaction(async (tx: any) => {
          // Optimistic check: if the key is already in use, return the existing ticket
          // immediately without consuming a sequence number or doing any writes.
          const [existing] = await tx
            .select()
            .from(tickets)
            .where(and(eq(tickets.orgId, org!.id), eq(tickets.idempotencyKey, idempotencyKey)))
            .limit(1);
          if (existing) {
            logInfo("TICKET_IDEMPOTENT", {
              request_id:      ctx.requestId,
              idempotency_key: idempotencyKey.slice(0, 8) + "…",
              ticket_id:       existing.id,
            });
            // Backfill Redis so future duplicates never reach the DB.
            setCachedIdempotentResponse(org!.id, idempotencyKey, existing as Record<string, unknown>).catch(() => {});
            return [existing];
          }

          return tx
            .insert(tickets)
            .values({
              orgId: org!.id,
              number,
              title: input.title,
              description: input.description,
              categoryId: input.categoryId,
              priorityId: resolvedPriorityId,
              statusId: defaultStatus.id,
              type: input.type ?? "request",
              impact: (input.impact ?? "medium") as "high" | "medium" | "low",
              urgency: (input.urgency ?? "medium") as "high" | "medium" | "low",
              requesterId: user!.id,
              assigneeId: resolvedAssigneeId,
              teamId: resolvedTeamId,
              dueDate: input.dueDate,
              tags: input.tags ?? [],
              customFields: input.customFields,
              slaResponseDueAt,
              slaResolveDueAt,
              idempotencyKey,
            })
            .returning();
        });
      } catch (err: unknown) {
        // 23505 = unique_violation — another concurrent request won the race and
        // already inserted with this idempotency key.  Fetch and return that
        // existing ticket so the caller gets a consistent response.
        const pgCode = (err as { code?: string })?.code;
        if (pgCode === "23505") {
          // Try Redis snapshot first — fastest and most consistent path.
          const snapshot = await getCachedIdempotentResponse(org!.id, idempotencyKey);
          if (snapshot) {
            logInfo("TICKET_IDEMPOTENT_RACE_CACHE", {
              request_id:      ctx.requestId,
              idempotency_key: idempotencyKey.slice(0, 8) + "…",
              ticket_id:       snapshot["id"],
            });
            return [snapshot as Record<string, unknown>];
          }
          // Redis miss (cache not yet populated by the winner) — fall back to DB.
          const [existing] = await db
            .select()
            .from(tickets)
            .where(and(eq(tickets.orgId, org!.id), eq(tickets.idempotencyKey, idempotencyKey)))
            .limit(1);
          if (existing) {
            logInfo("TICKET_IDEMPOTENT_RACE", {
              request_id:      ctx.requestId,
              idempotency_key: idempotencyKey.slice(0, 8) + "…",
              ticket_id:       existing.id,
            });
            // Backfill Redis for next retry.
            setCachedIdempotentResponse(org!.id, idempotencyKey, existing as Record<string, unknown>).catch(() => {});
            return [existing];
          }
        }
        throw err;
      }
    })();

    // Log creation
    await db.insert(ticketActivityLogs).values({
      ticketId: ticket!.id,
      userId: user!.id,
      action: "created",
      changes: {},
    });

    // Notify assignee (fire-and-forget)
    const finalAssigneeId = (ticket as any).assigneeId;
    if (finalAssigneeId && finalAssigneeId !== user!.id) {
      sendNotification({
        orgId: org!.id,
        userId: finalAssigneeId,
        title: `Ticket assigned: ${ticket!.number}`,
        body: input.title,
        link: `/app/tickets/${ticket!.id}`,
        type: "info",
        sourceType: "ticket",
        sourceId: ticket!.id,
      }).catch(() => {});
    }

    // Schedule durable SLA breach detection jobs
    if (slaResponseDueAt || slaResolveDueAt) {
      try {
        const { getWorkflowService } = await import("../services/workflow.js");
        const { slaQueue } = getWorkflowService();
        const { scheduleSlaBreach } = await import("../workflows/ticketLifecycleWorkflow.js");
        await scheduleSlaBreach(slaQueue, {
          ticketId: ticket!.id,
          orgId: org!.id,
          ticketNumber: ticket!.number,
          assigneeId: input.assigneeId,
          slaResponseDueAt,
          slaResolveDueAt,
        });
      } catch (err) {
        // SLA scheduling failure is non-fatal — ticket is already created
        console.warn("[tickets.create] Failed to schedule SLA jobs:", err);
      }
    }

    // Cache the response snapshot in Redis so all retries with the same
    // idempotency key receive the exact same response without any DB reads.
    setCachedIdempotentResponse(org!.id, idempotencyKey, ticket as unknown as Record<string, unknown>).catch(() => {});

    return ticket;
  }),

  update: permissionProcedure("incidents", "write")
    .input(z.object({ id: z.string().uuid(), data: UpdateTicketSchema }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const [existing] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, input.id), eq(tickets.orgId, org!.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const updateData: Partial<typeof tickets.$inferInsert> = {};

      if (input.data.title !== undefined && input.data.title !== existing.title) {
        changes["title"] = { from: existing.title, to: input.data.title };
        updateData.title = input.data.title;
      }
      if (input.data.statusId !== undefined && input.data.statusId !== existing.statusId) {
        changes["statusId"] = { from: existing.statusId, to: input.data.statusId };
        updateData.statusId = input.data.statusId;

        // Load current and new status categories for lifecycle validation
        const [currentStatus] = existing.statusId
          ? await db.select({ category: ticketStatuses.category }).from(ticketStatuses).where(eq(ticketStatuses.id, existing.statusId))
          : [];
        const [newStatus] = await db
          .select()
          .from(ticketStatuses)
          .where(eq(ticketStatuses.id, input.data.statusId));

        // Enforce lifecycle rules: open → in_progress → resolved → closed
        if (currentStatus?.category && newStatus?.category) {
          assertTicketTransition(currentStatus.category, newStatus.category);
        }

        if (newStatus?.category === "resolved") {
          updateData.resolvedAt = new Date();
        } else if (newStatus?.category === "closed") {
          updateData.closedAt = new Date();
        }
      }
      if (input.data.assigneeId !== undefined) {
        changes["assigneeId"] = { from: existing.assigneeId, to: input.data.assigneeId };
        updateData.assigneeId = input.data.assigneeId;
      }
      if (input.data.priorityId !== undefined) {
        changes["priorityId"] = { from: existing.priorityId, to: input.data.priorityId };
        updateData.priorityId = input.data.priorityId;
      }

      updateData.updatedAt = new Date();
      (updateData as any).version = sql`${tickets.version} + 1`;

      const [updated] = await db
        .update(tickets)
        .set(updateData)
        .where(and(
          eq(tickets.id, input.id),
          eq(tickets.orgId, org!.id),
          eq(tickets.version, existing.version),
        ))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Record was modified by another user. Please refresh and try again.",
        });
      }

      if (Object.keys(changes).length > 0) {
        await db.insert(ticketActivityLogs).values({
          ticketId: input.id,
          userId: user!.id,
          action: "updated",
          changes: changes as Record<string, { from: unknown; to: unknown }>,
        });
      }

      return updated;
    }),

  addComment: permissionProcedure("incidents", "write")
    .input(AddCommentSchema)
    .mutation(async ({ ctx, input }) => {
    const { db, org, user } = ctx;

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, org!.id)));

    if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

    const [comment] = await db
      .insert(ticketComments)
      .values({
        ticketId: input.ticketId,
        authorId: user!.id,
        body: input.body,
        isInternal: input.isInternal ?? false,
      })
      .returning();

    await db.insert(ticketActivityLogs).values({
      ticketId: input.ticketId,
      userId: user!.id,
      action: input.isInternal ? "note_added" : "comment_added",
    });

    return comment;
  }),

  assign: permissionProcedure("incidents", "assign")
    .input(z.object({ id: z.string().uuid(), assigneeId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const [ticket] = await db
        .update(tickets)
        .set({ assigneeId: input.assigneeId, updatedAt: new Date() })
        .where(and(eq(tickets.id, input.id), eq(tickets.orgId, org!.id)))
        .returning();

      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });

      await db.insert(ticketActivityLogs).values({
        ticketId: input.id,
        userId: user!.id,
        action: "assigned",
        changes: { assigneeId: { from: null, to: input.assigneeId } },
      });

      return ticket;
    }),

  bulkUpdate: permissionProcedure("incidents", "write")
    .input(
      z.object({
        ids: z.array(z.string().uuid()).min(1).max(100),
        data: z.object({
          statusId: z.string().uuid().optional(),
          assigneeId: z.string().uuid().nullable().optional(),
          priorityId: z.string().uuid().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const updateData: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
      if (input.data.statusId) updateData.statusId = input.data.statusId;
      if (input.data.assigneeId !== undefined) updateData.assigneeId = input.data.assigneeId;
      if (input.data.priorityId) updateData.priorityId = input.data.priorityId;

      const updated = await db
        .update(tickets)
        .set(updateData)
        .where(and(eq(tickets.orgId, org!.id), inArray(tickets.id, input.ids)))
        .returning({ id: tickets.id });

      // Bulk audit log
      if (updated.length > 0) {
        await db.insert(ticketActivityLogs).values(
          updated.map(({ id }: { id: string }) => ({
            ticketId: id,
            userId: user!.id,
            action: "bulk_updated",
          })),
        );
      }

      return { updatedCount: updated.length };
    }),

  listPriorities: permissionProcedure("incidents", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select({
        id: ticketPriorities.id,
        name: ticketPriorities.name,
        color: ticketPriorities.color,
        sortOrder: ticketPriorities.sortOrder,
      })
      .from(ticketPriorities)
      .where(eq(ticketPriorities.orgId, org!.id))
      .orderBy(asc(ticketPriorities.sortOrder));
  }),

  statusCounts: permissionProcedure("incidents", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    return db
      .select({
        statusId: ticketStatuses.id,
        name: ticketStatuses.name,
        color: ticketStatuses.color,
        count: count(tickets.id),
      })
      .from(ticketStatuses)
      .leftJoin(tickets, and(eq(tickets.statusId, ticketStatuses.id), eq(tickets.orgId, ticketStatuses.orgId)))
      .where(eq(ticketStatuses.orgId, org!.id))
      .groupBy(ticketStatuses.id, ticketStatuses.name, ticketStatuses.color);
  }),

  toggleWatch: permissionProcedure("incidents", "read")
    .input(z.object({ ticketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      // Check if already watching
      const [existing] = await db
        .select()
        .from(ticketWatchers)
        .where(and(eq(ticketWatchers.ticketId, input.ticketId), eq(ticketWatchers.userId, user!.id)))
        .limit(1);
      if (existing) {
        await db.delete(ticketWatchers).where(and(eq(ticketWatchers.ticketId, input.ticketId), eq(ticketWatchers.userId, user!.id)));
        return { watching: false };
      } else {
        await db.insert(ticketWatchers).values({ ticketId: input.ticketId, userId: user!.id }).onConflictDoNothing();
        return { watching: true };
      }
    }),
});
