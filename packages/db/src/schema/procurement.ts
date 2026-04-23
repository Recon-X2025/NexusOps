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
  "confirmed",
  "matched",
  "exception",
  "approved",
  "paid",
  "overdue",
  "disputed",
  "cancelled",
]);

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "tax_invoice",
  "credit_note",
  "debit_note",
  "proforma",
]);

export const tdsSectionEnum = pgEnum("tds_section", [
  "194C",
  "194J",
  "194I",
  "nil",
]);

export const grnStatusEnum = pgEnum("grn_status", [
  "draft",
  "submitted",
  "quality_pending",
  "accepted",
  "partial_acceptance",
  "rejected",
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
    vendorType: text("vendor_type").notNull().default("goods_supplier"),
    gstin: text("gstin"),
    pan: text("pan"),
    tdsSection: tdsSectionEnum("tds_section").notNull().default("nil"),
    tdsRate: decimal("tds_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    isMsme: boolean("is_msme").notNull().default(false),
    msmeUdyamNumber: text("msme_udyam_number"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactPersonName: text("contact_person_name"),
    address: text("address"),
    state: text("state"),
    paymentTerms: text("payment_terms"),
    status: text("status").notNull().default("active"),
    blacklistReason: text("blacklist_reason"),
    rating: decimal("rating", { precision: 3, scale: 1 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("vendors_org_idx").on(t.orgId),
    gstinIdx: index("vendors_gstin_idx").on(t.gstin),
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
    hsnSacCode: text("hsn_sac_code"),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
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
    poNumber: text("po_number").notNull(),
    prId: uuid("pr_id").references(() => purchaseRequests.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    vendorGstin: text("vendor_gstin"),
    deliveryAddress: text("delivery_address"),
    taxableValue: decimal("taxable_value", { precision: 14, scale: 2 }).notNull().default("0"),
    gstAmount: decimal("gst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
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
    hsnSacCode: text("hsn_sac_code"),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    taxableValue: decimal("taxable_value", { precision: 12, scale: 2 }).notNull().default("0"),
    gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
    cgstAmount: decimal("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    sgstAmount: decimal("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    igstAmount: decimal("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    acceptedQuantity: integer("accepted_quantity").notNull().default(0),
  },
  (t) => ({
    poIdx: index("po_line_items_po_idx").on(t.poId),
  }),
);

// ── Goods Receipt Notes ────────────────────────────────────────────────────
export const goodsReceiptNotes = pgTable(
  "goods_receipt_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    grnNumber: text("grn_number").notNull(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id),
    receivedById: uuid("received_by_id").references(() => users.id, { onDelete: "set null" }),
    vendorDeliveryChallan: text("vendor_delivery_challan"),
    status: grnStatusEnum("status").notNull().default("draft"),
    shortageNoted: boolean("shortage_noted").notNull().default(false),
    damageNoted: boolean("damage_noted").notNull().default(false),
    damageDescription: text("damage_description"),
    grnDate: timestamp("grn_date", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgGrnNumberIdx: uniqueIndex("grns_org_grn_number_idx").on(t.orgId, t.grnNumber),
    poIdx: index("grns_po_idx").on(t.poId),
  }),
);

// ── GRN Line Items ─────────────────────────────────────────────────────────
export const grnLineItems = pgTable(
  "grn_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnId: uuid("grn_id")
      .notNull()
      .references(() => goodsReceiptNotes.id, { onDelete: "cascade" }),
    poLineItemId: uuid("po_line_item_id").references(() => poLineItems.id, { onDelete: "set null" }),
    itemCode: text("item_code"),
    orderedQuantity: integer("ordered_quantity").notNull().default(0),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    acceptedQuantity: integer("accepted_quantity").notNull().default(0),
    rejectedQuantity: integer("rejected_quantity").notNull().default(0),
    rejectionReason: text("rejection_reason"),
  },
  (t) => ({
    grnIdx: index("grn_line_items_grn_idx").on(t.grnId),
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
    /** `payable` = vendor AP (default); `receivable` = customer AR when populated. */
    invoiceFlow: text("invoice_flow").notNull().default("payable"),
    invoiceType: invoiceTypeEnum("invoice_type").notNull().default("tax_invoice"),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    grnId: uuid("grn_id").references(() => goodsReceiptNotes.id, { onDelete: "set null" }),
    supplierGstin: text("supplier_gstin"),
    buyerGstin: text("buyer_gstin"),
    placeOfSupply: text("place_of_supply"),
    isInterstate: boolean("is_interstate").notNull().default(false),
    isReverseCharge: boolean("is_reverse_charge").notNull().default(false),
    taxableValue: decimal("taxable_value", { precision: 14, scale: 2 }).notNull().default("0"),
    cgstAmount: decimal("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    sgstAmount: decimal("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    igstAmount: decimal("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    totalTaxAmount: decimal("total_tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    tdsDeducted: decimal("tds_deducted", { precision: 12, scale: 2 }).notNull().default("0"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    matchingStatus: text("matching_status").notNull().default("pending"),
    eInvoiceIrn: text("e_invoice_irn"),
    eInvoiceAckNumber: text("e_invoice_ack_number"),
    eInvoiceAckDate: timestamp("e_invoice_ack_date", { withTimezone: true }),
    ewayBillNumber: text("eway_bill_number"),
    originalInvoiceNumber: text("original_invoice_number"),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull().defaultNow(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgInvoiceNumberIdx: uniqueIndex("invoices_org_invoice_number_idx").on(t.orgId, t.invoiceNumber),
    orgIdx: index("invoices_org_idx").on(t.orgId),
    orgFlowIdx: index("invoices_org_flow_idx").on(t.orgId, t.invoiceFlow),
    poIdx: index("invoices_po_idx").on(t.poId),
    statusIdx: index("invoices_status_idx").on(t.status),
  }),
);

// ── Invoice Line Items ─────────────────────────────────────────────────────
export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    lineItemNumber: integer("line_item_number").notNull(),
    description: text("description").notNull(),
    hsnSacCode: text("hsn_sac_code"),
    quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unit: text("unit"),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    taxableValue: decimal("taxable_value", { precision: 12, scale: 2 }).notNull().default("0"),
    gstRate: decimal("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
    cgstAmount: decimal("cgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    sgstAmount: decimal("sgst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    igstAmount: decimal("igst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  },
  (t) => ({
    invoiceIdx: index("invoice_line_items_invoice_idx").on(t.invoiceId),
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
    requesterId: uuid("requester_id").references(() => users.id),
    title: text("title"),
    description: text("description"),
    type: text("type").default("change"), // change | service_request | work_order | purchase | access
    priority: text("priority").default("normal"), // urgent | high | normal
    dueDate: timestamp("due_date", { withTimezone: true }),
    amount: text("amount"),
    requestNumber: text("request_number"),
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
  goodsReceiptNotes: many(goodsReceiptNotes),
}));

export const goodsReceiptNotesRelations = relations(goodsReceiptNotes, ({ one, many }) => ({
  po: one(purchaseOrders, { fields: [goodsReceiptNotes.poId], references: [purchaseOrders.id] }),
  lineItems: many(grnLineItems),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  org: one(organizations, { fields: [invoices.orgId], references: [organizations.id] }),
  vendor: one(vendors, { fields: [invoices.vendorId], references: [vendors.id] }),
  po: one(purchaseOrders, { fields: [invoices.poId], references: [purchaseOrders.id] }),
  grn: one(goodsReceiptNotes, { fields: [invoices.grnId], references: [goodsReceiptNotes.id] }),
  lineItems: many(invoiceLineItems),
}));
