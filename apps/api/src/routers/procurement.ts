import { router, permissionProcedure, adminProcedure } from "../lib/trpc";
import { sendNotification } from "../services/notifications";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getTableColumns } from "drizzle-orm";
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
  organizations,
  legalEntities,
  eq,
  and,
  desc,
  asc,
  count,
  sum,
  sql,
} from "@nexusops/db";
import { CreatePurchaseRequestSchema } from "@nexusops/types";
import {
  getProcurementMatchToleranceAbs,
  getProcurementApprovalTiers,
  getDuplicatePayablePolicy,
} from "../lib/org-settings";
import { computeInvoicePoMatch } from "../lib/invoice-po-match";

async function determineApproval(amount: number, orgSettings: unknown): Promise<string> {
  const { prAutoApproveBelow, prDeptHeadMax } = getProcurementApprovalTiers(orgSettings);
  if (amount < prAutoApproveBelow) return "auto";
  if (amount < prDeptHeadMax) return "dept_head";
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

  /** Org legal entities for PO tagging (procurement read — no separate `financial` permission required). */
  legalEntityOptions: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select({ id: legalEntities.id, code: legalEntities.code, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.orgId, org!.id))
      .orderBy(asc(legalEntities.code));
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
        itemCount: input.items.length,
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

      const [freshOrg] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const approvalLevel = await determineApproval(totalAmount, freshOrg?.settings ?? org!.settings);
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

    get: permissionProcedure("procurement", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [pr] = await db
          .select()
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.orgId, org!.id)));
        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });

        const items = await db
          .select()
          .from(purchaseRequestItems)
          .where(eq(purchaseRequestItems.prId, pr.id));

        return { ...pr, items };
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
      const { db, org } = ctx;
      return db
        .select({
          ...getTableColumns(purchaseOrders),
          legalEntityCode: legalEntities.code,
          legalEntityName: legalEntities.name,
        })
        .from(purchaseOrders)
        .leftJoin(legalEntities, eq(purchaseOrders.legalEntityId, legalEntities.id))
        .where(eq(purchaseOrders.orgId, org!.id))
        .orderBy(desc(purchaseOrders.createdAt));
    }),

    get: permissionProcedure("purchase_orders", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [po] = await db
          .select({
            ...getTableColumns(purchaseOrders),
            legalEntityCode: legalEntities.code,
            legalEntityName: legalEntities.name,
            vendorName: vendors.name,
          })
          .from(purchaseOrders)
          .leftJoin(legalEntities, eq(purchaseOrders.legalEntityId, legalEntities.id))
          .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)));

        if (!po) throw new TRPCError({ code: "NOT_FOUND" });

        const items = await db
          .select()
          .from(poLineItems)
          .where(eq(poLineItems.poId, po.id));

        return { ...po, items };
      }),

    createFromPR: permissionProcedure("purchase_orders", "write")
      .input(
        z.object({
          prId: z.string().uuid(),
          vendorId: z.string().uuid(),
          expectedDelivery: z.coerce.date().optional(),
          legalEntityId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        if (input.legalEntityId) {
          const [leRow] = await db
            .select({ id: legalEntities.id })
            .from(legalEntities)
            .where(and(eq(legalEntities.id, input.legalEntityId), eq(legalEntities.orgId, org!.id)));
          if (!leRow) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Legal entity not found" });
          }
        }

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
            legalEntityId: input.legalEntityId ?? null,
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
        const out = await computeInvoicePoMatch(db, org!.id, input.invoiceId, input.poId);
        return {
          invoice: out.invoice,
          po: out.po,
          matched: out.matched,
          discrepancy: out.discrepancy,
          toleranceUsed: out.toleranceUsed,
          discrepancyPct: out.discrepancyPct,
          invoiceLineSum: out.invoiceLineSum,
          poLineSum: out.poLineSum,
          poLineCount: out.poLineCount,
          invoiceLineCount: out.invoiceLineCount,
          poInvoiceLineDelta: out.poInvoiceLineDelta,
          lineKeyedMatched: out.lineKeyedMatched,
          lineMatchRows: out.lineMatchRows,
          grnReceivedValue: out.grnReceivedValue,
        };
      }),

    /** Persist successful three-way match: links `poId` and sets `matchingStatus` to `matched` (pay-ready for period close). */
    applyMatchToOrder: permissionProcedure("financial", "write")
      .input(z.object({ invoiceId: z.string().uuid(), poId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const out = await computeInvoicePoMatch(db, org!.id, input.invoiceId, input.poId);
        if (!out.matched) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "INVOICE_PO_MATCH_FAILED",
          });
        }
        const [updated] = await db
          .update(invoices)
          .set({
            poId: input.poId,
            matchingStatus: "matched",
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        return {
          ok: true as const,
          invoice: updated,
          match: {
            discrepancy: out.discrepancy,
            toleranceUsed: out.toleranceUsed,
            lineKeyedMatched: out.lineKeyedMatched,
          },
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

  /** DB-backed PR approval tiers (US-FIN-003). */
  approvalRules: router({
    get: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const settings = row?.settings ?? org!.settings;
      const tiers = getProcurementApprovalTiers(settings);
      return {
        ...tiers,
        poMatchToleranceAbs: getProcurementMatchToleranceAbs(settings),
        duplicatePayableInvoicePolicy: getDuplicatePayablePolicy(settings),
        currencyNote: "Amounts use the same numeric basis as PR line totals (org default: INR-style integers in product copy).",
      };
    }),

    update: adminProcedure
      .input(
        z.object({
          prAutoApproveBelow: z.coerce.number().min(0).max(1e12),
          prDeptHeadMax: z.coerce.number().min(1).max(1e12),
          /** Absolute amount allowed between PO total and invoice total for `matchToOrder` (default 1). */
          poMatchToleranceAbs: z.coerce.number().min(0).max(1e9).optional(),
          /** Payable invoice: duplicate vendor + invoice # — `off` (no check), `warn` (allow + flag), `block` (reject). */
          duplicatePayableInvoicePolicy: z.enum(["off", "warn", "block"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.prDeptHeadMax <= input.prAutoApproveBelow) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "prDeptHeadMax must be greater than prAutoApproveBelow",
          });
        }
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevProc = (raw.procurement as Record<string, unknown> | undefined) ?? {};
        const procurement: Record<string, unknown> = {
          ...prevProc,
          prAutoApproveBelow: input.prAutoApproveBelow,
          prDeptHeadMax: input.prDeptHeadMax,
        };
        if (input.poMatchToleranceAbs !== undefined) {
          procurement.poMatchToleranceAbs = input.poMatchToleranceAbs;
        }
        if (input.duplicatePayableInvoicePolicy !== undefined) {
          procurement.duplicatePayableInvoicePolicy = input.duplicatePayableInvoicePolicy;
        }
        await db
          .update(organizations)
          .set({
            settings: {
              ...raw,
              procurement,
            },
          })
          .where(eq(organizations.id, org!.id));

        return {
          ok: true as const,
          prAutoApproveBelow: input.prAutoApproveBelow,
          prDeptHeadMax: input.prDeptHeadMax,
          poMatchToleranceAbs: procurement.poMatchToleranceAbs,
          duplicatePayableInvoicePolicy: procurement.duplicatePayableInvoicePolicy,
          previous: {
            prAutoApproveBelow: prevProc.prAutoApproveBelow,
            prDeptHeadMax: prevProc.prDeptHeadMax,
            poMatchToleranceAbs: prevProc.poMatchToleranceAbs,
            duplicatePayableInvoicePolicy: prevProc.duplicatePayableInvoicePolicy,
          },
        };
      }),
  }),
});
