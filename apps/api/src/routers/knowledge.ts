import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { kbArticles, kbArticleRevisions, kbFeedback, eq, and, desc, sql, or, ilike } from "@coheronconnect/db";

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
      const q = input.search?.trim().slice(0, 120);
      if (q) {
        const safe = q.replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "");
        if (safe.length > 0) {
          const pat = `%${safe}%`;
          conditions.push(or(ilike(kbArticles.title, pat), ilike(kbArticles.content, pat))!);
        }
      }
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
      const { db, org, user } = ctx;
      const { id, ...data } = input;
      const [prev] = await db
        .select()
        .from(kbArticles)
        .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, org!.id)));
      if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });

      const titleChanged = data.title !== undefined && data.title !== prev.title;
      const contentChanged = data.content !== undefined && data.content !== prev.content;
      let nextVersion = prev.contentVersion ?? 1;
      if (titleChanged || contentChanged) {
        await db.insert(kbArticleRevisions).values({
          articleId: id,
          orgId: org!.id,
          version: nextVersion,
          title: prev.title,
          content: prev.content,
          createdBy: user!.id,
        });
        nextVersion += 1;
      }

      const [article] = await db
        .update(kbArticles)
        .set({
          ...data,
          contentVersion: titleChanged || contentChanged ? nextVersion : prev.contentVersion ?? 1,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, org!.id)))
        .returning();
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      return article;
    }),

  listArticleVersions: permissionProcedure("knowledge", "read")
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(kbArticleRevisions)
        .where(and(eq(kbArticleRevisions.articleId, input.articleId), eq(kbArticleRevisions.orgId, org!.id)))
        .orderBy(desc(kbArticleRevisions.version));
    }),

  publish: permissionProcedure("knowledge", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
    const [article] = await ctx.db.update(kbArticles)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(kbArticles.id, input.id), eq(kbArticles.orgId, ctx.org!.id))).returning();
    if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
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
