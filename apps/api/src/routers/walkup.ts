import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  walkupVisits,
  walkupAppointments,
  eq,
  and,
  desc,
  count,
  inArray,
  sql,
} from "@nexusops/db";

export const walkupRouter = router({
  queue: router({
    list: permissionProcedure("incidents", "read")
      .input(z.object({ locationId: z.string().uuid().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [
          eq(walkupVisits.orgId, org!.id),
          inArray(walkupVisits.status, ["waiting", "in_service"]),
        ];
        if (input.locationId) conditions.push(eq(walkupVisits.locationId, input.locationId));
        return db.select().from(walkupVisits)
          .where(and(...conditions))
          .orderBy(walkupVisits.queuePosition, walkupVisits.createdAt);
      }),

    joinQueue: permissionProcedure("incidents", "write")
      .input(z.object({
        locationId: z.string().uuid().optional(),
        issueCategory: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [{ queueLength }] = await db.select({ queueLength: count() }).from(walkupVisits)
          .where(and(
            eq(walkupVisits.orgId, org!.id),
            inArray(walkupVisits.status, ["waiting", "in_service"]),
          ));
        const position = Number(queueLength) + 1;
        const [visit] = await db.insert(walkupVisits).values({
          orgId: org!.id,
          visitorId: ctx.user!.id,
          locationId: input.locationId,
          issueCategory: input.issueCategory,
          queuePosition: position,
          status: "waiting",
        }).returning();
        return visit;
      }),

    callNext: permissionProcedure("incidents", "write")
      .input(z.object({ locationId: z.string().uuid().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [
          eq(walkupVisits.orgId, org!.id),
          eq(walkupVisits.status, "waiting"),
        ];
        if (input.locationId) conditions.push(eq(walkupVisits.locationId, input.locationId));
        const [oldest] = await db.select().from(walkupVisits)
          .where(and(...conditions))
          .orderBy(walkupVisits.queuePosition, walkupVisits.createdAt)
          .limit(1);
        if (!oldest) throw new TRPCError({ code: "NOT_FOUND", message: "No visitors waiting" });
        const [updated] = await db.update(walkupVisits)
          .set({ status: "in_service", agentId: ctx.user!.id })
          .where(eq(walkupVisits.id, oldest.id))
          .returning();
        return updated;
      }),

    complete: permissionProcedure("incidents", "write")
      .input(z.object({
        visitId: z.string().uuid(),
        resolution: z.string().optional(),
        csatScore: z.coerce.number().min(1).max(5).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [visit] = await db.select().from(walkupVisits)
          .where(and(eq(walkupVisits.id, input.visitId), eq(walkupVisits.orgId, org!.id)));
        if (!visit) throw new TRPCError({ code: "NOT_FOUND" });

        const waitMs = visit.createdAt ? Date.now() - new Date(visit.createdAt).getTime() : 0;
        const [updated] = await db.update(walkupVisits)
          .set({
            status: "completed",
            resolution: input.resolution,
            csatScore: input.csatScore,
            completedAt: new Date(),
            waitTimeMinutes: Math.round(waitMs / 60000),
          })
          .where(eq(walkupVisits.id, input.visitId))
          .returning();
        return updated;
      }),

    hold: permissionProcedure("incidents", "write")
      .input(z.object({ visitId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db.update(walkupVisits)
          .set({ status: "on_hold", updatedAt: new Date() })
          .where(and(eq(walkupVisits.id, input.visitId), eq(walkupVisits.orgId, org!.id)))
          .returning();
        return updated;
      }),
  }),

  appointments: router({
    list: permissionProcedure("incidents", "read")
      .input(z.object({ limit: z.coerce.number().default(50), cursor: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const rows = await db.select().from(walkupAppointments)
          .where(eq(walkupAppointments.orgId, org!.id))
          .orderBy(desc(walkupAppointments.scheduledAt))
          .limit(input.limit + 1)
          .offset(input.cursor ? parseInt(input.cursor) : 0);
        const hasMore = rows.length > input.limit;
        return {
          items: hasMore ? rows.slice(0, -1) : rows,
          nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
        };
      }),

    create: permissionProcedure("incidents", "write")
      .input(z.object({
        scheduledAt: z.string(),
        locationId: z.string().uuid().optional(),
        issueCategory: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [appt] = await db.insert(walkupAppointments).values({
          orgId: org!.id,
          userId: ctx.user!.id,
          scheduledAt: new Date(input.scheduledAt),
          locationId: input.locationId,
          issueCategory: input.issueCategory,
          notes: input.notes,
        }).returning();
        return appt;
      }),
  }),

  locations: permissionProcedure("incidents", "read").query(async ({ ctx }) => {
    // Static IT desk locations - can be extended to query buildings table
    return [
      { id: "loc-001", name: "HQ IT Help Desk - Floor 1", address: "Building A, Floor 1" },
      { id: "loc-002", name: "HQ IT Help Desk - Floor 3", address: "Building A, Floor 3" },
      { id: "loc-003", name: "Branch Office IT Desk", address: "Building B, Ground Floor" },
    ];
  }),

  analytics: permissionProcedure("incidents", "read")
    .input(z.object({ days: z.coerce.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const [{ total }] = await db.select({ total: count() }).from(walkupVisits)
        .where(and(eq(walkupVisits.orgId, org!.id), sql`${walkupVisits.createdAt} >= ${since}`));

      const [{ completed }] = await db.select({ completed: count() }).from(walkupVisits)
        .where(and(
          eq(walkupVisits.orgId, org!.id),
          eq(walkupVisits.status, "completed"),
          sql`${walkupVisits.createdAt} >= ${since}`,
        ));

      return {
        totalVisits: Number(total),
        completedVisits: Number(completed),
        avgWaitMinutes: 0,
        avgServiceMinutes: 0,
      };
    }),
});
