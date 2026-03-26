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
import { assetTypes } from "./assets";

// ── Enums ──────────────────────────────────────────────────────────────────
export const prStatusEnum = pgEnum("pr_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
  "ordered",
  "received",
  "closed",
]);

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "sent",
  "acknowledged",
  "partially_received",
  "received",
  "invoiced",
  "paid",
  "cancelled",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "approved",
  "paid",
  "overdue",
  "disputed",
]);

// ── Vendors ────────────────────────────────────────────────────────────────
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    paymentTerms: text("payment_terms"),
    status: text("status").notNull().default("active"),
    rating: decimal("rating", { precision: 3, scale: 1 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("vendors_org_idx").on(t.orgId),
  }),
);

// ── Purchase Requests ──────────────────────────────────────────────────────
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // PR-0001
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    justification: text("justification"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    status: prStatusEnum("status").notNull().default("draft"),
    priority: text("priority").notNull().default("medium"),
    department: text("department"),
    budgetCode: text("budget_code"),
    currentApproverId: uuid("current_approver_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("purchase_requests_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("purchase_requests_org_idx").on(t.orgId),
    statusIdx: index("purchase_requests_status_idx").on(t.status),
    idempotencyKeyIdx: index("purchase_requests_idempotency_key_idx").on(t.idempotencyKey),
  }),
);

// ── Purchase Request Items ─────────────────────────────────────────────────
export const purchaseRequestItems = pgTable(
  "purchase_request_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prId: uuid("pr_id")
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    assetTypeId: uuid("asset_type_id").references(() => assetTypes.id, { onDelete: "set null" }),
  },
  (t) => ({
    prIdx: index("purchase_request_items_pr_idx").on(t.prId),
  }),
);

// ── Purchase Orders ────────────────────────────────────────────────────────
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    poNumber: text("po_number").notNull(), // PO-0001
    prId: uuid("pr_id").references(() => purchaseRequests.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: poStatusEnum("status").notNull().default("draft"),
    expectedDelivery: timestamp("expected_delivery", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPoNumberIdx: uniqueIndex("purchase_orders_org_po_number_idx").on(t.orgId, t.poNumber),
    orgIdx: index("purchase_orders_org_idx").on(t.orgId),
  }),
);

// ── PO Line Items ──────────────────────────────────────────────────────────
export const poLineItems = pgTable(
  "po_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    receivedQuantity: integer("received_quantity").notNull().default(0),
  },
  (t) => ({
    poIdx: index("po_line_items_po_idx").on(t.poId),
  }),
);

// ── Invoices ───────────────────────────────────────────────────────────────
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    tax: decimal("tax", { precision: 12, scale: 2 }).default("0"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("invoices_org_idx").on(t.orgId),
    poIdx: index("invoices_po_idx").on(t.poId),
  }),
);

// ── Approval Chains ────────────────────────────────────────────────────────
export const approvalChains = pgTable(
  "approval_chains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // purchase_request | hr_case | etc
    name: text("name").notNull(),
    rules: jsonb("rules")
      .$type<Array<{
        condition: Record<string, unknown>;
        approvers: string[];
        threshold?: number;
        sequential: boolean;
      }>>()
      .notNull()
      .default([]),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("approval_chains_org_idx").on(t.orgId),
  }),
);

// ── Approval Requests ──────────────────────────────────────────────────────
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    approverId: uuid("approver_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    comment: text("comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("approval_requests_entity_idx").on(t.entityType, t.entityId),
    approverIdx: index("approval_requests_approver_idx").on(t.approverId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const purchaseRequestsRelations = relations(purchaseRequests, ({ one, many }) => ({
  org: one(organizations, { fields: [purchaseRequests.orgId], references: [organizations.id] }),
  requester: one(users, { fields: [purchaseRequests.requesterId], references: [users.id] }),
  items: many(purchaseRequestItems),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  org: one(organizations, { fields: [purchaseOrders.orgId], references: [organizations.id] }),
  vendor: one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
  lineItems: many(poLineItems),
  invoices: many(invoices),
}));
