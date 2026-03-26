import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { surveys, surveyResponses, eq, and, desc, count, avg } from "@nexusops/db";

export const surveysRouter = router({
  list: permissionProcedure("analytics", "read")
    .input(z.object({ status: z.string().optional(), type: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(surveys.orgId, org!.id)];
      if (input.status) conditions.push(eq(surveys.status, input.status as any));
      if (input.type) conditions.push(eq(surveys.type, input.type as any));
      return db.select().from(surveys).where(and(...conditions)).orderBy(desc(surveys.createdAt)).limit(input.limit);
    }),

  get: permissionProcedure("analytics", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [survey] = await db.select().from(surveys).where(and(eq(surveys.id, input.id), eq(surveys.orgId, org!.id)));
    if (!survey) throw new TRPCError({ code: "NOT_FOUND" });
    return survey;
  }),

  create: permissionProcedure("analytics", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["csat", "nps", "employee_pulse", "post_incident", "onboarding", "exit_interview", "training", "vendor_review"]).default("csat"),
      questions: z.array(z.object({
        id: z.string(),
        type: z.enum(["rating", "text", "nps", "multiple_choice", "yes_no"]),
        question: z.string(),
        required: z.boolean().default(true),
        options: z.array(z.string()).optional(),
      })).default([]),
      triggerEvent: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [survey] = await db.insert(surveys).values({ orgId: org!.id, ...input, createdById: user!.id }).returning();
      return survey;
    }),

  activate: permissionProcedure("analytics", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
    const [survey] = await ctx.db.update(surveys).set({ status: "active", updatedAt: new Date() })
      .where(and(eq(surveys.id, input.id), eq(surveys.orgId, ctx.org!.id))).returning();
    return survey;
  }),

  submit: permissionProcedure("analytics", "write")
    .input(z.object({
      surveyId: z.string().uuid(),
      answers: z.record(z.union([z.string(), z.coerce.number(), z.array(z.string())])),
      score: z.string().optional(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const [response] = await db.insert(surveyResponses).values({
        surveyId: input.surveyId,
        respondentId: user?.id,
        answers: input.answers,
        score: input.score,
        comments: input.comments,
      }).returning();
      return response;
    }),

  getResults: permissionProcedure("analytics", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [survey] = await db.select().from(surveys).where(and(eq(surveys.id, input.id), eq(surveys.orgId, org!.id)));
    if (!survey) throw new TRPCError({ code: "NOT_FOUND" });

    const [{ cnt }] = await db.select({ cnt: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, input.id));
    const [{ avgScore }] = await db.select({ avgScore: avg(surveyResponses.score) }).from(surveyResponses).where(eq(surveyResponses.surveyId, input.id));
    const responses = await db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, input.id)).orderBy(desc(surveyResponses.submittedAt)).limit(100);

    return { survey, totalResponses: Number(cnt), averageScore: avgScore ? Number(avgScore).toFixed(1) : null, responses };
  }),
});
