/**
 * crm/deals.ts — Deals sub-router
 *
 * All Deal, Quote, and pipeline-management procedures.
 * Accessed via `trpc.crm.deals.*` on the frontend.
 */
import { router, permissionProcedure, adminProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmDeals, crmQuotes, organizations, eq, and, desc, notInArray } from "@nexusops/db";
import { getNextNumber } from "../../lib/auto-number";
import {
  getCrmDealApprovalThresholds,
  getDealCloseApprovalTier,
  type DealCloseApprovalTier,
} from "../../lib/org-settings";

export const crmDealsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ stage: z.string().optional(), accountId: z.string().uuid().optional(), limit: z.coerce.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmDeals.orgId, org!.id)];
      if (input.stage) conditions.push(eq(crmDeals.stage, input.stage as any));
      if (input.accountId) conditions.push(eq(crmDeals.accountId, input.accountId));
      return db.select().from(crmDeals).where(and(...conditions)).orderBy(desc(crmDeals.updatedAt)).limit(input.limit);
    }),

  get: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deal] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      return deal;
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      title: z.string(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      value: z.string().optional(),
      probability: z.coerce.number().default(10),
      expectedClose: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const weightedValue = input.value && input.probability
        ? String(Number(input.value) * (input.probability / 100)) : undefined;
      const [deal] = await db.insert(crmDeals).values({
        orgId: org!.id, ...input, ownerId: user!.id, weightedValue,
        expectedClose: input.expectedClose ? new Date(input.expectedClose) : undefined,
      }).returning();
      return deal;
    }),

  delete: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deal] = await db.delete(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      return { success: true };
    }),

  movePipeline: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), stage: z.enum(["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });

      const [freshOrg] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, org!.id));
      const settings = freshOrg?.settings ?? org!.settings;

      const amount = Number(existing.value ?? 0);
      const required = getDealCloseApprovalTier(amount, settings);

      if (input.stage === "closed_won" && required !== "none") {
        if (!existing.wonApprovedAt) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: required === "executive"
              ? "Deal value requires executive approval before closed-won."
              : "Deal value requires leadership approval before closed-won.",
          });
        }
        if (required === "executive" && existing.wonApprovalTier !== "executive") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Executive-tier approval is required for this deal value." });
        }
      }

      const updates: Record<string, unknown> = { stage: input.stage, updatedAt: new Date() };
      if (input.stage === "closed_won" || input.stage === "closed_lost") {
        updates.closedAt = new Date();
      } else {
        updates.wonApprovedAt = null;
        updates.wonApprovedBy = null;
        updates.wonApprovalTier = null;
        updates.closedAt = null;
      }

      const [deal] = await db.update(crmDeals).set(updates as any).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      return deal;
    }),

  /** Records approval to allow gated closed_won moves. */
  approveDealWon: adminProcedure
    .input(z.object({ id: z.string().uuid(), tier: z.enum(["manager", "executive"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [deal] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });

      const [freshOrg] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, org!.id));
      const settings = freshOrg?.settings ?? org!.settings;
      const amount = Number(deal.value ?? 0);
      const required: DealCloseApprovalTier = getDealCloseApprovalTier(amount, settings);
      if (required === "none") throw new TRPCError({ code: "BAD_REQUEST", message: "This deal value does not require recorded approval." });
      if (required === "executive" && input.tier !== "executive") throw new TRPCError({ code: "BAD_REQUEST", message: "This deal requires executive approval tier." });

      const [updated] = await db.update(crmDeals).set({ wonApprovedAt: new Date(), wonApprovedBy: user!.id, wonApprovalTier: input.tier, updatedAt: new Date() })
        .where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      return updated;
    }),

  /** DB-backed deal close thresholds (US-CRM-003). */
  approvalThresholds: router({
    get: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
      const { org } = ctx;
      return getCrmDealApprovalThresholds(org!.settings);
    }),
    update: adminProcedure
      .input(z.object({
        dealApprovalCurrency: z.string().length(3).transform((s) => s.toUpperCase()),
        dealCloseNoApprovalBelow: z.coerce.number().min(0).max(1e14),
        dealCloseExecutiveAbove: z.coerce.number().min(1).max(1e14),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.dealCloseExecutiveAbove <= input.dealCloseNoApprovalBelow) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "dealCloseExecutiveAbove must be greater than dealCloseNoApprovalBelow" });
        }
        const { db, org } = ctx;
        const [row] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevCrm = (raw.crm as Record<string, unknown> | undefined) ?? {};
        const crm = { ...prevCrm, ...input };
        await db.update(organizations).set({ settings: { ...raw, crm } }).where(eq(organizations.id, org!.id));
        return { ok: true as const, ...input, previous: { dealApprovalCurrency: prevCrm.dealApprovalCurrency, dealCloseNoApprovalBelow: prevCrm.dealCloseNoApprovalBelow, dealCloseExecutiveAbove: prevCrm.dealCloseExecutiveAbove } };
      }),
  }),

  // ── Quotes ─────────────────────────────────────────────────────────────────
  quotes: router({
    list: permissionProcedure("accounts", "read")
      .input(z.object({ dealId: z.string().uuid().optional(), status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(crmQuotes.orgId, org!.id)];
        if (input.dealId) conditions.push(eq(crmQuotes.dealId, input.dealId));
        if (input.status) conditions.push(eq(crmQuotes.status, input.status as any));
        return db.select().from(crmQuotes).where(and(...conditions)).orderBy(desc(crmQuotes.createdAt));
      }),

    create: permissionProcedure("accounts", "write")
      .input(z.object({
        dealId: z.string().uuid().optional(),
        items: z.array(z.object({ description: z.string(), quantity: z.coerce.number(), unitPrice: z.string(), total: z.string() })).default([]),
        discountPct: z.string().default("0"),
        validUntil: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const quoteNumber = await getNextNumber(db, org!.id, "QT");
        const subtotal = input.items.reduce((acc, i) => acc + Number(i.total), 0);
        const total = subtotal * (1 - Number(input.discountPct) / 100);
        const [quote] = await db.insert(crmQuotes).values({
          orgId: org!.id, quoteNumber, ...input, subtotal: String(subtotal), total: String(total),
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        }).returning();
        return quote;
      }),

    update: permissionProcedure("accounts", "write")
      .input(z.object({ id: z.string().uuid(), status: z.enum(["draft", "sent", "viewed", "accepted", "declined", "expired"]).optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...data } = input;
        const [quote] = await db.update(crmQuotes).set({ ...data, updatedAt: new Date() } as any)
          .where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, org!.id))).returning();
        if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
        return quote;
      }),
  }),
});
