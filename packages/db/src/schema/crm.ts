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
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
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
    company: text("company"),
    source: leadSourceEnum("source").notNull().default("website"),
    score: integer("score").notNull().default(0),
    status: leadStatusEnum("status").notNull().default("new"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    convertedDealId: uuid("converted_deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    notes: text("notes"),
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
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    outcome: text("outcome"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("crm_activities_org_idx").on(t.orgId),
    dealIdx: index("crm_activities_deal_idx").on(t.dealId),
    ownerIdx: index("crm_activities_owner_idx").on(t.ownerId),
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
    items: jsonb("items").$type<Array<{ description: string; quantity: number; unitPrice: string; total: string }>>().default([]),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountPct: decimal("discount_pct", { precision: 5, scale: 2 }).default("0"),
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
