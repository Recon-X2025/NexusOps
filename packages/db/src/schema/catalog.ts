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
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const catalogItemStatusEnum = pgEnum("catalog_item_status", [
  "active",
  "inactive",
  "retired",
]);

export const catalogRequestStatusEnum = pgEnum("catalog_request_status", [
  "submitted",
  "pending_approval",
  "approved",
  "fulfilling",
  "completed",
  "rejected",
  "cancelled",
]);

// ── Catalog Items ──────────────────────────────────────────────────────────
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    icon: text("icon"),
    price: decimal("price", { precision: 10, scale: 2 }),
    approvalRequired: boolean("approval_required").notNull().default(false),
    formFields: jsonb("form_fields").$type<Array<{ id: string; label: string; type: string; required: boolean; options?: string[] }>>().default([]),
    fulfillmentGroup: text("fulfillment_group"),
    slaDays: integer("sla_days").default(3),
    status: catalogItemStatusEnum("status").notNull().default("active"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("catalog_items_org_idx").on(t.orgId),
    statusIdx: index("catalog_items_status_idx").on(t.orgId, t.status),
    categoryIdx: index("catalog_items_category_idx").on(t.orgId, t.category),
  }),
);

// ── Catalog Requests ───────────────────────────────────────────────────────
export const catalogRequests = pgTable(
  "catalog_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => catalogItems.id),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    formData: jsonb("form_data").$type<Record<string, unknown>>().default({}),
    status: catalogRequestStatusEnum("status").notNull().default("submitted"),
    fulfillerId: uuid("fulfiller_id").references(() => users.id, { onDelete: "set null" }),
    approvalId: uuid("approval_id"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("catalog_requests_org_idx").on(t.orgId),
    statusIdx: index("catalog_requests_status_idx").on(t.orgId, t.status),
    requesterIdx: index("catalog_requests_requester_idx").on(t.requesterId),
  }),
);

export const catalogItemsRelations = relations(catalogItems, ({ one, many }) => ({
  org: one(organizations, { fields: [catalogItems.orgId], references: [organizations.id] }),
  requests: many(catalogRequests),
}));

export const catalogRequestsRelations = relations(catalogRequests, ({ one }) => ({
  org: one(organizations, { fields: [catalogRequests.orgId], references: [organizations.id] }),
  item: one(catalogItems, { fields: [catalogRequests.itemId], references: [catalogItems.id] }),
  requester: one(users, { fields: [catalogRequests.requesterId], references: [users.id], relationName: "cr_requester" }),
  fulfiller: one(users, { fields: [catalogRequests.fulfillerId], references: [users.id], relationName: "cr_fulfiller" }),
}));
