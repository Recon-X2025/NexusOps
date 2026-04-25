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

export const contractTypeEnum = pgEnum("contract_type", [
  "nda",
  "msa",
  "sow",
  "license",
  "customer_agreement",
  "sla_support",
  "colocation",
  "employment",
  "vendor",
  "partnership",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "under_review",
  "legal_review",
  "awaiting_signature",
  "active",
  "expiring_soon",
  "expired",
  "terminated",
]);

export const obligationFrequencyEnum = pgEnum("obligation_frequency", [
  "one_time",
  "monthly",
  "quarterly",
  "annually",
  "ongoing",
]);

export const obligationStatusEnum = pgEnum("obligation_status", [
  "pending",
  "compliant",
  "overdue",
  "completed",
]);

/** Wizard / audit payload persisted in contracts.clauses (jsonb) */
export type ContractStoredClause = {
  id: string;
  title: string;
  body: string;
  isEnabled: boolean;
  fieldValues: Record<string, string | number>;
  wasModified: boolean;
};

// ── Contracts ──────────────────────────────────────────────────────────────
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    contractNumber: text("contract_number").notNull(),
    title: text("title").notNull(),
    counterparty: text("counterparty").notNull(),
    type: contractTypeEnum("type").notNull().default("vendor"),
    status: contractStatusEnum("status").notNull().default("draft"),
    value: decimal("value", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    autoRenew: boolean("auto_renew").notNull().default(false),
    noticePeriodDays: integer("notice_period_days").default(30),
    governingLaw: text("governing_law"),
    internalOwnerId: uuid("internal_owner_id").references(() => users.id, { onDelete: "set null" }),
    legalOwnerId: uuid("legal_owner_id").references(() => users.id, { onDelete: "set null" }),
    clauses: jsonb("clauses").$type<ContractStoredClause[]>().default([]),
    amendments: jsonb("amendments").$type<Array<{ date: string; description: string; changedBy: string }>>().default([]),
    notes: text("notes"),
    executionDate: timestamp("execution_date", { withTimezone: true }),
    stampDutyStatus: text("stamp_duty_status"),
    registrationStatus: text("registration_status"),
    registrationDueAt: timestamp("registration_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("contracts_org_number_idx").on(t.orgId, t.contractNumber),
    orgIdx: index("contracts_org_idx").on(t.orgId),
    statusIdx: index("contracts_status_idx").on(t.orgId, t.status),
    endDateIdx: index("contracts_end_date_idx").on(t.endDate),
  }),
);

// ── Contract Obligations ───────────────────────────────────────────────────
export const contractObligations = pgTable(
  "contract_obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    party: text("party"),
    frequency: obligationFrequencyEnum("frequency").notNull().default("one_time"),
    status: obligationStatusEnum("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contractIdx: index("contract_obligations_contract_idx").on(t.contractId),
    statusIdx: index("contract_obligations_status_idx").on(t.status),
  }),
);

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  org: one(organizations, { fields: [contracts.orgId], references: [organizations.id] }),
  internalOwner: one(users, { fields: [contracts.internalOwnerId], references: [users.id], relationName: "c_internal_owner" }),
  legalOwner: one(users, { fields: [contracts.legalOwnerId], references: [users.id], relationName: "c_legal_owner" }),
  obligations: many(contractObligations),
}));
