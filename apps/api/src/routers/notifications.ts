import { router, protectedProcedure, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { notifications, notificationPreferences, eq, and, asc, desc, count } from "@coheronconnect/db";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false), limit: z.coerce.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const conditions = [eq(notifications.userId, user!.id)];
      if (input.unreadOnly) conditions.push(eq(notifications.isRead, false));
      const items = await db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt)).limit(input.limit);
      return { items };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { db, user } = ctx;
    const [{ cnt }] = await db.select({ cnt: count() }).from(notifications)
      .where(and(eq(notifications.userId, user!.id), eq(notifications.isRead, false)));
    return Number(cnt);
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before updating — throw NOT_FOUND if not owned by caller
      const [notif] = await ctx.db.select().from(notifications).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user!.id))).limit(1);
      if (!notif) {
        const { TRPCError } = await import('@trpc/server');
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found or not owned by user' });
      }
      await ctx.db.update(notifications).set({ isRead: true }).where(eq(notifications.id, input.id));
      return { ok: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, ctx.user!.id));
    return { ok: true };
  }),

  send: permissionProcedure("users", "write")
    .input(z.object({
      userId: z.string().uuid(),
      title: z.string(),
      body: z.string().optional(),
      link: z.string().optional(),
      type: z.enum(["info", "warning", "success", "error"]).default("info"),
      sourceType: z.string().optional(),
      sourceId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [notif] = await db.insert(notifications).values({ orgId: org!.id, ...input }).returning();
      return notif;
    }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, ctx.user!.id)).orderBy(asc(notificationPreferences.channel), asc(notificationPreferences.eventType));
  }),

  updatePreference: protectedProcedure
    .input(z.object({ channel: z.enum(["email", "in_app", "slack"]), eventType: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const [pref] = await db.insert(notificationPreferences)
        .values({ userId: user!.id, ...input })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.channel, notificationPreferences.eventType] as any,
          set: { enabled: input.enabled },
        })
        .returning();
      return pref;
    }),
});
