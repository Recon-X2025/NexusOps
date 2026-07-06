import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { surveys, surveyResponses, surveyStatusEnum, surveyTypeEnum, csatSettings, csatChannelEnum, eq, and, desc, count, avg } from "@coheronconnect/db";
import { getNextNumber } from "../lib/auto-number";

export const surveysRouter = router({
  list: permissionProcedure("surveys", "read")
    .input(z.object({ status: z.enum(surveyStatusEnum.enumValues).optional(), type: z.enum(surveyTypeEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(surveys.orgId, org!.id)];
      if (input.status) conditions.push(eq(surveys.status, input.status));
      if (input.type) conditions.push(eq(surveys.type, input.type));
      return db.select().from(surveys).where(and(...conditions)).orderBy(desc(surveys.createdAt)).limit(input.limit);
    }),

  get: permissionProcedure("surveys", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [survey] = await db.select().from(surveys).where(and(eq(surveys.id, input.id), eq(surveys.orgId, org!.id)));
    if (!survey) throw new TRPCError({ code: "NOT_FOUND" });
    return survey;
  }),

  create: permissionProcedure("surveys", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["csat", "nps", "employee_pulse", "post_incident", "onboarding", "exit_interview", "training", "vendor_review"]).default("csat"),
      questions: z.array(z.object({
        id: z.string(),
        type: z.enum(["rating", "text", "open_text", "nps", "multiple_choice", "single_choice", "yes_no"]),
        question: z.string(),
        required: z.boolean().default(true),
        options: z.array(z.string()).optional(),
      })).default([]),
      triggerEvent: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = await getNextNumber(db, org!.id, "SURV");
      const [survey] = await db.insert(surveys).values({ orgId: org!.id, number, ...input, createdById: user!.id }).returning();
      return survey;
    }),

  activate: permissionProcedure("surveys", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
    const [survey] = await ctx.db.update(surveys).set({ status: "active", updatedAt: new Date() })
      .where(and(eq(surveys.id, input.id), eq(surveys.orgId, ctx.org!.id))).returning();
    return survey;
  }),

  update: permissionProcedure("surveys", "write")
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      questions: z.array(z.object({
        id: z.string(),
        type: z.enum(["rating", "text", "open_text", "nps", "multiple_choice", "single_choice", "yes_no"]),
        question: z.string(),
        required: z.boolean().default(true),
        options: z.array(z.string()).optional(),
      })).optional(),
      status: z.enum(surveyStatusEnum.enumValues).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [survey] = await db
        .update(surveys)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(surveys.id, id), eq(surveys.orgId, org!.id)))
        .returning();
      if (!survey) throw new TRPCError({ code: "NOT_FOUND" });
      return survey;
    }),

  submit: permissionProcedure("surveys", "write")
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

  getResults: permissionProcedure("surveys", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [survey] = await db.select().from(surveys).where(and(eq(surveys.id, input.id), eq(surveys.orgId, org!.id)));
    if (!survey) throw new TRPCError({ code: "NOT_FOUND" });

    const [cntRow] = await db.select({ cnt: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, input.id));
    const cnt = cntRow?.cnt ?? 0;
    const [avgScoreRow] = await db.select({ avgScore: avg(surveyResponses.score) }).from(surveyResponses).where(eq(surveyResponses.surveyId, input.id));
    const avgScore = avgScoreRow?.avgScore ?? null;
    const responses = await db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, input.id)).orderBy(desc(surveyResponses.submittedAt)).limit(100);

    return { survey, totalResponses: Number(cnt), averageScore: avgScore ? Number(avgScore).toFixed(1) : null, responses };
  }),

  // ── CSAT settings (per-org config for the ticket-resolve CSAT loop) ────────
  getCsatSettings: permissionProcedure("surveys", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [row] = await db.select().from(csatSettings).where(eq(csatSettings.orgId, org!.id));
    // No row yet ⇒ surface the schema defaults so the UI has a stable shape.
    return (
      row ?? {
        enabled: true,
        channel: "both" as const,
        suppressionWindowHours: 24,
        expiryDays: 14,
      }
    );
  }),

  updateCsatSettings: permissionProcedure("surveys", "write")
    .input(
      z.object({
        enabled: z.boolean().optional(),
        channel: z.enum(csatChannelEnum.enumValues).optional(),
        suppressionWindowHours: z.coerce.number().int().min(0).max(8760).optional(),
        expiryDays: z.coerce.number().int().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .insert(csatSettings)
        .values({ orgId: org!.id, ...input })
        .onConflictDoUpdate({
          target: csatSettings.orgId,
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      return row;
    }),
});
