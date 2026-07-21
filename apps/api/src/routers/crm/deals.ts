/**
 * crm/deals.ts — Deals sub-router
 *
 * All Deal, Quote, and pipeline-management procedures.
 * Accessed via `trpc.crm.deals.*` on the frontend.
 */
import { router, permissionProcedure, adminProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmDeals, crmQuotes, crmPipelineStages, organizations, dealStageEnum, quoteStatusEnum, eq, and, asc, desc, type DbOrTx } from "@coheronconnect/db";
import { getNextNumber } from "../../lib/auto-number";
import {
  getCrmDealApprovalThresholds,
  getDealCloseApprovalTier,
  type DealCloseApprovalTier,
} from "../../lib/org-settings";
import { buildQuoteTaxColumns, type QuoteLine } from "../../lib/crm/quote-tax";

/** Shape a stored quote row for the frontend (adds a friendly lineItems view). */
export function serializeQuote(quote: typeof crmQuotes.$inferSelect) {
  const items = Array.isArray(quote.items) ? quote.items : [];
  return {
    ...quote,
    lineItems: items.map((item, idx) => ({
      line: idx + 1,
      product: item.description || "Line Item",
      description: item.description || "",
      qty: item.quantity || 1,
      unitPrice: Number(item.unitPrice || 0),
      discount: 0,
      total: Number(item.total || 0),
      hsnCode: item.hsnCode ?? null,
      gstRate: item.gstRate ?? null,
    })),
  };
}

/** Canonical deal_stage enum values (storage layer — never changes per org). */
export const DEAL_STAGE_KEYS = [
  "prospect",
  "qualification",
  "proposal",
  "negotiation",
  "verbal_commit",
  "closed_won",
  "closed_lost",
] as const;
export type DealStageKey = (typeof DEAL_STAGE_KEYS)[number];

const dealStageSchema = z.enum(DEAL_STAGE_KEYS);

/** Factory defaults used to seed `crm_pipeline_stages` for a new org. */
export const DEFAULT_PIPELINE_STAGES: Array<{
  key: DealStageKey;
  label: string;
  color: string;
  rank: number;
  active: boolean;
}> = [
  { key: "prospect",      label: "Prospect",      color: "text-muted-foreground bg-muted", rank: 0, active: true },
  { key: "qualification", label: "Qualification", color: "text-blue-700 bg-blue-100",      rank: 1, active: true },
  { key: "proposal",      label: "Proposal",      color: "text-indigo-700 bg-indigo-100",  rank: 2, active: true },
  { key: "negotiation",   label: "Negotiation",   color: "text-purple-700 bg-purple-100",  rank: 3, active: true },
  { key: "verbal_commit", label: "Verbal Commit", color: "text-orange-700 bg-orange-100",  rank: 4, active: true },
  { key: "closed_won",    label: "Closed Won",    color: "text-green-700 bg-green-100",     rank: 5, active: false },
  { key: "closed_lost",   label: "Closed Lost",   color: "text-red-700 bg-red-100",         rank: 6, active: false },
];

/**
 * Loads an org's pipeline-stage config, seeding factory defaults on first read.
 * Always returns all 7 enum stages ordered by rank so the kanban/select stays complete.
 */
async function loadPipelineStages(db: DbOrTx, orgId: string) {
  const existing = await db
    .select()
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.orgId, orgId))
    .orderBy(asc(crmPipelineStages.rank));

  if (existing.length === 0) {
    await db
      .insert(crmPipelineStages)
      .values(DEFAULT_PIPELINE_STAGES.map((s) => ({ orgId, ...s })))
      .onConflictDoNothing();
    return db
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.orgId, orgId))
      .orderBy(asc(crmPipelineStages.rank));
  }
  return existing;
}

