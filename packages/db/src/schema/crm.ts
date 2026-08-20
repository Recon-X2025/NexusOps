import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const accountTierEnum = pgEnum("account_tier", ["enterprise", "mid_market", "smb"]);

export const contactSeniorityEnum = pgEnum("contact_seniority", [
  "c_level",
  "vp",
  "director",
  "manager",
  "individual_contributor",
]);

export const dealStageEnum = pgEnum("deal_stage", [
  "prospect",
  "qualification",
  "proposal",
  "negotiation",
  "verbal_commit",
  "closed_won",
  "closed_lost",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "website",
  "referral",
  "event",
  "cold_outreach",
  "partner",
  "advertising",
  "other",
]);

/**
 * BANT qualification. Each dimension is an ENUM BAND rather than a number because
 * `computeLeadScore` scores by keyed lookup into Record<string, number> weight maps
 * and has no numeric-threshold concept — a band keys straight into a weight table
 * without restructuring the scoring config. The precise money lives separately in
 * `estimatedValue`; `budgetBand` is the scoreable half.
 *
 * Every band includes "unknown" and defaults to it: a lead captured from a web form
 * has none of this and must still save.
 */
export const leadBudgetBandEnum = pgEnum("lead_budget_band", [
  "under_1l",
  "1l_5l",
  "5l_25l",
  "over_25l",
  "unknown",
]);

export const leadAuthorityEnum = pgEnum("lead_authority", [
  "decision_maker",
  "influencer",
  "evaluator",
  "unknown",
]);

export const leadTimelineEnum = pgEnum("lead_timeline", [
  "immediate",
  "this_quarter",
  "next_quarter",
  "later",
  "unknown",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "converted",
  "disqualified",
]);

export const activityTypeEnum = pgEnum("crm_activity_type", [
  "call",
  "email",
  "meeting",
  "demo",
  "follow_up",
  "note",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
]);

// ── CRM Accounts ───────────────────────────────────────────────────────────
export const crmAccounts = pgTable(
  "crm_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    tier: accountTierEnum("tier").notNull().default("smb"),
    healthScore: integer("health_score").default(70),
    annualRevenue: decimal("annual_revenue", { precision: 16, scale: 2 }),
    website: text("website"),
    billingAddress: text("billing_address"),
    creditLimit: decimal("credit_limit", { precision: 14, scale: 2 }),
    /** G7: GST place-of-supply state for this customer (drives intra vs inter-state on quotes). */
    stateCode: text("state_code"),
    /** G7: customer GSTIN (for B2B quotes / eventual invoice conversion). */
    gstin: text("gstin"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_accounts_org_idx").on(t.orgId),
    ownerIdx: index("crm_accounts_owner_idx").on(t.ownerId),
  }),
);

// ── CRM Contacts ───────────────────────────────────────────────────────────
export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    seniority: contactSeniorityEnum("seniority"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_contacts_org_idx").on(t.orgId),
    accountIdx: index("crm_contacts_account_idx").on(t.accountId),
  }),
);

// ── CRM Deals ──────────────────────────────────────────────────────────────
export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    accountId: uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    stage: dealStageEnum("stage").notNull().default("prospect"),
    value: decimal("value", { precision: 14, scale: 2 }),
    probability: integer("probability").notNull().default(10),
    weightedValue: decimal("weighted_value", { precision: 14, scale: 2 }),
    expectedClose: timestamp("expected_close", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lostReason: text("lost_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** US-CRM-003: set when leadership records approval before closed_won for gated deal values. */
    wonApprovedAt: timestamp("won_approved_at", { withTimezone: true }),
    wonApprovedBy: uuid("won_approved_by").references(() => users.id, { onDelete: "set null" }),
    wonApprovalTier: text("won_approval_tier"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_deals_org_idx").on(t.orgId),
    stageIdx: index("crm_deals_stage_idx").on(t.orgId, t.stage),
    ownerIdx: index("crm_deals_owner_idx").on(t.ownerId),
  }),
);

// ── CRM Leads ──────────────────────────────────────────────────────────────
export const crmLeads = pgTable(
  "crm_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    company: text("company"),
    source: leadSourceEnum("source").notNull().default("website"),
    score: integer("score").notNull().default(0),
    status: leadStatusEnum("status").notNull().default("new"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** G6: account/contact upserted on conversion so no company/person is dropped. */
    accountId: uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    convertedDealId: uuid("converted_deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    notes: text("notes"),
    // ── Qualification (BANT) + opportunity shape ──────────────────────────
    // The lead was a contact record: every column described WHO the person is,
    // none what they might buy, what it is worth, or when. These are the sales
    // half. All optional — a web-form lead arrives with none of them.
    budgetBand: leadBudgetBandEnum("budget_band").notNull().default("unknown"),
    /** Free-text detail behind the band ("approved capex, needs CFO sign-off"). */
    budgetNote: text("budget_note"),
    authority: leadAuthorityEnum("authority").notNull().default("unknown"),
    /** What problem they are trying to solve. Qualitative by nature — scored on presence. */
    need: text("need"),
    timeline: leadTimelineEnum("timeline").notNull().default("unknown"),
    /** Same precision/scale as crmDeals.value — carried onto the deal on conversion. */
    estimatedValue: decimal("estimated_value", { precision: 14, scale: 2 }),
    /** Mirrors crmDeals.expectedClose — carried onto the deal on conversion. */
    expectedClose: timestamp("expected_close", { withTimezone: true }),
    /** What the rep does next, and when. A lead with no next action is a stalled lead. */
    nextAction: text("next_action"),
    nextActionDate: timestamp("next_action_date", { withTimezone: true }),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_leads_org_idx").on(t.orgId),
    statusIdx: index("crm_leads_status_idx").on(t.orgId, t.status),
  }),
);

