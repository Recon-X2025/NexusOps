/**
 * crm/index.ts — CRM Domain Router
 *
 * Composes all CRM sub-routers into a domain router with a clean nested API.
 *
 * NEW canonical paths (prefer these going forward):
 *   trpc.crm.accounts.list     ← Account management
 *   trpc.crm.accounts.get
 *   trpc.crm.deals.list        ← Pipeline / Deals
 *   trpc.crm.deals.get
 *   trpc.crm.deals.movePipeline
 *   trpc.crm.contacts.list     ← Contact management
 *   trpc.crm.leads.list        ← Lead management
 *   trpc.crm.activities.list   ← Activity timeline
 *   trpc.crm.dashboard.metrics ← Analytics
 *
 * LEGACY flat procedures are preserved as-is on this same router so all
 * existing frontend call-sites continue to work. They are annotated with
 * @deprecated and will be removed in a future cleanup sprint.
 */
import { router, permissionProcedure, adminProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  crmAccounts, crmContacts, crmDeals, crmLeads, crmActivities, crmQuotes,
  organizations,
  accountTierEnum, dealStageEnum, leadStatusEnum, leadSourceEnum, quoteStatusEnum,
  eq, and, desc, count, sum, inArray, notInArray, lt,
  type DbOrTx,
} from "@coheronconnect/db";
import { getNextNumber } from "../../lib/auto-number";
import {
  getCrmDealApprovalThresholds,
  getDealCloseApprovalTier,
  type DealCloseApprovalTier,
} from "../../lib/org-settings";

// ── Import sub-routers ────────────────────────────────────────────────────────
import { crmAccountsRouter } from "./accounts";
import { crmContactsRouter } from "./contacts";
import { crmDealsRouter, serializeQuote } from "./deals";
import { crmLeadsRouter } from "./leads";
import { crmLeadScoringRouter } from "./lead-scoring";
import { crmActivitiesRouter } from "./activities";
import { crmDashboardRouter } from "./dashboard";
import { convertLeadToDeal } from "../../lib/crm/lead-convert";
import { createScoredLead, updateScoredLead } from "../../lib/crm/lead-write";
import { buildQuoteTaxColumns, type QuoteLine } from "../../lib/crm/quote-tax";

// ─── Dashboard helper (shared between legacy + new sub-router) ────────────────
async function getCrmExecutiveSummary(db: DbOrTx, orgId: string) {
  const [openDeals] = await db.select({ cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"])));
  const [wonDeals] = await db.select({ cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), eq(crmDeals.stage, "closed_won")));
  const [newLeads] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), eq(crmLeads.status, "new")));
  const pipelineByStage = await db.select({ stage: crmDeals.stage, cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"]))).groupBy(crmDeals.stage);
  const recentDeals = await db.select().from(crmDeals).where(eq(crmDeals.orgId, orgId)).orderBy(desc(crmDeals.updatedAt)).limit(5);
  const openLeadStatuses = ["new", "contacted", "qualified"] as const;
  const [openLeadsRow] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), inArray(crmLeads.status, [...openLeadStatuses])));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [staleLeadsRow] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), inArray(crmLeads.status, [...openLeadStatuses]), lt(crmLeads.createdAt, sevenDaysAgo)));
  return {
    openPipeline: { count: Number(openDeals?.cnt ?? 0), value: String(openDeals?.total ?? "0") },
    closedWon: { count: Number(wonDeals?.cnt ?? 0), value: String(wonDeals?.total ?? "0") },
    newLeads: Number(newLeads?.cnt ?? 0),
    pipelineByStage: pipelineByStage.map((r: { stage: string; cnt: unknown; total: unknown }) => ({ stage: r.stage, count: Number(r.cnt ?? 0), value: String(r.total ?? "0") })),
    recentDeals,
    leads: { open: Number(openLeadsRow?.cnt ?? 0), openStaleOver7Days: Number(staleLeadsRow?.cnt ?? 0) },
  };
}