export const crmDealsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ stage: z.enum(dealStageEnum.enumValues).optional(), accountId: z.string().uuid().optional(), limit: z.coerce.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmDeals.orgId, org!.id)];
      if (input.stage) conditions.push(eq(crmDeals.stage, input.stage));
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

  update: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      value: z.string().optional(),
      probability: z.coerce.number().optional(),
      expectedClose: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...updates } = input;
      
      const setValues: Partial<typeof crmDeals.$inferInsert> = { updatedAt: new Date() };
      if (updates.title !== undefined) setValues.title = updates.title;
      if (updates.accountId !== undefined) setValues.accountId = updates.accountId;
      if (updates.contactId !== undefined) setValues.contactId = updates.contactId;
      if (updates.value !== undefined) setValues.value = updates.value;
      if (updates.probability !== undefined) setValues.probability = updates.probability;
      if (updates.expectedClose !== undefined) setValues.expectedClose = updates.expectedClose ? new Date(updates.expectedClose) : null;
      
      const [deal] = await db.update(crmDeals).set(setValues)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.orgId, org!.id))).returning();
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      
      // Update weighted value if value or probability changed
      if (updates.value !== undefined || updates.probability !== undefined) {
        const value = updates.value !== undefined ? Number(updates.value) : Number(deal.value ?? 0);
        const probability = updates.probability !== undefined ? updates.probability : deal.probability;
        const weightedValue = String(value * (probability / 100));
        await db.update(crmDeals).set({ weightedValue }).where(eq(crmDeals.id, id));
      }
      
      return deal;
    }),

  movePipeline: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), stage: dealStageSchema }))
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

      const updates: Partial<typeof crmDeals.$inferInsert> = { stage: input.stage, updatedAt: new Date() };
      if (input.stage === "closed_won" || input.stage === "closed_lost") {
        updates.closedAt = new Date();
      } else {
        updates.wonApprovedAt = null;
        updates.wonApprovedBy = null;
        updates.wonApprovalTier = null;
        updates.closedAt = null;
      }

      const [deal] = await db.update(crmDeals).set(updates).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
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

  // ── Pipeline stage configuration (per-org) ─────────────────────────────────
  stages: router({
    /** Returns the org's configured pipeline stages (seeds factory defaults on first read). */
    list: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await loadPipelineStages(db, org!.id);
      return rows.map((r: typeof crmPipelineStages.$inferSelect) => ({
        key: r.key,
        label: r.label,
        color: r.color,
        rank: r.rank,
        active: r.active,
      }));
    }),

    /** Update label/color/rank/active for one or more stages. Keys must be valid enum stages. */
    update: adminProcedure
      .input(
        z.object({
          stages: z
            .array(
              z.object({
                key: dealStageSchema,
                label: z.string().min(1).max(40),
                color: z.string().min(1).max(120),
                rank: z.coerce.number().int().min(0).max(99),
                active: z.boolean(),
              }),
            )
            .min(1)
            .max(DEAL_STAGE_KEYS.length),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        // Ensure the org has a base row set before applying updates.
        await loadPipelineStages(db, org!.id);
        // Atomicity: all stage updates must commit together so the kanban board
        // never reflects a partially-applied reordering/relabeling on failure.
        return await db.transaction(async (tx) => {
          for (const s of input.stages) {
            await tx
              .update(crmPipelineStages)
              .set({ label: s.label, color: s.color, rank: s.rank, active: s.active, updatedAt: new Date() })
              .where(and(eq(crmPipelineStages.orgId, org!.id), eq(crmPipelineStages.key, s.key)));
          }
          const rows = await loadPipelineStages(tx, org!.id);
          return rows.map((r: typeof crmPipelineStages.$inferSelect) => ({
            key: r.key,
            label: r.label,
            color: r.color,
            rank: r.rank,
            active: r.active,
          }));
        });
      }),

    /** Reset all stages back to factory defaults. */
    reset: adminProcedure.input(z.object({}).optional()).mutation(async ({ ctx }) => {
      const { db, org } = ctx;
      await db.delete(crmPipelineStages).where(eq(crmPipelineStages.orgId, org!.id));
      const rows = await loadPipelineStages(db, org!.id);
      return rows.map((r: typeof crmPipelineStages.$inferSelect) => ({
        key: r.key,
        label: r.label,
        color: r.color,
        rank: r.rank,
        active: r.active,
      }));
    }),
  }),

  // ── Quotes ─────────────────────────────────────────────────────────────────
  quotes: router({
    list: permissionProcedure("accounts", "read")
      .input(z.object({ dealId: z.string().uuid().optional(), status: z.enum(quoteStatusEnum.enumValues).optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(crmQuotes.orgId, org!.id)];
        if (input.dealId) conditions.push(eq(crmQuotes.dealId, input.dealId));
        if (input.status) conditions.push(eq(crmQuotes.status, input.status));
        const rows = await db.select().from(crmQuotes).where(and(...conditions)).orderBy(desc(crmQuotes.createdAt));
        return rows.map(serializeQuote);
      }),

    create: permissionProcedure("accounts", "write")
      .input(z.object({
        dealId: z.string().uuid().optional(),
        items: z.array(z.object({
          description: z.string(),
          quantity: z.coerce.number(),
          unitPrice: z.string(),
          total: z.string(),
          hsnCode: z.string().optional(),
          gstRate: z.number().optional(),
        })).default([]),
        discountPct: z.string().default("0"),
        validUntil: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const quoteNumber = await getNextNumber(db, org!.id, "QT");
        // G7 — GST: discount applies before tax; per-line CGST/SGST/IGST rolled up.
        const tax = await buildQuoteTaxColumns(db, {
          orgId: org!.id,
          dealId: input.dealId ?? null,
          items: input.items as QuoteLine[],
          discountPct: input.discountPct,
        });
        const [quote] = await db.insert(crmQuotes).values({
          orgId: org!.id,
          quoteNumber,
          dealId: input.dealId,
          items: input.items,
          discountPct: input.discountPct,
          subtotal: tax.subtotal,
          placeOfSupply: tax.placeOfSupply,
          isInterstate: tax.isInterstate,
          taxableValue: tax.taxableValue,
          cgstAmount: tax.cgstAmount,
          sgstAmount: tax.sgstAmount,
          igstAmount: tax.igstAmount,
          taxTotal: tax.taxTotal,
          total: tax.total,
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        }).returning();
        return serializeQuote(quote!);
      }),

    update: permissionProcedure("accounts", "write")
      .input(z.object({
        id: z.string().uuid(),
        status: z.enum(quoteStatusEnum.enumValues).optional(),
        notes: z.string().optional(),
        // Editing lines/discount re-computes GST so the quote never drifts.
        items: z.array(z.object({
          description: z.string(),
          quantity: z.coerce.number(),
          unitPrice: z.string(),
          total: z.string(),
          hsnCode: z.string().optional(),
          gstRate: z.number().optional(),
        })).optional(),
        discountPct: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, items, discountPct, ...data } = input;

        // Load the existing quote so a partial edit can re-tax against current lines.
        const [existing] = await db.select().from(crmQuotes)
          .where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, org!.id)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        const patch: Partial<typeof crmQuotes.$inferInsert> = { ...data, updatedAt: new Date() };

        // Re-compute GST only when the tax inputs (lines or discount) change.
        if (items !== undefined || discountPct !== undefined) {
          const nextItems = (items ?? existing.items ?? []) as QuoteLine[];
          const nextDiscount = discountPct ?? existing.discountPct ?? "0";
          const tax = await buildQuoteTaxColumns(db, {
            orgId: org!.id,
            dealId: existing.dealId,
            items: nextItems,
            discountPct: nextDiscount,
          });
          patch.items = nextItems;
          patch.discountPct = nextDiscount;
          patch.subtotal = tax.subtotal;
          patch.placeOfSupply = tax.placeOfSupply;
          patch.isInterstate = tax.isInterstate;
          patch.taxableValue = tax.taxableValue;
          patch.cgstAmount = tax.cgstAmount;
          patch.sgstAmount = tax.sgstAmount;
          patch.igstAmount = tax.igstAmount;
          patch.taxTotal = tax.taxTotal;
          patch.total = tax.total;
        }

        const [quote] = await db.update(crmQuotes).set(patch)
          .where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, org!.id))).returning();
        return serializeQuote(quote!);
      }),
  }),
});
