import { router, permissionProcedure, protectedProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  reviewCycles,
  performanceReviews,
  goals,
  users,
  eq,
  and,
  desc,
  sql,
} from "@coheronconnect/db";

export const performanceRouter = router({
  // ── Review Cycles ─────────────────────────────────────────────────────────
  listCycles: permissionProcedure("hr", "read")
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(reviewCycles.orgId, org!.id)];
      if (input.status) conditions.push(eq(reviewCycles.status, input.status));
      return db.select().from(reviewCycles).where(and(...conditions)).orderBy(desc(reviewCycles.createdAt));
    }),

  createCycle: permissionProcedure("hr", "admin")
    .input(z.object({
      name: z.string().min(1).max(200),
      type: z.enum(["annual", "mid_year", "quarterly", "probation"]).default("annual"),
      startDate: z.string().datetime({ offset: true }).optional(),
      endDate: z.string().datetime({ offset: true }).optional(),
      selfReviewDeadline: z.string().datetime({ offset: true }).optional(),
      peerReviewDeadline: z.string().datetime({ offset: true }).optional(),
      managerReviewDeadline: z.string().datetime({ offset: true }).optional(),
      enable360: z.boolean().default(false),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [cycle] = await db
        .insert(reviewCycles)
        .values({
          orgId: org!.id,
          name: input.name,
          type: input.type,
          status: "draft",
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          selfReviewDeadline: input.selfReviewDeadline ? new Date(input.selfReviewDeadline) : undefined,
          peerReviewDeadline: input.peerReviewDeadline ? new Date(input.peerReviewDeadline) : undefined,
          managerReviewDeadline: input.managerReviewDeadline ? new Date(input.managerReviewDeadline) : undefined,
          enable360: String(input.enable360),
          notes: input.notes,
          createdById: user!.id,
        } as any)
        .returning();
      return cycle;
    }),

  updateCycle: permissionProcedure("hr", "admin")
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(["draft", "active", "calibration", "completed"]).optional(),
      name: z.string().min(1).max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [cycle] = await db
        .update(reviewCycles)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(reviewCycles.id, id), eq(reviewCycles.orgId, org!.id)))
        .returning();
      if (!cycle) throw new TRPCError({ code: "NOT_FOUND" });
      return cycle;
    }),

  // ── Reviews ───────────────────────────────────────────────────────────────
  listReviews: permissionProcedure("hr", "read")
    .input(z.object({
      cycleId: z.string().uuid().optional(),
      revieweeId: z.string().uuid().optional(),
      reviewerId: z.string().uuid().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(performanceReviews.orgId, org!.id)];
      if (input.cycleId) conditions.push(eq(performanceReviews.cycleId, input.cycleId));
      if (input.revieweeId) conditions.push(eq(performanceReviews.revieweeId, input.revieweeId));
      if (input.reviewerId) conditions.push(eq(performanceReviews.reviewerId, input.reviewerId));
      if (input.status) conditions.push(eq(performanceReviews.status, input.status as any));
      return db
        .select()
        .from(performanceReviews)
        .where(and(...conditions))
        .orderBy(desc(performanceReviews.createdAt));
    }),

  myReviews: protectedProcedure
    .query(async ({ ctx }) => {
      const { db, org, user } = ctx;
      return db
        .select()
        .from(performanceReviews)
        .where(and(
          eq(performanceReviews.orgId, org!.id),
          eq(performanceReviews.revieweeId, user!.id),
        ))
        .orderBy(desc(performanceReviews.createdAt));
    }),

  createReview: permissionProcedure("hr", "admin")
    .input(z.object({
      cycleId: z.string().uuid(),
      revieweeId: z.string().uuid(),
      reviewerId: z.string().uuid().optional(),
      reviewerRole: z.enum(["self", "peer", "manager"]).default("manager"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [review] = await db
        .insert(performanceReviews)
        .values({
          orgId: org!.id,
          cycleId: input.cycleId,
          revieweeId: input.revieweeId,
          reviewerId: input.reviewerId,
          reviewerRole: input.reviewerRole,
          status: "draft",
        } as any)
        .returning();
      return review;
    }),

  updateReview: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      selfRating: z.enum(["1","2","3","4","5"]).optional(),
      overallRating: z.enum(["1","2","3","4","5"]).optional(),
      strengthsText: z.string().max(5000).optional(),
      areasForGrowthText: z.string().max(5000).optional(),
      managerComments: z.string().max(5000).optional(),
      status: z.enum(["draft","self_review","peer_review","manager_review","calibration","completed"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const updates: Record<string, any> = { ...data, updatedAt: new Date() };
      if (data.status === "completed") updates.completedAt = new Date();
      const [review] = await db
        .update(performanceReviews)
        .set(updates)
        .where(and(eq(performanceReviews.id, id), eq(performanceReviews.orgId, org!.id)))
        .returning();
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      return review;
    }),

  // ── Goals / OKRs ──────────────────────────────────────────────────────────
  listGoals: permissionProcedure("hr", "read")
    .input(z.object({
      cycleId: z.string().uuid().optional(),
      ownerId: z.string().uuid().optional(),
      status: z.string().optional(),
      goalType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(goals.orgId, org!.id)];
      if (input.cycleId) conditions.push(eq(goals.cycleId, input.cycleId));
      if (input.ownerId) conditions.push(eq(goals.ownerId, input.ownerId));
      if (input.status) conditions.push(eq(goals.status, input.status as any));
      if (input.goalType) conditions.push(eq(goals.goalType, input.goalType));
      return db
        .select()
        .from(goals)
        .where(and(...conditions))
        .orderBy(desc(goals.createdAt));
    }),

  myGoals: protectedProcedure
    .input(z.object({ cycleId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const conditions = [eq(goals.orgId, org!.id), eq(goals.ownerId, user!.id)];
      if (input.cycleId) conditions.push(eq(goals.cycleId, input.cycleId));
      return db.select().from(goals).where(and(...conditions)).orderBy(desc(goals.createdAt));
    }),

  createGoal: protectedProcedure
    .input(z.object({
      cycleId: z.string().uuid().optional(),
      title: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
      goalType: z.enum(["individual", "team", "org"]).default("individual"),
      targetValue: z.string().optional(),
      unit: z.string().max(50).optional(),
      dueDate: z.string().datetime({ offset: true }).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [goal] = await db
        .insert(goals)
        .values({
          orgId: org!.id,
          cycleId: input.cycleId,
          ownerId: user!.id,
          title: input.title,
          description: input.description,
          goalType: input.goalType,
          status: "draft",
          progress: 0,
          targetValue: input.targetValue,
          unit: input.unit,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          tags: input.tags ?? [],
        } as any)
        .returning();
      return goal;
    }),

  updateGoal: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(2000).optional(),
      progress: z.number().min(0).max(100).optional(),
      status: z.enum(["draft", "active", "at_risk", "completed", "cancelled"]).optional(),
      currentValue: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [goal] = await db
        .update(goals)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(goals.id, id), eq(goals.orgId, org!.id)))
        .returning();
      if (!goal) throw new TRPCError({ code: "NOT_FOUND" });
      return goal;
    }),

  deleteGoal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      await db
        .delete(goals)
        .where(and(
          eq(goals.id, input.id),
          eq(goals.orgId, org!.id),
          eq(goals.ownerId, user!.id),
        ));
      return { success: true };
    }),

  // ── Summary stats ─────────────────────────────────────────────────────────
  summary: permissionProcedure("hr", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [cycleStats, goalStats] = await Promise.all([
        db.select({
          status: reviewCycles.status,
          count: sql<number>`count(*)::int`,
        })
        .from(reviewCycles)
        .where(eq(reviewCycles.orgId, org!.id))
        .groupBy(reviewCycles.status),

        db.select({
          status: goals.status,
          count: sql<number>`count(*)::int`,
        })
        .from(goals)
        .where(eq(goals.orgId, org!.id))
        .groupBy(goals.status),
      ]);
      return { cycleStats, goalStats };
    }),
});