const activityTypeSchema = z.enum(["call", "email", "meeting", "demo", "follow_up", "note"]);

export const crmRouter = router({
  // ══════════════════════════════════════════════════════════════════════════
  // NEW: Domain-Driven Sub-Routers (canonical going forward)
  // ══════════════════════════════════════════════════════════════════════════
  accounts: crmAccountsRouter,
  contacts: crmContactsRouter,
  deals: crmDealsRouter,
  leads: crmLeadsRouter,
  leadScoring: crmLeadScoringRouter,
  activities: crmActivitiesRouter,
  dashboard: crmDashboardRouter,

  // ══════════════════════════════════════════════════════════════════════════
  // LEGACY: Flat procedures (backward-compatible, to be removed in cleanup sprint)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Accounts ──────────────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.accounts.list */
  listAccounts: permissionProcedure("accounts", "read")
    .input(z.object({ tier: z.enum(accountTierEnum.enumValues).optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmAccounts.orgId, org!.id), eq(crmAccounts.archived, input.showArchived)];
      if (input.tier) conditions.push(eq(crmAccounts.tier, input.tier));
      return db.select().from(crmAccounts).where(and(...conditions)).orderBy(desc(crmAccounts.createdAt)).limit(input.limit);
    }),
  /** @deprecated Use trpc.crm.accounts.create */
  createAccount: permissionProcedure("accounts", "write")
    .input(z.object({ name: z.string(), industry: z.string(), tier: z.enum(["enterprise", "mid_market", "smb"]).default("smb"), website: z.string().url().optional().nullable(), annualRevenue: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [account] = await db.insert(crmAccounts).values({ orgId: org!.id, ...input, ownerId: user!.id }).returning();
      return account;
    }),
  /** @deprecated Use trpc.crm.accounts.update */
  updateAccount: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), healthScore: z.coerce.number().optional(), notes: z.string().optional(), name: z.string().optional(), industry: z.string().optional(), tier: z.enum(["enterprise", "mid_market", "smb"]).optional(), website: z.string().url().optional().nullable(), annualRevenue: z.string().optional(), archived: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [account] = await db.update(crmAccounts).set({ ...data, updatedAt: new Date() }).where(and(eq(crmAccounts.id, id), eq(crmAccounts.orgId, org!.id))).returning();
      return account;
    }),
  /** @deprecated Use trpc.crm.accounts.get */
  getAccount: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [account] = await db.select().from(crmAccounts).where(and(eq(crmAccounts.id, input.id), eq(crmAccounts.orgId, org!.id)));
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return account;
    }),
  /** @deprecated Use trpc.crm.accounts.delete */
  deleteAccount: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [account] = await db.delete(crmAccounts).where(and(eq(crmAccounts.id, input.id), eq(crmAccounts.orgId, org!.id))).returning();
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return { success: true };
    }),

  // ── Contacts ──────────────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.contacts.list */
  listContacts: permissionProcedure("accounts", "read")
    .input(z.object({ accountId: z.string().uuid().optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmContacts.orgId, org!.id), eq(crmContacts.archived, input.showArchived)];
      if (input.accountId) conditions.push(eq(crmContacts.accountId, input.accountId));
      return db.select().from(crmContacts).where(and(...conditions)).orderBy(crmContacts.lastName).limit(input.limit);
    }),
  createContact: permissionProcedure("accounts", "write")
    .input(z.object({ firstName: z.string(), lastName: z.string(), email: z.string().email().optional().nullable(), phone: z.string().optional().nullable(), title: z.string().optional().nullable(), accountId: z.string().uuid().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.insert(crmContacts).values({ orgId: org!.id, ...input }).returning();
      return contact;
    }),
  /** @deprecated Use trpc.crm.contacts.update */
  updateContact: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().email().optional().nullable(), phone: z.string().optional().nullable(), title: z.string().optional().nullable(), accountId: z.string().uuid().optional().nullable(), archived: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [contact] = await db.update(crmContacts).set({ ...data, updatedAt: new Date() })
        .where(and(eq(crmContacts.id, id), eq(crmContacts.orgId, org!.id))).returning();
      return contact;
    }),
  /** @deprecated Use trpc.crm.contacts.get */
  getContact: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.select().from(crmContacts).where(and(eq(crmContacts.id, input.id), eq(crmContacts.orgId, org!.id)));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      return contact;
    }),
  /** @deprecated Use trpc.crm.contacts.delete */
  deleteContact: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.delete(crmContacts).where(and(eq(crmContacts.id, input.id), eq(crmContacts.orgId, org!.id))).returning();
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      return { success: true };
    }),

  // ── Deals ─────────────────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.deals.list */
  listDeals: permissionProcedure("accounts", "read")
    .input(z.object({ stage: z.enum(dealStageEnum.enumValues).optional(), accountId: z.string().uuid().optional(), limit: z.coerce.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmDeals.orgId, org!.id)];
      if (input.stage) conditions.push(eq(crmDeals.stage, input.stage));
      if (input.accountId) conditions.push(eq(crmDeals.accountId, input.accountId));
      return db.select().from(crmDeals).where(and(...conditions)).orderBy(desc(crmDeals.updatedAt)).limit(input.limit);
    }),
  /** @deprecated Use trpc.crm.deals.create */
  createDeal: permissionProcedure("accounts", "write")
    .input(z.object({ title: z.string(), accountId: z.string().uuid().optional(), contactId: z.string().uuid().optional(), value: z.string().optional(), probability: z.coerce.number().default(10), expectedClose: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const weightedValue = input.value && input.probability ? String(Number(input.value) * (input.probability / 100)) : undefined;
      const [deal] = await db.insert(crmDeals).values({ orgId: org!.id, ...input, ownerId: user!.id, weightedValue, expectedClose: input.expectedClose ? new Date(input.expectedClose) : undefined }).returning();
      return deal;
    }),
  /** @deprecated Use trpc.crm.deals.movePipeline */
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
        if (!existing.wonApprovedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: required === "executive" ? "Deal value requires executive approval before closed-won. An owner/admin must record approval (Admin → CRM deal thresholds or approveDealWon)." : "Deal value requires leadership approval before closed-won. An owner/admin must record approval first." });
        if (required === "executive" && existing.wonApprovalTier !== "executive") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Executive-tier approval is required for this deal value." });
      }
      const updates: Partial<typeof crmDeals.$inferInsert> = { stage: input.stage, updatedAt: new Date() };
      if (input.stage === "closed_won" || input.stage === "closed_lost") { updates.closedAt = new Date(); } else { updates.wonApprovedAt = null; updates.wonApprovedBy = null; updates.wonApprovalTier = null; updates.closedAt = null; }
      const [deal] = await db.update(crmDeals).set(updates).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      return deal;
    }),
  /** @deprecated Use trpc.crm.deals.approveDealWon */
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
      const [updated] = await db.update(crmDeals).set({ wonApprovedAt: new Date(), wonApprovedBy: user!.id, wonApprovalTier: input.tier, updatedAt: new Date() }).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      return updated;
    }),
  /** @deprecated Use trpc.crm.deals.approvalThresholds */
  dealApprovalThresholds: router({
    get: permissionProcedure("accounts", "read").query(async ({ ctx }) => { const { org } = ctx; return getCrmDealApprovalThresholds(org!.settings); }),
    update: adminProcedure.input(z.object({ dealApprovalCurrency: z.string().length(3).transform((s) => s.toUpperCase()), dealCloseNoApprovalBelow: z.coerce.number().min(0).max(1e14), dealCloseExecutiveAbove: z.coerce.number().min(1).max(1e14) }))
      .mutation(async ({ ctx, input }) => {
        if (input.dealCloseExecutiveAbove <= input.dealCloseNoApprovalBelow) throw new TRPCError({ code: "BAD_REQUEST", message: "dealCloseExecutiveAbove must be greater than dealCloseNoApprovalBelow" });
        const { db, org } = ctx;
        const [row] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevCrm = (raw.crm as Record<string, unknown> | undefined) ?? {};
        const crm = { ...prevCrm, dealApprovalCurrency: input.dealApprovalCurrency, dealCloseNoApprovalBelow: input.dealCloseNoApprovalBelow, dealCloseExecutiveAbove: input.dealCloseExecutiveAbove };
        await db.update(organizations).set({ settings: { ...raw, crm } }).where(eq(organizations.id, org!.id));
        return { ok: true as const, ...input, previous: { dealApprovalCurrency: prevCrm.dealApprovalCurrency, dealCloseNoApprovalBelow: prevCrm.dealCloseNoApprovalBelow, dealCloseExecutiveAbove: prevCrm.dealCloseExecutiveAbove } };
      }),
  }),
  /** @deprecated Use trpc.crm.deals.get */
  getDeal: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deal] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id)));
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      return deal;
    }),
  /** @deprecated Use trpc.crm.deals.delete */
  /** @deprecated Use trpc.crm.deals.delete */
  deleteDeal: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [deal] = await db.delete(crmDeals).where(and(eq(crmDeals.id, input.id), eq(crmDeals.orgId, org!.id))).returning();
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      return { success: true };
    }),
  /** @deprecated Use trpc.crm.deals.update */
  updateDeal: permissionProcedure("accounts", "write")
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
      
      if (updates.value !== undefined || updates.probability !== undefined) {
        const value = updates.value !== undefined ? Number(updates.value) : Number(deal.value ?? 0);
        const probability = updates.probability !== undefined ? updates.probability : deal.probability;
        const weightedValue = String(value * (probability / 100));
        await db.update(crmDeals).set({ weightedValue }).where(eq(crmDeals.id, id));
      }
      
      return deal;
    }),

  // ── Leads ─────────────────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.leads.list */
  listLeads: permissionProcedure("accounts", "read")
    .input(z.object({ status: z.enum(leadStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmLeads.orgId, org!.id), eq(crmLeads.archived, input.showArchived)];
      if (input.status) conditions.push(eq(crmLeads.status, input.status));
      return db.select().from(crmLeads).where(and(...conditions)).orderBy(desc(crmLeads.score)).limit(input.limit);
    }),
  /** @deprecated Use trpc.crm.leads.create */
  createLead: permissionProcedure("accounts", "write")
    .input(z.object({ firstName: z.string(), lastName: z.string(), email: z.string().email(), phone: z.string(), company: z.string().optional(), title: z.string().optional(), source: z.enum(leadSourceEnum.enumValues).default("website") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      // G5 — score persisted on write via the shared scoring config resolver.
      return createScoredLead(db, { orgId: org!.id, ownerId: user!.id, ...input });
    }),
  /** @deprecated Use trpc.crm.leads.update */
  updateLead: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(), company: z.string().optional(), title: z.string().optional(), status: z.enum(["new", "contacted", "qualified", "disqualified", "converted"]).optional(), archived: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...patch } = input;
      // G5 — re-score on write so a status/title/source change updates the score.
      return updateScoredLead(db, org!.id, id, patch);
    }),
  /** @deprecated Use trpc.crm.leads.convert */
  convertLead: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), dealTitle: z.string(), dealValue: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      // G6 — lossless conversion (see lib/crm/lead-convert). Runs in one tx so
      // account/contact upsert + deal + lead flag commit atomically.
      return await db.transaction((tx) =>
        convertLeadToDeal(tx, {
          leadId: input.id,
          orgId: org!.id,
          actorId: user!.id,
          dealTitle: input.dealTitle,
          dealValue: input.dealValue,
        }),
      );
    }),

  // ── Activities ─────────────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.activities.list */
  listActivities: permissionProcedure("accounts", "read")
    .input(z.object({ dealId: z.string().uuid().optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmActivities.orgId, org!.id), eq(crmActivities.archived, input.showArchived)];
      if (input.dealId) conditions.push(eq(crmActivities.dealId, input.dealId));
      return db.select().from(crmActivities).where(and(...conditions)).orderBy(desc(crmActivities.createdAt)).limit(input.limit);
    }),
  /** @deprecated Use trpc.crm.activities.create */
  createActivity: permissionProcedure("accounts", "write")
    .input(z.object({
      type: activityTypeSchema.optional(),
      subject: z.string().optional(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      outcome: z.string().optional(),
      scheduledAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      completedAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [activity] = await db.insert(crmActivities).values({ 
        orgId: org!.id, 
        ...input, 
        ownerId: user!.id, 
        type: input.type || "call",
        subject: input.subject || "Logged Activity",
      }).returning();
      return activity;
    }),
  /** @deprecated Use trpc.crm.activities.update */
  updateActivity: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      type: activityTypeSchema.optional(),
      subject: z.string().optional(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      outcome: z.string().optional(),
      scheduledAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      completedAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      archived: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [activity] = await db.update(crmActivities)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(crmActivities.id, id), eq(crmActivities.orgId, org!.id)))
        .returning();
      return activity;
    }),

  // ── Quotes ────────────────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.deals.quotes.list */
  listQuotes: permissionProcedure("accounts", "read")
    .input(z.object({ dealId: z.string().uuid().optional(), status: z.enum(quoteStatusEnum.enumValues).optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmQuotes.orgId, org!.id)];
      if (input.dealId) conditions.push(eq(crmQuotes.dealId, input.dealId));
      if (input.status) conditions.push(eq(crmQuotes.status, input.status));
      const rows = await db.select().from(crmQuotes).where(and(...conditions)).orderBy(desc(crmQuotes.createdAt));
      return rows.map(serializeQuote);
    }),
  /** @deprecated Use trpc.crm.deals.quotes.create */
  createQuote: permissionProcedure("accounts", "write")
    .input(z.object({ dealId: z.string().uuid().optional(), items: z.array(z.object({ description: z.string(), quantity: z.coerce.number(), unitPrice: z.string(), total: z.string(), hsnCode: z.string().optional(), gstRate: z.number().optional() })).default([]), discountPct: z.string().default("0"), validUntil: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const quoteNumber = await getNextNumber(db, org!.id, "QT");
      // G7 — GST computed via the shared quote-tax helper (discount before tax).
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
  /** @deprecated Use trpc.crm.deals.quotes.update */
  updateQuote: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), status: z.enum(quoteStatusEnum.enumValues).optional(), notes: z.string().optional(), items: z.array(z.object({ description: z.string(), quantity: z.coerce.number(), unitPrice: z.string(), total: z.string(), hsnCode: z.string().optional(), gstRate: z.number().optional() })).optional(), discountPct: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, items, discountPct, ...data } = input;
      const [existing] = await db.select().from(crmQuotes).where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const patch: Partial<typeof crmQuotes.$inferInsert> = { ...data, updatedAt: new Date() };
      if (items !== undefined || discountPct !== undefined) {
        const nextItems = (items ?? existing.items ?? []) as QuoteLine[];
        const nextDiscount = discountPct ?? existing.discountPct ?? "0";
        const tax = await buildQuoteTaxColumns(db, { orgId: org!.id, dealId: existing.dealId, items: nextItems, discountPct: nextDiscount });
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
      const [quote] = await db.update(crmQuotes).set(patch).where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, org!.id))).returning();
      return serializeQuote(quote!);
    }),

  // ── Dashboard Metrics ──────────────────────────────────────────────────────
  /** @deprecated Use trpc.crm.dashboard.metrics */
  dashboardMetrics: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    const summary = await getCrmExecutiveSummary(ctx.db, ctx.org!.id);
    return { openPipeline: summary.openPipeline, closedWon: summary.closedWon, newLeads: summary.newLeads };
  }),
  /** @deprecated Use trpc.crm.dashboard.executiveSummary */
  executiveSummary: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    return getCrmExecutiveSummary(ctx.db, ctx.org!.id);
  }),
});
