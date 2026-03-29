import { z } from "zod";
import { router, permissionProcedure } from "../lib/trpc";
import { sendNotification } from "../services/notifications";
import { getNextSeq } from "../lib/auto-number";
import { resolveAssignment } from "../services/assignment";
import {

  workOrders,
  workOrderTasks,
  workOrderActivityLogs,
  eq,
  and,
  desc,
  asc,
  ilike,
  inArray,
  sql,
} from "@nexusops/db";

const WOStateEnum = z.enum([
  "draft", "open", "pending_dispatch", "dispatched",
  "work_in_progress", "on_hold", "complete", "cancelled", "closed",
]);

const WOPriorityEnum = z.enum([
  "1_critical", "2_high", "3_moderate", "4_low", "5_planning",
]);

const WOTypeEnum = z.enum([
  "corrective", "preventive", "installation", "inspection",
  "repair", "upgrade", "decommission",
]);

const WOTaskStateEnum = z.enum([
  "pending_dispatch", "open", "accepted", "work_in_progress",
  "complete", "cancelled", "closed",
]);

export const workOrdersRouter = router({
  list: permissionProcedure("work_orders", "read")
    .input(z.object({
      search: z.string().optional(),
      state: WOStateEnum.optional(),
      priority: WOPriorityEnum.optional(),
      type: WOTypeEnum.optional(),
      slaBreached: z.boolean().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
      offset: z.coerce.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const { org } = ctx;
      const conditions = [eq(workOrders.orgId, org!.id)];

      if (input.state) conditions.push(eq(workOrders.state, input.state));
      if (input.priority) conditions.push(eq(workOrders.priority, input.priority));
      if (input.type) conditions.push(eq(workOrders.type, input.type));
      if (input.slaBreached !== undefined) conditions.push(eq(workOrders.slaBreached, input.slaBreached));
      if (input.search) conditions.push(ilike(workOrders.shortDescription, `%${input.search}%`));

      const items = await db
        .select()
        .from(workOrders)
        .where(and(...conditions))
        .orderBy(desc(workOrders.createdAt))
        .limit(input.limit + 1)
        .offset(input.offset);

      const hasMore = items.length > input.limit;
      return { items: hasMore ? items.slice(0, input.limit) : items, hasMore };
    }),

  get: permissionProcedure("work_orders", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const { org } = ctx;

      const [wo] = await db
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.id, input.id), eq(workOrders.orgId, org!.id)))
        .limit(1);

      if (!wo) return null;

      const tasks = await db
        .select()
        .from(workOrderTasks)
        .where(eq(workOrderTasks.workOrderId, wo.id))
        .orderBy(asc(workOrderTasks.order));

      const activityLogs = await db
        .select()
        .from(workOrderActivityLogs)
        .where(eq(workOrderActivityLogs.workOrderId, wo.id))
        .orderBy(asc(workOrderActivityLogs.createdAt));

      return { workOrder: wo, tasks, activityLogs };
    }),

  create: permissionProcedure("work_orders", "write")
    .input(z.object({
      shortDescription: z.string().min(3).max(500),
      description: z.string().optional(),
      type: WOTypeEnum.default("corrective"),
      priority: WOPriorityEnum.default("4_low"),
      location: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      cmdbCi: z.string().optional(),
      assignedToId: z.string().uuid().optional(),
      scheduledStartDate: z.string().datetime().optional(),
      scheduledEndDate: z.string().datetime().optional(),
      estimatedHours: z.coerce.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { org, user } = ctx;

      const seq = await getNextSeq(db, org!.id, "WO");
      const number = `WO${String(seq).padStart(7, "0")}`;

      // Auto-assign if no explicit assignee provided
      let resolvedAssignedToId = input.assignedToId;
      if (!resolvedAssignedToId) {
        const assignment = await resolveAssignment(db, org!.id, {
          entityType: "work_order",
          matchValue: input.type ?? null,
        });
        if (assignment) {
          resolvedAssignedToId = assignment.assigneeId ?? undefined;
          if (assignment.parkedAtCapacity) {
            console.info("[assignment] Work order parked at capacity — team queue:", assignment.teamId);
          }
        }
      }

      const [wo] = await db
        .insert(workOrders)
        .values({
          orgId: org!.id,
          number,
          shortDescription: input.shortDescription,
          description: input.description,
          type: input.type,
          priority: input.priority,
          location: input.location,
          category: input.category,
          subcategory: input.subcategory,
          cmdbCi: input.cmdbCi,
          assignedToId: resolvedAssignedToId,
          requestedById: user!.id,
          scheduledStartDate: input.scheduledStartDate
            ? new Date(input.scheduledStartDate)
            : undefined,
          scheduledEndDate: input.scheduledEndDate
            ? new Date(input.scheduledEndDate)
            : undefined,
          estimatedHours: input.estimatedHours,
        })
        .returning();

      await db.insert(workOrderActivityLogs).values({
        workOrderId: wo.id,
        userId: user!.id,
        action: "created",
        note: `Work order ${number} created`,
      });

      if (resolvedAssignedToId && resolvedAssignedToId !== user!.id) {
        sendNotification({
          orgId: org!.id,
          userId: resolvedAssignedToId,
          title: `Work order assigned: ${number}`,
          body: input.shortDescription,
          link: `/app/work-orders/${wo.id}`,
          type: "info",
          sourceType: "work_order",
          sourceId: wo.id,
        }).catch(() => {});
      }

      return wo;
    }),

  updateState: permissionProcedure("work_orders", "write")
    .input(z.object({
      id: z.string().uuid(),
      state: WOStateEnum,
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { org, user } = ctx;

      const [wo] = await db
        .update(workOrders)
        .set({ state: input.state, updatedAt: new Date() })
        .where(and(eq(workOrders.id, input.id), eq(workOrders.orgId, org!.id)))
        .returning();

      await db.insert(workOrderActivityLogs).values({
        workOrderId: input.id,
        userId: user!.id,
        action: "state_changed",
        note: input.note ?? `State changed to ${input.state}`,
      });

      return wo;
    }),

  updateTask: permissionProcedure("work_orders", "write")
    .input(z.object({
      id: z.string().uuid(),
      state: WOTaskStateEnum.optional(),
      actualHours: z.coerce.number().optional(),
      workNotes: z.string().optional(),
      assignedToId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { id, ...updates } = input;
      const [task] = await db
        .update(workOrderTasks)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workOrderTasks.id, id))
        .returning();
      return task;
    }),

  addNote: permissionProcedure("work_orders", "write")
    .input(z.object({
      workOrderId: z.string().uuid(),
      note: z.string().min(1),
      isInternal: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const [log] = await db
        .insert(workOrderActivityLogs)
        .values({
          workOrderId: input.workOrderId,
          userId: ctx.user!.id,
          action: "note",
          note: input.note,
          isInternal: input.isInternal,
        })
        .returning();
      return log;
    }),

  metrics: permissionProcedure("work_orders", "read").query(async ({ ctx }) => {
    const { db } = ctx;
    const { org } = ctx;

    const [total] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workOrders)
      .where(eq(workOrders.orgId, org!.id));

    const [open] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workOrders)
      .where(and(eq(workOrders.orgId, org!.id), inArray(workOrders.state, ["open", "dispatched", "work_in_progress", "pending_dispatch"])));

    const [critical] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workOrders)
      .where(and(eq(workOrders.orgId, org!.id), eq(workOrders.priority, "1_critical"), inArray(workOrders.state, ["open", "work_in_progress"])));

    const [breached] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workOrders)
      .where(and(eq(workOrders.orgId, org!.id), eq(workOrders.slaBreached, true)));

    return {
      total: Number(total?.count ?? 0),
      open: Number(open?.count ?? 0),
      critical: Number(critical?.count ?? 0),
      breached: Number(breached?.count ?? 0),
    };
  }),
});
