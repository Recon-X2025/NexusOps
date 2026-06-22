import { router, permissionProcedure, adminProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  crmAccounts, crmContacts, crmDeals, crmLeads, crmActivities, crmQuotes,
  organizations,
  eq, and, desc, count, sum, inArray, notInArray, lt,
} from "@coheronconnect/db";
import { getNextNumber } from "../lib/auto-number";
import {
  getCrmDealApprovalThresholds,
  getDealCloseApprovalTier,
  type DealCloseApprovalTier,
} from "../lib/org-settings";

async function getCrmExecutiveSummary(db: any, orgId: string) {
  const [openDeals] = await db.select({ cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"])));
  const [wonDeals] = await db.select({ cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), eq(crmDeals.stage, "closed_won")));
  const [newLeads] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), eq(crmLeads.status, "new")));

  const pipelineByStage = await db.select({
    stage: crmDeals.stage,
    cnt: count(),
    total: sum(crmDeals.value),
  }).from(crmDeals).where(and(
    eq(crmDeals.orgId, orgId),
    notInArray(crmDeals.stage, ["closed_won", "closed_lost"]),
  )).groupBy(crmDeals.stage);

  const recentDeals = await db.select().from(crmDeals)
    .where(eq(crmDeals.orgId, orgId))
    .orderBy(desc(crmDeals.updatedAt))
    .limit(5);

  const openLeadStatuses = ["new", "contacted", "qualified"] as const;
  const [openLeadsRow] = await db.select({ cnt: count() }).from(crmLeads).where(and(
    eq(crmLeads.orgId, orgId),
    inArray(crmLeads.status, [...openLeadStatuses]),
  ));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [staleLeadsRow] = await db.select({ cnt: count() }).from(crmLeads).where(and(
    eq(crmLeads.orgId, orgId),
    inArray(crmLeads.status, [...openLeadStatuses]),
    lt(crmLeads.createdAt, sevenDaysAgo),
  ));

  return {
    openPipeline: { count: Number(openDeals?.cnt ?? 0), value: String(openDeals?.total ?? "0") },
    closedWon: { count: Number(wonDeals?.cnt ?? 0), value: String(wonDeals?.total ?? "0") },
    newLeads: Number(newLeads?.cnt ?? 0),
    pipelineByStage: pipelineByStage.map((r: { stage: string; cnt: unknown; total: unknown }) => ({
      stage: r.stage,
      count: Number(r.cnt ?? 0),
      value: String(r.total ?? "0"),
    })),
    recentDeals,
    leads: {
      open: Number(openLeadsRow?.cnt ?? 0),
      openStaleOver7Days: Number(staleLeadsRow?.cnt ?? 0),
    },
  };
}

