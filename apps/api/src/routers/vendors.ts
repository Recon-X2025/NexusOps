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
} from "@coheronconnect/db";
import { panColumns, decryptPan } from "../lib/pan";

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
      const page = hasMore ? rows.slice(0, -1) : rows;
      // Decrypt the stored (envelope) PAN per row; legacy plaintext rows read through.
      const items = await Promise.all(
        page.map(async (v) => ({ ...v, pan: (await decryptPan(v.pan)) ?? null })),
      );
      return {
        items,
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
      return { ...vendor, pan: (await decryptPan(vendor.pan)) ?? null };
    }),

  create: permissionProcedure("procurement", "write")
    .input(z.object({
      name: z.string().min(1),
      gstin: z.string().optional(),
      state: z.string().optional(),
      pan: z.string().optional(),
      tdsSection: z.string().optional(),
      tdsRate: z.string().optional(),
      isMsme: z.boolean().optional(),
      msmeUdyamNumber: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      address: z.string().optional(),
      paymentTerms: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      // Route PAN through panColumns: encrypt the raw value (KMS envelope) + stamp the
      // masked-hash/display match aids. `pan` is pulled out of the spread so the raw
      // plaintext is never written.
      const { pan: _pan, ...rest } = input;
      const panCols = await panColumns(input.pan);
      // Convert tdsSection to any to satisfy Drizzle enum type if it's passed as string
      // Convert tdsRate to string if needed
      const [vendor] = await db.insert(vendors).values({
        orgId: org!.id,
        ...rest,
        ...panCols,
        tdsSection: input.tdsSection as any, // any-ratchet-allow: bypass Drizzle enum type issue
      }).returning();
      return { ...vendor!, pan: (await decryptPan(vendor!.pan)) ?? null };
    }),

  update: permissionProcedure("procurement", "write")
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      gstin: z.string().optional(),
      state: z.string().optional(),
      pan: z.string().optional(),
      tdsSection: z.string().optional(),
      tdsRate: z.string().optional(),
      isMsme: z.boolean().optional(),
      msmeUdyamNumber: z.string().optional(),
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
      const { id, pan: _pan, ...data } = input;
      // Route PAN through panColumns (encrypt raw + stamp match aids); pull the raw `pan`
      // out of the spread so plaintext is never written.
      const panCols = await panColumns(input.pan);
      const [vendor] = await db.update(vendors)
        .set({
          ...data,
          ...panCols,
          tdsSection: data.tdsSection as any, // any-ratchet-allow: bypass Drizzle enum type issue
          updatedAt: new Date()
        })
        .where(and(eq(vendors.id, id), eq(vendors.orgId, org!.id)))
        .returning();
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...vendor, pan: (await decryptPan(vendor.pan)) ?? null };
    }),

  performance: permissionProcedure("procurement", "read")
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [vendor] = await db.select().from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.orgId, org!.id)));
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });

      const [totalOrdersRow] = await db.select({ totalOrders: count() }).from(purchaseOrders)
        .where(and(eq(purchaseOrders.vendorId, input.vendorId), eq(purchaseOrders.orgId, org!.id)));
      const totalOrders = totalOrdersRow?.totalOrders ?? 0;

      const [totalSpendRow] = await db.select({ totalSpend: sum(purchaseOrders.totalAmount) }).from(purchaseOrders)
        .where(and(eq(purchaseOrders.vendorId, input.vendorId), eq(purchaseOrders.orgId, org!.id)));
      const totalSpend = totalSpendRow?.totalSpend ?? null;

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