// ── CRM Activities ─────────────────────────────────────────────────────────
export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    type: activityTypeEnum("type").notNull().default("note"),
    subject: text("subject").notNull(),
    description: text("description"),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    // A lead could not have a logged call, note or follow-up — so the Leads list's
    // "Last Activity" column was empty by construction. Same FK + index shape as dealId.
    leadId: uuid("lead_id").references(() => crmLeads.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    outcome: text("outcome"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_activities_org_idx").on(t.orgId),
    dealIdx: index("crm_activities_deal_idx").on(t.dealId),
    leadIdx: index("crm_activities_lead_idx").on(t.leadId),
    ownerIdx: index("crm_activities_owner_idx").on(t.ownerId),
    /*
     * account and contact are filterable on `crm.activities.list` (they always
     * were columns; the input schema silently stripped them until 2026-08-19),
     * so they need the same index treatment deal and lead already have.
     * Measured at 120k activities across 50 accounts: without the account index
     * the planner scans via org_idx and filters — 12.8 ms; with it, a bitmap AND
     * of account_idx + org_idx — 3.0 ms. ~4.2x.
     */
    accountIdx: index("crm_activities_account_idx").on(t.accountId),
    contactIdx: index("crm_activities_contact_idx").on(t.contactId),
  }),
);

// ── CRM Quotes ─────────────────────────────────────────────────────────────
export const crmQuotes = pgTable(
  "crm_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    quoteNumber: text("quote_number").notNull(),
    status: quoteStatusEnum("status").notNull().default("draft"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    /**
     * `discountPct` here is the PER-LINE discount, already folded into that
     * line's `total` (so subtotal is net of line discounts and the header
     * `discountPct` below applies on top). It is stored rather than only
     * applied because the quote detail view has a "Discount %" column: without
     * the field that column could only ever render 0, which is what it did.
     */
    items: jsonb("items").$type<Array<{ description: string; quantity: number; unitPrice: string; total: string; hsnCode?: string; gstRate?: number; discountPct?: number }>>().default([]),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountPct: decimal("discount_pct", { precision: 5, scale: 2 }).default("0"),
    /** G7: GST — place of supply + intra/inter split, computed on the discounted taxable value. */
    placeOfSupply: text("place_of_supply"),
    isInterstate: boolean("is_interstate").notNull().default(false),
    taxableValue: decimal("taxable_value", { precision: 14, scale: 2 }).notNull().default("0"),
    cgstAmount: decimal("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    sgstAmount: decimal("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    igstAmount: decimal("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: decimal("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
    total: decimal("total", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("crm_quotes_org_number_idx").on(t.orgId, t.quoteNumber),
    orgIdx: index("crm_quotes_org_idx").on(t.orgId),
    dealIdx: index("crm_quotes_deal_idx").on(t.dealId),
  }),
);

// ── CRM Deal Stage History ─────────────────────────────────────────────────
/**
 * Every stage TRANSITION a deal makes, appended forward from the day this
 * lands.
 *
 * `crm_deals.stage` records the CURRENT stage and nothing else — no prior
 * stage, no timestamp of the move, no actor. Nothing anywhere else records it
 * either, so time-in-stage, stage ageing and conversion-between-stages are all
 * uncomputable today, not merely unreported. Stage history can only ever
 * accumulate FORWARD, which is the whole argument for starting the record now
 * rather than when a screen wants it.
 *
 * THE TABLE STARTS EMPTY AND IS NOT BACKFILLED. There is nothing to backfill
 * from — the prior stage of an existing deal is not recoverable from any column
 * — and inventing a history is worse than having none, because a fabricated
 * first transition would be indistinguishable from a real one in every metric
 * computed off this table later.
 *
 * Written at BOTH transition sites: the canonical `crm.deals.movePipeline` and
 * the deprecated flat `crm.movePipeline`. Writing from only the canonical one
 * would silently miss every move made through the twin — the exact drift that
 * has bitten this module before. Deal CREATION is deliberately not recorded
 * here: an opening stage is not a transition, `fromStage` would have to be
 * invented, and `crm_deals.createdAt` already carries when the deal appeared.
 *
 * Carries `org_id` and is RLS-walled in the same migration, per the 0052/0061
 * convention. A child table with no `org_id` is the class every leak in the
 * isolation audit belongs to.
 */
export const crmDealStageHistory = pgTable(
  "crm_deal_stage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").notNull().references(() => crmDeals.id, { onDelete: "cascade" }),
    /**
     * The stage the deal was in before the move.
     *
     * NOT NULL: this table records transitions only, and a transition always has
     * a side it came from. A nullable `fromStage` would be the seam through
     * which a fabricated "created" row could enter.
     */
    fromStage: dealStageEnum("from_stage").notNull(),
    toStage: dealStageEnum("to_stage").notNull(),
    /**
     * Nullable actor reference -> SET NULL, per the repo-wide FK policy. The
     * history of what happened to a deal must survive the departure of the
     * person who did it.
     */
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_deal_stage_history_org_idx").on(t.orgId),
    /* The query this table exists for is "this deal, in order". */
    dealChangedIdx: index("crm_deal_stage_history_deal_changed_idx").on(t.dealId, t.changedAt),
  }),
);

