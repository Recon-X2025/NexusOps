import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";

// ── Budget Lines ───────────────────────────────────────────────────────────
export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    department: text("department"),
    fiscalYear: integer("fiscal_year").notNull(),
    budgeted: decimal("budgeted", { precision: 14, scale: 2 }).notNull().default("0"),
    committed: decimal("committed", { precision: 14, scale: 2 }).notNull().default("0"),
    actual: decimal("actual", { precision: 14, scale: 2 }).notNull().default("0"),
    forecast: decimal("forecast", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("budget_lines_org_idx").on(t.orgId),
    yearIdx: index("budget_lines_year_idx").on(t.orgId, t.fiscalYear),
  }),
);

// ── Chargebacks ────────────────────────────────────────────────────────────
export const chargebacks = pgTable(
  "chargebacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    department: text("department").notNull(),
    service: text("service").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    periodMonth: integer("period_month").notNull(),
    periodYear: integer("period_year").notNull(),
    allocationMethod: text("allocation_method"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("chargebacks_org_idx").on(t.orgId),
    periodIdx: index("chargebacks_period_idx").on(t.orgId, t.periodYear, t.periodMonth),
  }),
);

export const budgetLinesRelations = relations(budgetLines, ({ one }) => ({
  org: one(organizations, { fields: [budgetLines.orgId], references: [organizations.id] }),
}));
