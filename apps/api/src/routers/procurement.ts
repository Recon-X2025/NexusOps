import { router, permissionProcedure } from "../lib/trpc";
import { sendNotification } from "../services/notifications";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getNextNumber } from "../lib/auto-number";
import {
  vendors,
  purchaseRequests,
  purchaseRequestItems,
  purchaseOrders,
  poLineItems,
  invoices,
  approvalRequests,
  assets,
  assetTypes,
  eq,
  and,
  desc,
  count,
  sum,
  sql,
} from "@nexusops/db";
import { CreatePurchaseRequestSchema } from "@nexusops/types";

const AUTO_APPROVE_THRESHOLD = 75000;   // < ₹75,000 auto-approved
const DEPT_HEAD_THRESHOLD = 750000;     // ₹75,000–₹7,50,000 dept head
// > ₹7,50,000 requires VP + Finance sequential approval

async function determineApproval(amount: number, orgId: string): Promise<string> {
  if (amount < AUTO_APPROVE_THRESHOLD) return "auto";
  if (amount < DEPT_HEAD_THRESHOLD) return "dept_head";
  return "vp_finance";
}

export const procurementRouter = router({
  vendors: router({
    list: permissionProcedure("vendors", "read").query(async ({ ctx }) => {
      return ctx.db.select().from(vendors).where(eq(vendors.orgId, ctx.org!.id));
    }),

    create: permissionProcedure("vendors", "write")
      .input(
        z.object({
          name: z.string().min(1).max(200),
          contactEmail: z.string().email().optional(),
          contactPhone: z.string().optional(),
          address: z.string().optional(),
          paymentTerms: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [vendor] = await ctx.db
          .insert(vendors)
          .values({ orgId: ctx.org!.id, ...input })
          .returning();
        return vendor;
      }),
  }),

  purchaseRequests: router({
    list: permissionProcedure("procurement", "read")
      .input(z.object({ status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(purchaseRequests.orgId, org!.id)];
        if (input.status) conditions.push(eq(purchaseRequests.status, input.status as any));

        return db.select().from(purchaseRequests).where(and(...conditions)).orderBy(desc(purchaseRequests.createdAt));
      }),

    create: permissionProcedure("procurement", "write")
      .input(CreatePurchaseRequestSchema)
      .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      console.log("[ACTION]", {
        action: "procurement.purchaseRequests.create",
        userId: user.id,
        orgId: org!.id,
        title: input.title,
        totalAmount: input.totalAmount,
      });

      // Idempotency: if the caller already created a PR with this key, return it
      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.orgId, org!.id), eq(purchaseRequests.idempotencyKey, input.idempotencyKey)))
          .limit(1);
        if (existing) {
          console.log("[IDEMPOTENT]", { action: "procurement.purchaseRequests.create", idempotencyKey: input.idempotencyKey, prId: existing.id });
          return existing;
        }
      }

      const prNumber = await getNextNumber(db, org!.id, "PR");

      const totalAmount = input.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );

      const approvalLevel = await determineApproval(totalAmount, org!.id);
      const status = approvalLevel === "auto" ? "approved" : "pending";

      const [pr] = await db
        .insert(purchaseRequests)
        .values({
          orgId: org!.id,
          number: prNumber,
          requesterId: user!.id,
          title: input.title,
          justification: input.justification,
          totalAmount: totalAmount.toString(),
          status,
          priority: input.priority ?? "medium",
          department: input.department,
          budgetCode: input.budgetCode,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      // Insert items
      if (input.items.length > 0) {
        await db.insert(purchaseRequestItems).values(
          input.items.map((item: { description: string; quantity: number; unitPrice: number; vendorId?: string; assetTypeId?: string }) => ({
            prId: pr!.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toString(),
            vendorId: item.vendorId,
            assetTypeId: item.assetTypeId,
          })),
        );
      }

      return { ...pr, approvalRequired: approvalLevel !== "auto", approvalLevel };
    }),

    approve: permissionProcedure("approvals", "approve")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [updated] = await db
          .update(purchaseRequests)
          .set({ status: "approved", updatedAt: new Date() })
          .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.orgId, org!.id)))
          .returning();

        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

        if (updated.requesterId) {
          sendNotification({
            orgId: org!.id,
            userId: updated.requesterId,
            title: `Purchase request approved: ${updated.number}`,
            body: updated.title,
            link: `/app/procurement`,
            type: "success",
            sourceType: "purchase_request",
            sourceId: updated.id,
          }).catch(() => {});
        }

        return updated;
      }),

    reject: permissionProcedure("procurement", "approve")
      .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [updated] = await db
          .update(purchaseRequests)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.orgId, org!.id)))
          .returning();

        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

        if (updated.requesterId) {
          sendNotification({
            orgId: org!.id,
            userId: updated.requesterId,
            title: `Purchase request rejected: ${updated.number}`,
            body: input.reason ?? updated.title,
            link: `/app/procurement`,
            type: "error",
            sourceType: "purchase_request",
            sourceId: updated.id,
          }).catch(() => {});
        }

        return updated;
      }),
  }),

  purchaseOrders: router({
    list: permissionProcedure("purchase_orders", "read").query(async ({ ctx }) => {
      return ctx.db.select().from(purchaseOrders).where(eq(purchaseOrders.orgId, ctx.org!.id)).orderBy(desc(purchaseOrders.createdAt));
    }),

    createFromPR: permissionProcedure("purchase_orders", "write")
      .input(z.object({ prId: z.string().uuid(), vendorId: z.string().uuid(), expectedDelivery: z.coerce.date().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [pr] = await db
          .select()
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.id, input.prId), eq(purchaseRequests.orgId, org!.id)));

        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
        if (pr.status !== "approved") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PR must be approved before creating PO" });
        }

        const prItems = await db
          .select()
          .from(purchaseRequestItems)
          .where(eq(purchaseRequestItems.prId, input.prId));

        const poNumber = await getNextNumber(db, org!.id, "PO");

        const [po] = await db
          .insert(purchaseOrders)
          .values({
            orgId: org!.id,
            poNumber,
            prId: input.prId,
            vendorId: input.vendorId,
            totalAmount: pr.totalAmount,
            status: "draft",
            expectedDelivery: input.expectedDelivery,
          })
          .returning();

        if (prItems.length > 0) {
          await db.insert(poLineItems).values(
            prItems.map((item: typeof purchaseRequestItems.$inferSelect) => ({
              poId: po!.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              receivedQuantity: 0,
            })),
          );
        }

        await db
          .update(purchaseRequests)
          .set({ status: "ordered" })
          .where(eq(purchaseRequests.id, input.prId));

        return po;
      }),

    receive: permissionProcedure("purchase_orders", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          lineItems: z.array(z.object({ lineItemId: z.string().uuid(), receivedQty: z.coerce.number().int().nonnegative() })),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        for (const item of input.lineItems) {
          await db
            .update(poLineItems)
            .set({ receivedQuantity: item.receivedQty })
            .where(eq(poLineItems.id, item.lineItemId));
        }

        // Check if fully received
        const allItems = await db.select().from(poLineItems).where(eq(poLineItems.poId, input.id));
        const allReceived = allItems.every((item: typeof poLineItems.$inferSelect) => item.receivedQuantity >= item.quantity);

        const [updated] = await db
          .update(purchaseOrders)
          .set({
            status: allReceived ? "received" : "partially_received",
            updatedAt: new Date(),
          })
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)))
          .returning();

        return updated;
      }),

    send: permissionProcedure("purchase_orders", "write")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(purchaseOrders)
          .set({ status: "sent", updatedAt: new Date() })
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    markReceived: permissionProcedure("purchase_orders", "write")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(purchaseOrders)
          .set({ status: "received", updatedAt: new Date() })
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),

  invoices: router({
    list: permissionProcedure("financial", "read").query(async ({ ctx }) => {
      return ctx.db.select().from(invoices).where(eq(invoices.orgId, ctx.org!.id)).orderBy(desc(invoices.createdAt));
    }),

    matchToOrder: permissionProcedure("financial", "read")
      .input(z.object({ invoiceId: z.string().uuid(), poId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [invoice] = await db
          .select()
          .from(invoices)
          .where(and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, org!.id)));

        const [po] = await db
          .select()
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.orgId, org!.id)));

        if (!invoice || !po) throw new TRPCError({ code: "NOT_FOUND" });

        const invoiceTotal = parseFloat(invoice.amount);
        const poTotal = parseFloat(po.totalAmount);
        const discrepancy = Math.abs(invoiceTotal - poTotal);
        const matched = discrepancy < 1; // $1 tolerance

        return {
          invoice,
          po,
          matched,
          discrepancy,
          discrepancyPct: Math.round((discrepancy / poTotal) * 100),
        };
      }),
  }),

  dashboard: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const [pendingCount] = await db
      .select({ count: count() })
      .from(purchaseRequests)
      .where(and(eq(purchaseRequests.orgId, org!.id), eq(purchaseRequests.status, "pending")));

    const [totalSpend] = await db
      .select({ total: sum(purchaseOrders.totalAmount) })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.orgId, org!.id), sql`${purchaseOrders.status} NOT IN ('cancelled', 'draft')`));

    return {
      pendingApprovals: pendingCount?.count ?? 0,
      totalSpend: totalSpend?.total ?? "0",
    };
  }),
});
