import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { catalogItems, catalogRequests, eq, and, desc } from "@nexusops/db";

export const catalogRouter = router({
  listItems: permissionProcedure("catalog", "read")
    .input(z.object({ category: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(catalogItems.orgId, org!.id)];
      if (input.category) conditions.push(eq(catalogItems.category, input.category));
      if (input.status) conditions.push(eq(catalogItems.status, input.status as any));
      else conditions.push(eq(catalogItems.status, "active"));
      return db.select().from(catalogItems).where(and(...conditions)).orderBy(catalogItems.sortOrder, catalogItems.name);
    }),

  getItem: permissionProcedure("catalog", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const [item] = await ctx.db.select().from(catalogItems)
      .where(and(eq(catalogItems.id, input.id), eq(catalogItems.orgId, ctx.org!.id)));
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return item;
  }),

  createItem: permissionProcedure("catalog", "write")
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      price: z.string().optional(),
      approvalRequired: z.boolean().default(false),
      fulfillmentGroup: z.string().optional(),
      slaDays: z.coerce.number().default(3),
      formFields: z.array(z.object({ id: z.string(), label: z.string(), type: z.string(), required: z.boolean() })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db.insert(catalogItems).values({ orgId: org!.id, ...input }).returning();
      return item;
    }),

  submitRequest: permissionProcedure("catalog", "write")
    .input(z.object({ itemId: z.string().uuid(), formData: z.record(z.unknown()).default({}) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [item] = await db.select().from(catalogItems).where(and(eq(catalogItems.id, input.itemId), eq(catalogItems.orgId, org!.id)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const status = item.approvalRequired ? "pending_approval" : "submitted";
      const [req] = await db.insert(catalogRequests).values({
        orgId: org!.id, itemId: input.itemId, requesterId: user!.id, formData: input.formData, status,
      }).returning();
      return req;
    }),

  listRequests: permissionProcedure("catalog", "read")
    .input(z.object({ status: z.string().optional(), myRequests: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const conditions = [eq(catalogRequests.orgId, org!.id)];
      if (input.status) conditions.push(eq(catalogRequests.status, input.status as any));
      if (input.myRequests) conditions.push(eq(catalogRequests.requesterId, user!.id));
      return db.select().from(catalogRequests).where(and(...conditions)).orderBy(desc(catalogRequests.createdAt));
    }),

  fulfillRequest: permissionProcedure("catalog", "write")
    .input(z.object({ id: z.string().uuid(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [req] = await db.update(catalogRequests)
        .set({ status: "completed", fulfillerId: user!.id, notes: input.notes, completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(catalogRequests.id, input.id), eq(catalogRequests.orgId, org!.id))).returning();
      return req;
    }),
});
