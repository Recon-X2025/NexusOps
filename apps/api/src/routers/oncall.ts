import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  oncallSchedules,
  eq,
  and,
  desc,
} from "@coheronconnect/db";

export const oncallRouter = router({
  schedules: router({
    list: permissionProcedure("incidents", "read")
      .input(z.object({ limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db.select().from(oncallSchedules)
          .where(eq(oncallSchedules.orgId, org!.id))
          .orderBy(desc(oncallSchedules.createdAt))
          .limit(input.limit);
      }),

    get: permissionProcedure("incidents", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [schedule] = await db.select().from(oncallSchedules)
          .where(and(eq(oncallSchedules.id, input.id), eq(oncallSchedules.orgId, org!.id)));
        if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
        return schedule;
      }),

    create: permissionProcedure("incidents", "write")
      .input(z.object({
        name: z.string().min(1),
        team: z.string().optional(),
        rotationType: z.enum(["daily", "weekly", "custom"]).default("weekly"),
        members: z.array(z.object({
          userId: z.string(),
          name: z.string(),
          phone: z.string().default(""),
          email: z.string().default(""),
        })).default([]),
        escalationChain: z.array(z.object({
          level: z.coerce.number(),
          userId: z.string(),
          delayMinutes: z.coerce.number(),
        })).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [schedule] = await db.insert(oncallSchedules).values({
          orgId: org!.id,
          ...input,
        }).returning();
        return schedule;
      }),

    update: permissionProcedure("incidents", "write")
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        team: z.string().optional(),
        rotationType: z.enum(["daily", "weekly", "custom"]).optional(),
        members: z.array(z.any()).optional(),
        overrides: z.array(z.any()).optional(),
        escalationChain: z.array(z.any()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...data } = input;
        const [schedule] = await db.update(oncallSchedules)
          .set({ ...data as any, updatedAt: new Date() })
          .where(and(eq(oncallSchedules.id, id), eq(oncallSchedules.orgId, org!.id)))
          .returning();
        if (!schedule) throw new TRPCError({ code: "NOT_FOUND" });
        return schedule;
      }),
  }),

  escalations: router({
    list: permissionProcedure("incidents", "read")
      .input(z.object({ limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const schedules = await db.select().from(oncallSchedules)
          .where(eq(oncallSchedules.orgId, org!.id))
          .orderBy(desc(oncallSchedules.createdAt))
          .limit(input.limit);
        // Return escalation chains extracted from schedules
        return schedules.flatMap((s: any) =>
          (s.escalationChain ?? []).map((step: any) => ({
            scheduleId: s.id,
            scheduleName: s.name,
            ...step,
          }))
        );
      }),
  }),

  activeRotation: permissionProcedure("incidents", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const schedules = await db.select().from(oncallSchedules)
      .where(eq(oncallSchedules.orgId, org!.id))
      .orderBy(desc(oncallSchedules.createdAt));

    const now = new Date();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    return schedules.map((schedule: any) => {
      const members: Array<{ userId: string; name: string; phone: string; email: string }> = schedule.members ?? [];
      if (members.length === 0) return { scheduleId: schedule.id, scheduleName: schedule.name, currentOncall: null };

      const weeksSinceEpoch = Math.floor(now.getTime() / weekMs);
      const idx = weeksSinceEpoch % members.length;
      return {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        team: schedule.team,
        currentOncall: members[idx] ?? null,
      };
    });
  }),
});
