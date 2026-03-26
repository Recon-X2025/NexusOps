import {
  boolean,
  decimal,
  index,
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

// ── Enums ──────────────────────────────────────────────────────────────────
export const assetStatusEnum = pgEnum("asset_status", [
  "in_stock",
  "deployed",
  "maintenance",
  "retired",
  "disposed",
]);

export const ciTypeEnum = pgEnum("ci_type", [
  "server",
  "application",
  "database",
  "network",
  "service",
  "cloud",
]);

export const ciStatusEnum = pgEnum("ci_status", [
  "operational",
  "degraded",
  "down",
  "planned",
]);

export const ciRelationTypeEnum = pgEnum("ci_relation_type", [
  "depends_on",
  "runs_on",
  "connected_to",
  "member_of",
  "hosts",
]);

export const licenseTypeEnum = pgEnum("license_type", [
  "per_seat",
  "device",
  "site",
  "enterprise",
]);

// ── Asset Types ────────────────────────────────────────────────────────────
export const assetTypes = pgTable(
  "asset_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    fieldsSchema: jsonb("fields_schema").$type<Array<{
      key: string;
      label: string;
      type: "text" | "number" | "date" | "boolean" | "select";
      required: boolean;
      options?: string[];
    }>>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("asset_types_org_idx").on(t.orgId),
  }),
);

// ── Assets ─────────────────────────────────────────────────────────────────
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetTag: text("asset_tag").notNull(), // AST-0001
    name: text("name").notNull(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => assetTypes.id),
    status: assetStatusEnum("status").notNull().default("in_stock"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    location: text("location"),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }),
    purchaseCost: decimal("purchase_cost", { precision: 12, scale: 2 }),
    warrantyExpiry: timestamp("warranty_expiry", { withTimezone: true }),
    vendor: text("vendor"),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    parentAssetId: uuid("parent_asset_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgTagIdx: uniqueIndex("assets_org_tag_idx").on(t.orgId, t.assetTag),
    orgIdx: index("assets_org_idx").on(t.orgId),
    ownerIdx: index("assets_owner_idx").on(t.ownerId),
    statusIdx: index("assets_status_idx").on(t.status),
  }),
);

// ── Asset History ──────────────────────────────────────────────────────────
export const assetHistory = pgTable(
  "asset_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assetIdx: index("asset_history_asset_idx").on(t.assetId),
  }),
);

// ── CI Items (CMDB) ────────────────────────────────────────────────────────
export const ciItems = pgTable(
  "ci_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ciType: ciTypeEnum("ci_type").notNull(),
    status: ciStatusEnum("status").notNull().default("operational"),
    environment: text("environment"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("ci_items_org_idx").on(t.orgId),
    typeIdx: index("ci_items_type_idx").on(t.ciType),
  }),
);

// ── CI Relationships ───────────────────────────────────────────────────────
export const ciRelationships = pgTable(
  "ci_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => ciItems.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => ciItems.id, { onDelete: "cascade" }),
    relationType: ciRelationTypeEnum("relation_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index("ci_relationships_source_idx").on(t.sourceId),
    targetIdx: index("ci_relationships_target_idx").on(t.targetId),
  }),
);

// ── Software Licenses ──────────────────────────────────────────────────────
export const softwareLicenses = pgTable(
  "software_licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vendor: text("vendor"),
    type: licenseTypeEnum("type").notNull(),
    totalSeats: decimal("total_seats", { precision: 10, scale: 0 }),
    cost: decimal("cost", { precision: 12, scale: 2 }),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("software_licenses_org_idx").on(t.orgId),
  }),
);

// ── License Assignments ────────────────────────────────────────────────────
export const licenseAssignments = pgTable(
  "license_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => softwareLicenses.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    licenseIdx: index("license_assignments_license_idx").on(t.licenseId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const assetsRelations = relations(assets, ({ one, many }) => ({
  org: one(organizations, { fields: [assets.orgId], references: [organizations.id] }),
  type: one(assetTypes, { fields: [assets.typeId], references: [assetTypes.id] }),
  owner: one(users, { fields: [assets.ownerId], references: [users.id] }),
  history: many(assetHistory),
  licenseAssignments: many(licenseAssignments),
}));

export const ciItemsRelations = relations(ciItems, ({ one, many }) => ({
  org: one(organizations, { fields: [ciItems.orgId], references: [organizations.id] }),
  outgoing: many(ciRelationships, { relationName: "source" }),
  incoming: many(ciRelationships, { relationName: "target" }),
}));