export const crmRouter = router({
  // ── Accounts ──────────────────────────────────────────────────────────────
  listAccounts: permissionProcedure("accounts", "read")
    .input(z.object({ tier: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmAccounts.orgId, org!.id)];
      if (input.tier) conditions.push(eq(crmAccounts.tier, input.tier as any));
      return db.select().from(crmAccounts).where(and(...conditions)).orderBy(desc(crmAccounts.createdAt)).limit(input.limit);
    }),

  createAccount: permissionProcedure("accounts", "write")
    .input(z.object({ name: z.string(), industry: z.string().optional(), tier: z.enum(["enterprise", "mid_market", "smb"]).default("smb"), website: z.string().optional(), annualRevenue: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [account] = await db.insert(crmAccounts).values({ orgId: org!.id, ...input, ownerId: user!.id }).returning();
      return account;
    }),

  updateAccount: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), healthScore: z.coerce.number().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [account] = await db.update(crmAccounts).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(crmAccounts.id, id), eq(crmAccounts.orgId, org!.id))).returning();
      return account;
    }),

  getAccount: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [account] = await db.select().from(crmAccounts).where(and(eq(crmAccounts.id, input.id), eq(crmAccounts.orgId, org!.id)));
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return account;
    }),

  deleteAccount: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [account] = await db.delete(crmAccounts).where(and(eq(crmAccounts.id, input.id), eq(crmAccounts.orgId, org!.id))).returning();
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return { success: true };
    }),

  // ── Contacts ──────────────────────────────────────────────────────────────
  listContacts: permissionProcedure("accounts", "read")
    .input(z.object({ accountId: z.string().uuid().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmContacts.orgId, org!.id)];
      if (input.accountId) conditions.push(eq(crmContacts.accountId, input.accountId));
      return db.select().from(crmContacts).where(and(...conditions)).orderBy(crmContacts.lastName).limit(input.limit);
    }),

  createContact: permissionProcedure("accounts", "write")
    .input(z.object({ firstName: z.string(), lastName: z.string(), email: z.string().optional(), phone: z.string().optional(), title: z.string().optional(), accountId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.insert(crmContacts).values({ orgId: org!.id, ...input }).returning();
      return contact;
    }),

  getContact: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.select().from(crmContacts).where(and(eq(crmContacts.id, input.id), eq(crmContacts.orgId, org!.id)));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      return contact;
    }),

  deleteContact: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.delete(crmContacts).where(and(eq(crmContacts.id, input.id), eq(crmContacts.orgId, org!.id))).returning();
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      return { success: true };
    }),

  // ── Deals ─────────────────────────────────────────────────────────────────
  listDeals: permissionProcedure("accounts", "read")
    .input(z.object({ stage: z.string().optional(), accountId: z.string().uuid().optional(), limit: z.coerce.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmDeals.orgId, org!.id)];
      if (input.stage) conditions.push(eq(crmDeals.stage, input.stage as any));
      if (input.accountId) conditions.push(eq(crmDeals.accountId, input.accountId));
      return db.select().from(crmDeals).where(and(...conditions)).orderBy(desc(crmDeals.updatedAt)).limit(input.limit);
    }),

  createDeal: permissionProcedure("accounts", "write")
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

  movePipeline: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), stage: z.enum(["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db
        .select()
        .from(crmDeals)
        .where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });

      const [freshOrg] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const settings = freshOrg?.settings ?? org!.settings;

      const amount = Number(existing.value ?? 0);
      const required = getDealCloseApprovalTier(amount, settings);

      if (input.stage === "closed_won" && required !== "none") {
        if (!existing.wonApprovedAt) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              required === "executive"
                ? "Deal value requires executive approval before closed-won. An owner/admin must record approval (Admin → CRM deal thresholds or approveDealWon)."
                : "Deal value requires leadership approval before closed-won. An owner/admin must record approval first.",
          });
        }
        if (required === "executive" && existing.wonApprovalTier !== "executive") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Executive-tier approval is required for this deal value.",
          });
        }
      }

      const updates: Record<string, unknown> = { stage: input.stage, updatedAt: new Date() };
      if (input.stage === "closed_won" || input.stage === "closed_lost") {
        updates.closedAt = new Date();
      } else {
        // Re-opening pipeline clears won approval so value/stage changes re-validate.
        updates.wonApprovedAt = null;
        updates.wonApprovedBy = null;
        updates.wonApprovalTier = null;
        updates.closedAt = null;
      }

      const [deal] = await db
        .update(crmDeals)
        .set(updates as any)
        .where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)))
        .returning();
      return deal;
    }),

  /** US-CRM-003: owner/admin records leadership approval to allow gated closed_won moves. */
  approveDealWon: adminProcedure
    .input(z.object({ id: z.string().uuid(), tier: z.enum(["manager", "executive"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [deal] = await db
        .select()
        .from(crmDeals)
        .where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });

      const [freshOrg] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const settings = freshOrg?.settings ?? org!.settings;
      const amount = Number(deal.value ?? 0);
      const required: DealCloseApprovalTier = getDealCloseApprovalTier(amount, settings);
      if (required === "none") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This deal value does not require recorded approval.",
        });
      }
      if (required === "executive" && input.tier !== "executive") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This deal requires executive approval tier.",
        });
      }

      const [updated] = await db
        .update(crmDeals)
        .set({
          wonApprovedAt: new Date(),
          wonApprovedBy: user!.id,
          wonApprovalTier: input.tier,
          updatedAt: new Date(),
        })
        .where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)))
        .returning();
      return updated;
    }),

  getDeal: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deal] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      return deal;
    }),

  deleteDeal: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deal] = await db.delete(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      return { success: true };
    }),

  /** DB-backed deal close thresholds (US-CRM-003). */
  dealApprovalThresholds: router({
    get: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
      const { org } = ctx;
      return getCrmDealApprovalThresholds(org!.settings);
    }),

    update: adminProcedure
      .input(
        z.object({
          dealApprovalCurrency: z.string().length(3).transform((s) => s.toUpperCase()),
          dealCloseNoApprovalBelow: z.coerce.number().min(0).max(1e14),
          dealCloseExecutiveAbove: z.coerce.number().min(1).max(1e14),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.dealCloseExecutiveAbove <= input.dealCloseNoApprovalBelow) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "dealCloseExecutiveAbove must be greater than dealCloseNoApprovalBelow",
          });
        }
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevCrm = (raw.crm as Record<string, unknown> | undefined) ?? {};
        const crm = {
          ...prevCrm,
          dealApprovalCurrency: input.dealApprovalCurrency,
          dealCloseNoApprovalBelow: input.dealCloseNoApprovalBelow,
          dealCloseExecutiveAbove: input.dealCloseExecutiveAbove,
        };
        await db
          .update(organizations)
          .set({ settings: { ...raw, crm } })
          .where(eq(organizations.id, org!.id));

        return {
          ok: true as const,
          ...input,
          previous: {
            dealApprovalCurrency: prevCrm.dealApprovalCurrency,
            dealCloseNoApprovalBelow: prevCrm.dealCloseNoApprovalBelow,
            dealCloseExecutiveAbove: prevCrm.dealCloseExecutiveAbove,
          },
        };
      }),
  }),

  // ── Leads ─────────────────────────────────────────────────────────────────
  listLeads: permissionProcedure("accounts", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmLeads.orgId, org!.id)];
      if (input.status) conditions.push(eq(crmLeads.status, input.status as any));
      return db.select().from(crmLeads).where(and(...conditions)).orderBy(desc(crmLeads.score)).limit(input.limit);
    }),

  createLead: permissionProcedure("accounts", "write")
    .input(z.object({ firstName: z.string(), lastName: z.string(), email: z.string().optional(), company: z.string().optional(), source: z.string().default("website") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [lead] = await db.insert(crmLeads).values({ orgId: org!.id, ...input, ownerId: user!.id, source: input.source as any }).returning();
      return lead;
    }),

  updateLead: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      company: z.string().optional(),
      title: z.string().optional(),
      status: z.enum(["new", "contacted", "qualified", "disqualified", "converted"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [lead] = await db.update(crmLeads)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, org!.id)))
        .returning();
      return lead;
    }),

  convertLead: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), dealTitle: z.string(), dealValue: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [{ cnt }] = await db.select({ cnt: count() }).from(crmDeals).where(eq(crmDeals.orgId, org!.id));
      const [deal] = await db.insert(crmDeals).values({
        orgId: org!.id, title: input.dealTitle, value: input.dealValue, ownerId: user!.id,
        weightedValue: input.dealValue ? String(Number(input.dealValue) * 0.1) : undefined,
      }).returning();
      await db.update(crmLeads).set({ status: "converted", convertedDealId: deal!.id, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, input.id), eq(crmLeads.orgId, org!.id)));
      return deal;
    }),

  // ── Activities ─────────────────────────────────────────────────────────────
  listActivities: permissionProcedure("accounts", "read")
    .input(z.object({ dealId: z.string().uuid().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmActivities.orgId, org!.id)];
      if (input.dealId) conditions.push(eq(crmActivities.dealId, input.dealId));
      return db.select().from(crmActivities).where(and(...conditions)).orderBy(desc(crmActivities.createdAt)).limit(input.limit);
    }),

  createActivity: permissionProcedure("accounts", "write")
    .input(z.object({ type: z.string(), subject: z.string(), description: z.string().optional(), dealId: z.string().uuid().optional(), outcome: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [activity] = await db.insert(crmActivities).values({ orgId: org!.id, ...input, ownerId: user!.id, type: input.type as any }).returning();
      return activity;
    }),

  // ── Quotes ────────────────────────────────────────────────────────────────
  listQuotes: permissionProcedure("accounts", "read")
    .input(z.object({ dealId: z.string().uuid().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmQuotes.orgId, org!.id)];
      if (input.dealId) conditions.push(eq(crmQuotes.dealId, input.dealId));
      if (input.status) conditions.push(eq(crmQuotes.status, input.status as any));
      return db.select().from(crmQuotes).where(and(...conditions)).orderBy(desc(crmQuotes.createdAt));
    }),

  createQuote: permissionProcedure("accounts", "write")
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
        orgId: org!.id, quoteNumber, ...input,
        subtotal: String(subtotal), total: String(total),
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
      }).returning();
      return quote;
    }),

  updateQuote: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), status: z.enum(["draft", "sent", "viewed", "accepted", "declined", "expired"]).optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [quote] = await db.update(crmQuotes).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, org!.id))).returning();
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      return quote;
    }),

  // ── Dashboard Metrics ──────────────────────────────────────────────────────
  dashboardMetrics: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    const summary = await getCrmExecutiveSummary(ctx.db, ctx.org!.id);
    return {
      openPipeline: summary.openPipeline,
      closedWon: summary.closedWon,
      newLeads: summary.newLeads,
    };
  }),

  /** Hub + analytics: single round-trip for pipeline, recent deals, and lead aging. */
  executiveSummary: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    return getCrmExecutiveSummary(ctx.db, ctx.org!.id);
  }),
});
