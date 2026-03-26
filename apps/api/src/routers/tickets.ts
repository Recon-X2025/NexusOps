import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendNotification } from "../services/notifications";
import { checkDbUserPermission } from "../lib/rbac-db";
import { getNextSeq } from "../lib/auto-number";
import {
  tickets,
  ticketComments,
  ticketWatchers,
  ticketActivityLogs,
  ticketStatuses,
  ticketPriorities,
  ticketCategories,
  eq,
  and,
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
      const conditions = [eq(tickets.orgId, org!.id)];

      if (input.statusId) conditions.push(eq(tickets.statusId, input.statusId));
      if (input.priorityId) conditions.push(eq(tickets.priorityId, input.priorityId));
      if (input.categoryId) conditions.push(eq(tickets.categoryId, input.categoryId));
      if (input.assigneeId) conditions.push(eq(tickets.assigneeId, input.assigneeId));
      if (input.type) conditions.push(eq(tickets.type, input.type));
      if (input.slaBreached !== undefined)
        conditions.push(eq(tickets.slaBreached, input.slaBreached));

      const orderDir = input.order === "asc" ? asc : desc;
      const orderCol =
        input.orderBy === "createdAt"
          ? tickets.createdAt
          : input.orderBy === "updatedAt"
            ? tickets.updatedAt
            : tickets.createdAt;

      const rows = await db
        .select()
        .from(tickets)
        .where(and(...conditions))
        .orderBy(orderDir(orderCol))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const offset = (input.cursor ? parseInt(input.cursor) : 0) + items.length;

      return {
        items,
        nextCursor: hasMore ? String(offset) : null,
      };
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

    const comments = await db
      .select()
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, ticket.id))
      .orderBy(asc(ticketComments.createdAt));

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

    console.log("[ACTION]", {
      action: "tickets.create",
      userId: user.id,
      orgId: org!.id,
      title: input.title,
      type: input.type,
    });

    // Get default open status
    const [defaultStatus] = await db
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, org!.id), eq(ticketStatuses.category, "open")))
      .limit(1);

    if (!defaultStatus) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No open status configured" });
    }

    // Calculate SLA if priority set
    let slaResponseDueAt: Date | undefined;
    let slaResolveDueAt: Date | undefined;

    if (input.priorityId) {
      const [priority] = await db
        .select()
        .from(ticketPriorities)
        .where(eq(ticketPriorities.id, input.priorityId));

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

    const [ticket] = await db.transaction(async (tx: any) => {
      // Re-check idempotency INSIDE the transaction to prevent TOCTOU races.
      if (input.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(tickets)
          .where(and(eq(tickets.orgId, org!.id), eq(tickets.idempotencyKey, input.idempotencyKey)))
          .limit(1);
        if (existing) {
          console.log("[IDEMPOTENT]", { action: "tickets.create", idempotencyKey: input.idempotencyKey, ticketId: existing.id });
          return [existing];
        }
      }

      return tx
        .insert(tickets)
        .values({
          orgId: org!.id,
          number,
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          priorityId: input.priorityId,
          statusId: defaultStatus.id,
          type: input.type ?? "request",
          requesterId: user!.id,
          assigneeId: input.assigneeId,
          teamId: input.teamId,
          dueDate: input.dueDate,
          tags: input.tags ?? [],
          customFields: input.customFields,
          slaResponseDueAt,
          slaResolveDueAt,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();
    });

    // Log creation
    await db.insert(ticketActivityLogs).values({
      ticketId: ticket!.id,
      userId: user!.id,
      action: "created",
      changes: {},
    });

    // Notify assignee (fire-and-forget)
    if (input.assigneeId && input.assigneeId !== user!.id) {
      sendNotification({
        orgId: org!.id,
        userId: input.assigneeId,
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

  statusCounts: permissionProcedure("incidents", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const statuses = await db
      .select()
      .from(ticketStatuses)
      .where(eq(ticketStatuses.orgId, org!.id));

    const counts = await Promise.all(
      statuses.map(async (status: typeof ticketStatuses.$inferSelect) => {
        const [result] = await db
          .select({ count: count() })
          .from(tickets)
          .where(and(eq(tickets.orgId, org!.id), eq(tickets.statusId, status.id)));

        return { statusId: status.id, name: status.name, color: status.color, count: result?.count ?? 0 };
      }),
    );

    return counts;
  }),
});
