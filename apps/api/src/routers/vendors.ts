import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  vendors,
  purchaseOrders,
  eq,
  and,
  desc,
  count,
  sum,
  ilike,
} from "@nexusops/db";

export const vendorsRouter = router({
  list: permissionProcedure("procurement", "read")
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(vendors.orgId, org!.id)];
      if (input.status) conditions.push(eq(vendors.status, input.status));
      if (input.search) conditions.push(ilike(vendors.name, `%${input.search}%`));

      const rows = await db.select().from(vendors)
        .where(and(...conditions))
        .orderBy(vendors.name)
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      return {
        items: hasMore ? rows.slice(0, -1) : rows,
        nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
      };
    }),

  get: permissionProcedure("procurement", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vendor] = await db.select().from(vendors)
        .where(and(eq(vendors.id, input.id), eq(vendors.orgId, org!.id)));
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      return vendor;
    }),

  create: permissionProcedure("procurement", "write")
    .input(z.object({
      name: z.string().min(1),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      address: z.string().optional(),
      paymentTerms: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vendor] = await db.insert(vendors).values({
        orgId: org!.id,
        ...input,
      }).returning();
      return vendor;
    }),

  update: permissionProcedure("procurement", "write")
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      address: z.string().optional(),
      paymentTerms: z.string().optional(),
      status: z.string().optional(),
      rating: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [vendor] = await db.update(vendors)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(vendors.id, id), eq(vendors.orgId, org!.id)))
        .returning();
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });
      return vendor;
    }),

  performance: permissionProcedure("procurement", "read")
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vendor] = await db.select().from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.orgId, org!.id)));
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });

      const [{ totalOrders }] = await db.select({ totalOrders: count() }).from(purchaseOrders)
        .where(and(eq(purchaseOrders.vendorId, input.vendorId), eq(purchaseOrders.orgId, org!.id)));

      const [{ totalSpend }] = await db.select({ totalSpend: sum(purchaseOrders.totalAmount) }).from(purchaseOrders)
        .where(and(eq(purchaseOrders.vendorId, input.vendorId), eq(purchaseOrders.orgId, org!.id)));

      return {
        vendorId: input.vendorId,
        vendorName: vendor.name,
        totalOrders: Number(totalOrders),
        totalSpend: totalSpend ? Number(totalSpend) : 0,
        rating: vendor.rating ? Number(vendor.rating) : null,
        onTimeDeliveryRate: null,
        defectRate: null,
      };
    }),

  riskAssessment: permissionProcedure("procurement", "read")
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vendor] = await db.select().from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.orgId, org!.id)));
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });

      const rating = vendor.rating ? Number(vendor.rating) : 3;
      const riskScore = Math.max(0, 5 - rating);
      const riskLevel = riskScore >= 3 ? "high" : riskScore >= 2 ? "medium" : "low";

      return {
        vendorId: input.vendorId,
        vendorName: vendor.name,
        riskScore,
        riskLevel,
        factors: [],
      };
    }),
});
