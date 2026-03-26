import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { kbArticles, kbFeedback, eq, and, desc, sql } from "@nexusops/db";

export const knowledgeRouter = router({
  list: permissionProcedure("knowledge", "read")
    .input(
      z.object({
        status: z.string().optional(),
        categoryId: z.string().uuid().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(kbArticles.orgId, org!.id)];
      if (input.status) conditions.push(eq(kbArticles.status, input.status as any));
      if (input.categoryId) conditions.push(eq(kbArticles.categoryId, input.categoryId));
      return db.select().from(kbArticles).where(and(...conditions)).orderBy(desc(kbArticles.viewCount)).limit(input.limit);
    }),

  get: permissionProcedure("knowledge", "read").input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [article] = await db.select().from(kbArticles).where(and(eq(kbArticles.id, input.id), eq(kbArticles.orgId, org!.id)));
    if (!article) throw new TRPCError({ code: "NOT_FOUND" });
    // Increment view count and return the updated article
    const [updated] = await db.update(kbArticles).set({ viewCount: sql`view_count + 1` }).where(eq(kbArticles.id, input.id)).returning();
    return updated ?? article;
  }),

  create: permissionProcedure("knowledge", "write")
    .input(
      z.object({
        title: z.string(),
        content: z.string().optional(),
        categoryId: z.string().uuid().optional(),
        tags: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [article] = await db
        .insert(kbArticles)
        .values({
          orgId: org!.id,
          title: input.title,
          content: input.content ?? "",
          categoryId: input.categoryId,
          tags: input.tags,
          authorId: user!.id,
        })
        .returning();
      return article;
    }),

  update: permissionProcedure("knowledge", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().optional(),
        content: z.string().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [article] = await db.update(kbArticles).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, org!.id))).returning();
      return article;
    }),

  publish: permissionProcedure("knowledge", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
    const [article] = await ctx.db.update(kbArticles)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(kbArticles.id, input.id), eq(kbArticles.orgId, ctx.org!.id))).returning();
    return article;
  }),

  recordFeedback: permissionProcedure("knowledge", "write")
    .input(z.object({ articleId: z.string().uuid(), helpful: z.boolean(), comment: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      const [fb] = await db.insert(kbFeedback).values({ ...input, userId: user?.id }).returning();
      if (input.helpful) {
        await db.update(kbArticles).set({ helpfulCount: sql`helpful_count + 1` }).where(eq(kbArticles.id, input.articleId));
      }
      return fb;
    }),
});