// ── CRM Pipeline Stages (per-org config) ───────────────────────────────────
// Per-org presentation/config layer over the canonical `deal_stage` enum.
// `key` MUST be one of the dealStageEnum values; this table lets an org rename,
// recolour, reorder, and show/hide stages without altering the underlying enum
// or the movePipeline/approval logic which keys off the enum value.
export const crmPipelineStages = pgTable(
  "crm_pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    key: dealStageEnum("key").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull().default("text-muted-foreground bg-muted"),
    rank: integer("rank").notNull().default(0),
    /** Whether this stage is shown as an active kanban column (closed stages are typically hidden). */
    active: boolean("active").notNull().default(true),
    /**
     * Default close probability for deals AT this stage, 0–100.
     *
     * Lives here rather than in a second config home because this table already
     * exists for exactly this: per-tenant configuration layered over the fixed
     * `deal_stage` enum. It is a DEFAULT the New Deal form pre-fills, never a
     * lock — `crm_deals.probability` remains per-deal and rep-editable, and
     * moving a deal between stages does NOT rewrite it.
     *
     * The column default of 10 matches `crm_deals.probability`'s own default
     * (= prospect); migration 0089 backfills the real per-stage values so no
     * existing tenant is left with a flat 10 across every stage.
     */
    probability: integer("probability").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgKeyIdx: uniqueIndex("crm_pipeline_stages_org_key_idx").on(t.orgId, t.key),
    orgRankIdx: index("crm_pipeline_stages_org_rank_idx").on(t.orgId, t.rank),
  }),
);

// ── Lead Scoring Rules (versioned, per-org config) ─────────────────────────
// G5 — versioned weight table for computing `crm_leads.score`. Mirrors the
// statutory-ceilings pattern: a platform default row (orgId NULL) provides the
// baseline; an org-scoped row overrides it; within a scope the latest
// `effectiveFrom` (where effectiveFrom <= now < effectiveTo) wins. When no row
// resolves, the scorer falls back to built-in default weights so behaviour is
// deterministic even on a fresh install.
export const leadScoringRules = pgTable(
  "lead_scoring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    /** Full weight table: source/title/status weights + completeness bonuses + cap. */
    config: jsonb("config")
      .$type<{
        sourceWeights?: Record<string, number>;
        // BANT weights (Round 9a). Optional like every other key, so a row written
        // before they existed still parses and the loader falls back to defaults.
        budgetWeights?: Record<string, number>;
        authorityWeights?: Record<string, number>;
        timelineWeights?: Record<string, number>;
        hasNeed?: number;
        statusWeights?: Record<string, number>;
        titleWeights?: Record<string, number>;
        hasEmail?: number;
        hasPhone?: number;
        hasCompany?: number;
        maxScore?: number;
      }>()
      .notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index("lead_scoring_rules_lookup_idx").on(t.orgId, t.effectiveFrom),
  }),
);

export const crmAccountsRelations = relations(crmAccounts, ({ one, many }) => ({
  org: one(organizations, { fields: [crmAccounts.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [crmAccounts.ownerId], references: [users.id] }),
  contacts: many(crmContacts),
  deals: many(crmDeals),
}));

export const crmDealsRelations = relations(crmDeals, ({ one, many }) => ({
  org: one(organizations, { fields: [crmDeals.orgId], references: [organizations.id] }),
  account: one(crmAccounts, { fields: [crmDeals.accountId], references: [crmAccounts.id] }),
  contact: one(crmContacts, { fields: [crmDeals.contactId], references: [crmContacts.id] }),
  owner: one(users, { fields: [crmDeals.ownerId], references: [users.id] }),
  activities: many(crmActivities),
  quotes: many(crmQuotes),
}));
