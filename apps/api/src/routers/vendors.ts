import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  vendors,
  purchaseOrders,
  invoices,
  contracts,
  eq,
  and,
  desc,
  count,
  sum,
  ilike,
  sql,
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

      // Per-vendor derived measures. Both are aggregated in SQL across the WHOLE
      // org — never over `page` — so the figures do not change when the caller
      // pages or filters. Client-side reduction over a paged list is how
      // /app/crm came to under-report its pipeline by 27.8M.
      const spendRows = await db
        .select({ vendorId: invoices.vendorId, total: sum(invoices.amount) })
        .from(invoices)
        .where(
          and(
            eq(invoices.orgId, org!.id),
            eq(invoices.invoiceFlow, "payable"),
            sql`${invoices.status} <> 'cancelled'`,
            sql`${invoices.vendorId} IS NOT NULL`,
          ),
        )
        .groupBy(invoices.vendorId);
      const spendByVendor = new Map<string, number>(
        spendRows.map((r) => [String(r.vendorId), Number(r.total ?? 0)]),
      );

      // On-time delivery rate: goods actually received on or before the date the
      // PO committed to. Vendors with no dated receipts get null, NOT zero — a
      // vendor with no delivery history has no score, and rendering 0% would
      // accuse them of never delivering on time.
      const slaRows = (await db.execute(sql`
        SELECT po.vendor_id::text                                            AS vendor_id,
               COUNT(*)::int                                                 AS total,
               SUM(CASE WHEN g.grn_date <= po.expected_delivery THEN 1 ELSE 0 END)::int AS on_time
          FROM goods_receipt_notes g
          JOIN purchase_orders po ON po.id = g.po_id
         WHERE po.org_id = ${org!.id}
           AND po.vendor_id IS NOT NULL
           AND po.expected_delivery IS NOT NULL
         GROUP BY po.vendor_id
      `)) as Array<{ vendor_id: string; total: number; on_time: number }>;
      const slaByVendor = new Map<string, number>(
        slaRows
          .filter((r) => Number(r.total) > 0)
          .map((r) => [r.vendor_id, Math.round((Number(r.on_time) / Number(r.total)) * 1000) / 10]),
      );

      return {
        items: items.map((v) => ({
          ...v,
          spend: spendByVendor.get(String(v.id)) ?? 0,
          slaScore: slaByVendor.has(String(v.id)) ? slaByVendor.get(String(v.id))! : null,
        })),
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

  /**
   * Org-wide vendor headline figures, aggregated in SQL.
   *
   * These four used to be reduced client-side over `vendors.list({ limit: 50 })`,
   * so every one of them silently became "the first 50 vendors" once a tenant
   * crossed the page size. They are counted here, across the whole org, scoped
   * to the caller's org id.
   *
   * `totalSpend` definition: LIFETIME sum of PAYABLE invoices linked to a vendor,
   * excluding `cancelled`. Not windowed. The same definition backs the per-vendor
   * `spend` field on `list`, so the column and the tile can never disagree.
   */
  metrics: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [[spendRow], [activeRow], [atRiskRow], [expiringRow]] = await Promise.all([
      db
        .select({ total: sum(invoices.amount) })
        .from(invoices)
        .where(
          and(
            eq(invoices.orgId, org!.id),
            eq(invoices.invoiceFlow, "payable"),
            sql`${invoices.status} <> 'cancelled'`,
            sql`${invoices.vendorId} IS NOT NULL`,
          ),
        ),
      db
        .select({ c: count() })
        .from(vendors)
        .where(and(eq(vendors.orgId, org!.id), eq(vendors.status, "active"))),
      db
        .select({ c: count() })
        .from(vendors)
        .where(and(eq(vendors.orgId, org!.id), sql`${vendors.status} IN ('at_risk','under_review')`)),
      db
        .select({ c: count() })
        .from(contracts)
        .where(
          and(
            eq(contracts.orgId, org!.id),
            sql`${contracts.endDate} IS NOT NULL`,
            sql`${contracts.endDate} < NOW() + INTERVAL '90 days'`,
          ),
        ),
    ]);
    return {
      totalSpend: Number(spendRow?.total ?? 0),
      activeVendors: Number(activeRow?.c ?? 0),
      atRisk: Number(atRiskRow?.c ?? 0),
      contractsExpiring90d: Number(expiringRow?.c ?? 0),
    };
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
      contactPersonName: z.string().optional(),
      address: z.string().optional(),
      paymentTerms: z.string().optional(),
      // Vendor satisfaction, 0–5. The register renders it as stars; without an
      // input here it could only ever be set by a seed, which is what left all
      // 23 rows NULL while the column existed and was already emitted.
      rating: z.string().optional(),
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
      contactPersonName: z.string().optional(),
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
